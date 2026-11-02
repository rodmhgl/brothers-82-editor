import { readMessage } from '../../model/pedalReading';
import { isToggleSlot } from '../../model/slots';
import { defaultPedalState, defaultWorkingState, withHiddenOptionsReset, type PedalState, type WorkingState } from '../../model/state';
import { decode } from '../decode';
import type { MidiMessage } from '../encode';
import { DEFAULT_MIDI_CHANNEL, PARAMS, isOn, isRampingEngaged, settingLabel, type ParamDef, type PresetParamId } from '../map';
import type { MidiPort, MidiTransport } from './types';

export const VIRTUAL_PEDAL_PORT: MidiPort = { id: 'virtual-pedal', name: 'Virtual Pedal' };

export type LogEntry = { id: number; text: string };

export type VirtualPedalSnapshot = { state: PedalState; midiChannel: number; log: LogEntry[] };

export interface VirtualPedal extends MidiTransport {
  getSnapshot(): VirtualPedalSnapshot;
  /** Simulates powering up with both footswitches held: the next Program Change sets the MIDI channel (SPEC.md §4.7). */
  powerUpHoldingBothFootswitches(): void;
  subscribe(cb: () => void): () => void;
}

/** The named setting a control is now in, e.g. " → Shifty" or " → On"; nothing for a plain level. */
function settingNote(param: ParamDef, value: number): string {
  const setting = settingLabel(param, value);
  return setting ? ` → ${setting}` : '';
}

/** A note's trigger: the dip `id` has just turned on. */
const turnedOn = (id: PresetParamId) => (before: PedalState, after: PedalState) => !isOn(before[id]) && isOn(after[id]);
/** Mode's Shifty position, as the pedal state holds it. */
const SHIFTY = PARAMS.mode.values[0]!.value;

/** What a message did beyond setting its control, noted when it starts to apply (SPEC.md §5.3). */
const NOTES: { applies(before: PedalState, after: PedalState): boolean; text: string }[] = [
  {
    // Any target dip on engages ramping; the Ramping control (CC 52) does not.
    applies: (before, after) => !isRampingEngaged(before) && isRampingEngaged(after),
    text: 'Ramping engaged: SENSITIVITY knob now sets ramp speed',
  },
  { applies: turnedOn('dusty'), text: 'Dusty: limiter is now an overdrive' },
  { applies: turnedOn('sidechain'), text: 'Sidechain: following the external input' },
  { applies: turnedOn('swellAux'), text: 'Swell Aux: AUX now triggers manual swells' },
  {
    applies: (before, after) => before.shiftyResponse !== after.shiftyResponse && after.mode !== SHIFTY,
    text: 'Shifty Response has no effect outside the Shifty EQ mode',
  },
];

/** The notes a change of state earns, e.g. " · Dusty: limiter is now an overdrive"; nothing if none apply. */
function logNotes(before: PedalState, after: PedalState): string {
  return NOTES.filter((n) => n.applies(before, after))
    .map((n) => ` · ${n.text}`)
    .join('');
}

const PRESET_PARAM_IDS = Object.keys(defaultWorkingState()) as PresetParamId[];

/** What a Slot saves: the Preset controls, not Performance Controls. */
const presetPart = (state: PedalState) =>
  Object.fromEntries(PRESET_PARAM_IDS.map((id) => [id, state[id]])) as WorkingState;

/** A simulated pedal that decodes every message it is sent (SPEC.md §5.3). */
export function createVirtualPedal(midiChannel = DEFAULT_MIDI_CHANNEL): VirtualPedal {
  let snapshot: VirtualPedalSnapshot = { state: defaultPedalState(), midiChannel, log: [] };
  /** What each Slot holds, once stored here. The factory presets in the Toggle Slots are not simulated. */
  const slots = new Map<number, WorkingState>();
  let nextLogId = 1;
  /** Powered up holding both footswitches: waiting for the Program Change that sets the MIDI channel. */
  let settingMidiChannel = false;
  const listeners = new Set<() => void>();

  function update(next: Omit<VirtualPedalSnapshot, 'log'>, text: string) {
    snapshot = { ...next, log: [...snapshot.log, { id: nextLogId++, text }] };
    listeners.forEach((l) => l());
  }

  function receive(bytes: MidiMessage) {
    const msg = decode(bytes);
    const reading = readMessage(bytes, snapshot.midiChannel);
    let { state, midiChannel } = snapshot;
    let text: string;
    const what = msg.kind === 'cc' ? `CC ${msg.cc} = ${msg.value}` : msg.kind === 'pc' ? `PC ${msg.program}` : '';

    if (msg.kind === 'pc' && settingMidiChannel) {
      settingMidiChannel = false;
      midiChannel = msg.midiChannel;
      text = `${what} on MIDI channel ${midiChannel} → MIDI channel set to ${midiChannel}`;
    } else {
      switch (reading.kind) {
        case 'ignored':
          text = `${what} on MIDI channel ${reading.midiChannel} → ignored (pedal listens on MIDI channel ${midiChannel})`;
          break;
        // Live follows the physical knobs, which the Virtual Pedal doesn't have, so its state stays as it is.
        case 'live':
          text = 'PC 0 → Live';
          break;
        case 'recall': {
          const stored = slots.get(reading.slot);
          if (stored) {
            state = { ...state, ...stored };
            text = `${what} → recall Slot ${reading.slot}`;
          } else {
            const held = isToggleSlot(reading.slot) ? 'factory preset (not simulated)' : 'empty';
            text = `${what} → recall Slot ${reading.slot} → ${held}, nothing changes`;
          }
          break;
        }
        case 'store':
          slots.set(reading.slot, presetPart(state));
          text = `${what} → stored in Slot ${reading.slot}`;
          break;
        case 'factoryReset':
          state = withHiddenOptionsReset(state);
          text = `${what} → Factory Reset → Hidden Options back to defaults`;
          break;
        case 'noSuchSlot':
          text = `${what} → no such Slot, nothing ${reading.via === 'recall' ? 'changes' : 'stored'}`;
          break;
        case 'param': {
          const param: ParamDef = PARAMS[reading.id];
          state = { ...state, [reading.id]: reading.value };
          text = `${what} → ${param.label}${settingNote(param, reading.value)}${logNotes(snapshot.state, state)}`;
          break;
        }
        // Holding AUX is momentary, so the Virtual Pedal only notes it.
        case 'auxHold':
          text = `${what} → AUX hold → ${reading.on ? 'On' : 'Off'}`;
          break;
        case 'unmapped':
          text = `${what} → (not in MIDI map)`;
          break;
        case 'unknown':
          text = `Unknown: ${bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`;
          break;
      }
    }

    update({ state, midiChannel }, text);
  }

  return {
    listOutputs: () => [VIRTUAL_PEDAL_PORT],
    listInputs: () => [],
    send: receive,
    onMessage: () => () => {},
    getSnapshot: () => snapshot,
    powerUpHoldingBothFootswitches() {
      settingMidiChannel = true;
      update(snapshot, 'Powered up holding both footswitches → waiting for a Program Change to set the MIDI channel');
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

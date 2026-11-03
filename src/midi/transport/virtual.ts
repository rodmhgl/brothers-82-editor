import { readMessage } from '../../model/pedalReading';
import { defaultPedalState, defaultWorkingState, type PedalState, type WorkingState } from '../../model/state';
import { decode } from '../decode';
import type { MidiMessage } from '../encode';
import { DEFAULT_MIDI_CHANNEL, EFFECT_ORDER_PARALLEL, PARAMS, TARGET_DIPS, isOn, settingLabel, type ParamDef, type ParamId, type PresetParamId } from '../map';
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

/** The named setting a control is now in, e.g. " → Plexi" or " → On"; nothing for a plain level. */
function settingNote(param: ParamDef, value: number): string {
  const setting = settingLabel(param, value);
  return setting ? ` → ${setting}` : '';
}

/** Whether a change of state earns a note. */
type NoteTrigger = (before: PedalState, after: PedalState) => boolean;

/** A note's trigger: the dip `id` has just turned on. */
const turnedOn = (id: PresetParamId): NoteTrigger => (before, after) => !isOn(before[id]) && isOn(after[id]);
/** A note's trigger: `id`, a control that needs something else to work, has just moved without it. */
const movedWhile = (id: ParamId, condition: (state: PedalState) => boolean): NoteTrigger => (before, after) =>
  before[id] !== after[id] && condition(after);

const noiseGateOff = (state: PedalState) => !isOn(state.noiseGate);
const noTargetDipsOn = (state: PedalState) => !Object.values(TARGET_DIPS).some((dip) => isOn(state[dip]));

const GATE_NOTE = 'Gate Threshold/Gate Release have no effect while Noise Gate is off';

type Clean1Role = 'boost' | 'blend';

/** What Clean 1 makes of Channel 1: a clean blend at 2+1, otherwise a clean boost, or nothing while it's off. */
function clean1Role(state: PedalState): Clean1Role | undefined {
  if (!isOn(state.clean1)) return undefined;
  return state.effectOrder === EFFECT_ORDER_PARALLEL ? 'blend' : 'boost';
}

/** A note's trigger: Clean 1 has just become `role`, by the dip or by Effect Order. */
const becameClean1 = (role: Clean1Role): NoteTrigger => (before, after) =>
  clean1Role(before) !== role && clean1Role(after) === role;

/** What a message did beyond setting its control, noted when it starts to apply (SPEC.md §5.3). */
const NOTES: { applies: NoteTrigger; text: string }[] = [
  { applies: becameClean1('boost'), text: 'Clean 1: Channel 1 is now a clean boost' },
  { applies: becameClean1('blend'), text: 'Clean 1 with 2+1: Channel 1 is now a clean blend' },
  { applies: turnedOn('master'), text: 'Master: Vol 2 now sets the overall output volume' },
  { applies: movedWhile('gateThreshold', noiseGateOff), text: GATE_NOTE },
  { applies: movedWhile('gateRelease', noiseGateOff), text: GATE_NOTE },
  { applies: movedWhile('expression', noTargetDipsOn), text: 'Expression: no target dips on' },
];

/** The notes a change of state earns, e.g. " · Master: Vol 2 now sets…"; nothing if none apply. */
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
  /** What each Slot holds, once stored here. */
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
            text = `${what} → recall Slot ${reading.slot} → empty, nothing changes`;
          }
          break;
        }
        case 'store':
          slots.set(reading.slot, presetPart(state));
          text = `${what} → stored in Slot ${reading.slot}`;
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

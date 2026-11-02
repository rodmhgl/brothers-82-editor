import { controlChange, programChange, type MidiMessage } from '../midi/encode';
import {
  LIVE_PROGRAM,
  PARAMS,
  SAVE_TO_SLOT_CC,
  clampToParam,
  type ParamDef,
  type PresetParamId,
  type ParamId,
} from '../midi/map';
import * as history from './history';
import { routeIncoming } from './incoming';
import { readMessage } from './pedalReading';
import { EMPTY_SLOT_MAP, forgetSlot, recordStore, type SlotMap, type SlotOrigin } from './slotMap';
import { INITIAL_SYNC_STATUS, nextSyncStatus, type SyncEvent, type SyncStatus } from './sync';
import {
  defaultGlobalSettings,
  defaultPerformanceState,
  defaultWorkingState,
  type GlobalSettings,
  type PerformanceState,
  type WorkingState,
} from './state';

// The editor core (SPEC.md §6): every change to the Editor State is one pure transition, which also says what MIDI
// to send. The store only applies it and does the sending.

/** Everything the editor believes about and controls on the pedal. */
export type EditorState = {
  working: WorkingState;
  performance: PerformanceState;
  global: GlobalSettings;
  sync: SyncStatus;
  /** What the editor believes each Slot holds: what it last stored there. Never confirmed by the pedal. */
  slotMap: SlotMap;
  /** Undo/redo for Working State edits. */
  history: history.History;
};

export type EditorAction =
  /** Any param that holds a value; its scope picks the slice. Working State edits are undoable unless `undoable: false`. */
  | { type: 'setParam'; id: ParamId; value: number; undoable?: boolean }
  /** Starts a knob drag: every edit until `endGesture` undoes as one step. */
  | { type: 'beginGesture' }
  | { type: 'endGesture' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** A whole new Working State (a recalled Preset, or New). Sends nothing: the store follows it with Send All. */
  | { type: 'load'; working: WorkingState }
  /** At launch, what the last session left (SPEC.md §5.11). Sends nothing. */
  | { type: 'restore'; working: WorkingState; slotMap: SlotMap; midiChannel: number }
  /** PC n. */
  | { type: 'recall'; slot: number }
  /** PC 0. */
  | { type: 'live' }
  /** Save to Slot, CC 111 = n. Send All first, so the pedal holds the Working State. */
  | { type: 'store'; slot: number; origin: SlotOrigin; writtenAt: string }
  /** MIDI from elsewhere (Raw MIDI, Pass-through): sent unchanged, followed as the pedal would read it. */
  | { type: 'forward'; bytes: MidiMessage }
  /**
   * A message from the MIDI input, routed by MIDI channel: on the pedal's it is forwarded (Pass-through); on any other
   * it is ignored and never forwarded.
   */
  | { type: 'receive'; bytes: MidiMessage }
  /** The MIDI channel the editor sends on. Sends nothing. */
  | { type: 'setMidiChannel'; midiChannel: number }
  /** The MIDI channel wizard's last step: PC 0 on the new MIDI channel sets the pedal to it, going Live. */
  | { type: 'setPedalMidiChannel'; midiChannel: number }
  /** The selected output has just become reachable. */
  | { type: 'connected' }
  /** Send All has transmitted the whole Working State. */
  | { type: 'sendAllFinished' };

export type CoreResult = { state: EditorState; messages: MidiMessage[] };

export function initialEditorState(): EditorState {
  return {
    working: defaultWorkingState(),
    performance: defaultPerformanceState(),
    global: defaultGlobalSettings(),
    sync: INITIAL_SYNC_STATUS,
    slotMap: EMPTY_SLOT_MAP,
    history: history.EMPTY_HISTORY,
  };
}

/** The Editor State after `action`, and the MIDI to send for it. */
export function dispatch(state: EditorState, action: EditorAction): CoreResult {
  const cc = (param: ParamDef, value: number) => controlChange(state.global.midiChannel, param.cc, value);
  const pc = (program: number) => programChange(state.global.midiChannel, program);

  switch (action.type) {
    case 'setParam': {
      const param = PARAMS[action.id];
      const next = setParam(state, action.id, action.value, action.undoable ?? true);
      return { state: next, messages: [cc(param, valueOf(next, action.id))] };
    }
    case 'beginGesture':
      return { state: { ...state, history: history.beginGesture(state.history) }, messages: [] };
    case 'endGesture':
      return { state: { ...state, history: history.endGesture(state.history) }, messages: [] };
    case 'undo':
    case 'redo': {
      const move = action.type === 'undo' ? history.undo(state.history) : history.redo(state.history);
      if (!move) return { state, messages: [] };
      let next = { ...state, history: move.history };
      const messages: MidiMessage[] = [];
      for (const [id, value] of Object.entries(move.values) as [PresetParamId, number][]) {
        next = setParam(next, id, value, false);
        messages.push(cc(PARAMS[id], next.working[id]));
      }
      return { state: next, messages };
    }
    case 'load':
      // Earlier steps belong to another state. Until Send All finishes, the pedal still holds some of the old one.
      return { state: sync({ ...state, working: action.working, history: history.EMPTY_HISTORY }, 'loaded'), messages: [] };
    case 'restore': {
      const { working, slotMap, midiChannel } = action;
      // The pedal may have been changed since, and earlier steps belong to the last session.
      const restored = { ...withMidiChannel(state, midiChannel), working, slotMap, history: history.EMPTY_HISTORY };
      return { state: sync(restored, 'launch'), messages: [] };
    }
    case 'recall':
      return { state: recall(state, action.slot), messages: [pc(action.slot)] };
    case 'live':
      return { state: live(state), messages: [pc(LIVE_PROGRAM)] };
    case 'store': {
      const { slot, origin, writtenAt } = action;
      const entry = {
        slot,
        snapshot: state.working,
        ...(origin.presetId !== null && { presetId: origin.presetId }),
        name: origin.name,
        writtenAt,
      };
      return { state: { ...state, slotMap: recordStore(state.slotMap, entry) }, messages: [controlChange(state.global.midiChannel, SAVE_TO_SLOT_CC, slot)] };
    }
    case 'forward':
      return { state: follow(state, action.bytes), messages: [action.bytes] };
    case 'receive':
      if (routeIncoming(action.bytes, state.global.midiChannel) === 'passThrough') return dispatch(state, { type: 'forward', bytes: action.bytes });
      return { state, messages: [] };
    case 'setMidiChannel':
      return { state: withMidiChannel(state, action.midiChannel), messages: [] };
    case 'setPedalMidiChannel':
      // PC 0 is Live, so it sets the MIDI channel without recalling a Slot (SPEC.md §4.7).
      return {
        state: live(withMidiChannel(state, action.midiChannel)),
        messages: [programChange(action.midiChannel, LIVE_PROGRAM)],
      };
    case 'connected':
      // The pedal may hold anything.
      return { state: sync(state, 'reconnect'), messages: [] };
    case 'sendAllFinished':
      return { state: sync(state, 'sendAll'), messages: [] };
  }
}

/** The forwarded message's effect on the Editor State: whatever the pedal does with it. */
function follow(state: EditorState, bytes: MidiMessage): EditorState {
  const reading = readMessage(bytes, state.global.midiChannel);
  switch (reading.kind) {
    case 'param':
      return setParam(state, reading.id, reading.value, false);
    case 'recall':
      return recall(state, reading.slot);
    case 'live':
      return live(state);
    case 'store':
      // The editor can't be sure what the pedal held, so it no longer knows what the Slot does.
      return { ...state, slotMap: forgetSlot(state.slotMap, reading.slot) };
    case 'ignored':
    case 'unmapped':
    case 'noSuchSlot':
    case 'unknown':
      return state;
  }
}

function setParam(state: EditorState, id: ParamId, value: number, undoable: boolean): EditorState {
  const param: ParamDef = PARAMS[id];
  const v = clampToParam(param, value);
  switch (param.scope) {
    case 'preset': {
      const presetId = id as PresetParamId;
      const before = state.working[presetId];
      const next = sync({ ...state, working: { ...state.working, [presetId]: v } }, 'edit');
      return undoable ? { ...next, history: history.record(state.history, presetId, before, v) } : next;
    }
    case 'performance':
      return { ...state, performance: { ...state.performance, [id]: v } };
  }
}

/** The value the editor holds for a param, from whichever slice its scope picks. */
export function valueOf(state: EditorState, id: ParamId): number {
  const slices: Record<ParamDef['scope'], Record<string, number>> = {
    preset: state.working,
    performance: state.performance,
  };
  return slices[PARAMS[id].scope][id]!;
}

/**
 * The pedal has recalled `slot`: the Slot Map's snapshot if it knows one. Earlier steps belong to the state the
 * recalled Slot replaced, so undoing one would send a single CC into it and leave a mix of two states.
 */
function recall(state: EditorState, slot: number): EditorState {
  const entry = state.slotMap[slot];
  const working = entry?.snapshot ?? state.working;
  return sync({ ...state, working, history: history.EMPTY_HISTORY }, entry ? 'recallKnown' : 'recallUnknown');
}

/** The pedal follows its physical controls, which replace its whole state, so earlier steps no longer apply. */
function live(state: EditorState): EditorState {
  return sync({ ...state, history: history.EMPTY_HISTORY }, 'live');
}

function sync(state: EditorState, event: SyncEvent): EditorState {
  return { ...state, sync: nextSyncStatus(state.sync, event) };
}

function withMidiChannel(state: EditorState, midiChannel: number): EditorState {
  return { ...state, global: { ...state.global, midiChannel } };
}

/** One Working State control as the CC that sets it on the pedal. */
export function encodeParam(state: EditorState, id: PresetParamId): MidiMessage {
  return controlChange(state.global.midiChannel, PARAMS[id].cc, state.working[id]);
}

/** Send All goes group by group in this order (SPEC.md §5.1). */
const SEND_ALL_GROUPS: ParamDef['group'][] = ['dipLeft', 'dipRight', 'toggle', 'hidden', 'knob', 'footswitch'];

/** Every Working State control in the order Send All transmits it. */
export function sendAllOrder(): PresetParamId[] {
  const preset = Object.values(PARAMS).filter((p) => p.scope === 'preset');
  return SEND_ALL_GROUPS.flatMap((group) => preset.filter((p) => p.group === group).map((p) => p.id));
}

/** The full Working State as MIDI, in Send All order. */
export function encodeSendAll(state: EditorState): MidiMessage[] {
  return sendAllOrder().map((id) => encodeParam(state, id));
}

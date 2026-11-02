import { create } from 'zustand';
import { decode } from '../midi/decode';
import type { MidiMessage } from '../midi/encode';
import { PARAMS, isOn, paramByCc, switchValue, type ParamId } from '../midi/map';
import { createThrottle } from '../midi/throttle';
import { VIRTUAL_PEDAL_PORT, createVirtualPedal, type VirtualPedal } from '../midi/transport/virtual';
import type { MidiPort } from '../midi/transport/types';
import { requestWebMidi, type WebMidi } from '../midi/transport/webmidi';
import { dispatch, encodeParam, initialEditorState, sendAllOrder, type EditorAction, type EditorState } from '../model/core';
import * as history from '../model/history';
import type { SlotOrigin } from '../model/slotMap';
import type { WorkingState } from '../model/state';
import { logSent, type SentMessage } from './monitor';
import { DEFAULT_SETTINGS, type Session } from './session';

/** How long the Test button holds Bypass the other way, so the LED change is visible. */
const TEST_HOLD_MS = 600;

/** Continuous controls send at most one message per this many ms each (SPEC.md §5.11). */
const CONTINUOUS_SEND_MS = 5;

export type WebMidiStatus = 'pending' | 'available' | 'unavailable';

type EditorStore = {
  /** Every change to it goes through the editor core's `dispatch`. */
  editor: EditorState;
  webMidi: WebMidi | null;
  webMidiStatus: WebMidiStatus;
  /** Virtual Pedal first, then every connected Web MIDI output. */
  outputs: MidiPort[];
  outputId: string;
  /** Every connected Web MIDI input. */
  inputs: MidiPort[];
  /** The input Pass-through hears; null hears none. */
  inputId: string | null;
  /** Send All whenever an output is connected or reconnected. */
  autoSendAll: boolean;
  /** Gap between Send All messages, in ms. */
  sendThrottleMs: number;
  sendingAll: boolean;
  /** Outgoing messages for the MIDI Monitor, newest first. */
  sent: SentMessage[];
  /** The Slot the Slot controls act on, 1–122. */
  selectedSlot: number;
  canUndo: boolean;
  canRedo: boolean;
  /**
   * Sets any control (Working State or Performance Control) and sends it.
   * Working State edits are undoable unless `undoable: false`.
   */
  setParam(id: ParamId, value: number, options?: { undoable?: boolean }): void;
  /** Starts a knob drag: every edit until `endGesture` undoes as one step. */
  beginGesture(): void;
  endGesture(): void;
  /** Steps the Working State back one edit (or knob drag) and sends what changed. */
  undo(): void;
  redo(): void;
  /**
   * Replaces the whole Working State (a recalled Preset, or New) and sends it with Send All. The Sync Status is
   * Possibly Stale until that finishes, and stays so with no output connected. Resolves like `sendAll`.
   * Clears the undo history: it is cleared whenever the pedal's whole state is replaced in a way the editor can't
   * follow (here, until Send All finishes; also a Slot recall and going Live).
   */
  loadWorking(working: WorkingState): Promise<boolean>;
  selectSlot(slot: number): void;
  /**
   * Recalls a Slot with PC n. A Slot the Slot Map knows makes its snapshot the Working State, In Sync; any other
   * Slot could hold anything: Unknown. Clears the undo history, by the rule on `loadWorking`: the recalled Slot
   * replaces the pedal's whole state, so undoing an earlier edit would send one CC into it and leave a mix of two states.
   */
  recallSlot(slot: number): void;
  /**
   * Send All, then Save to Slot (CC 111 = n), and records it in the Slot Map as coming from `origin`. Given
   * `working`, stores that instead: it becomes the Working State first, as with `loadWorking`. The UI confirms first;
   * not undoable. Resolves false, storing nothing, if the Send All was abandoned.
   */
  storeSlot(slot: number, origin: SlotOrigin, working?: WorkingState): Promise<boolean>;
  /** Sends PC 0: the pedal follows its physical controls, which the editor can't read. Clears the undo history. */
  goLive(): void;
  /**
   * Sends Factory Reset (CC 56): the Hidden Options go back to their defaults on the pedal and in the Working State.
   * Slots are untouched. The UI confirms first. Clears the undo history; Possibly Stale.
   */
  factoryReset(): void;
  /**
   * The MIDI channel wizard's power-up step is done by hand on a real pedal. The Virtual Pedal has no power
   * lead to pull, so this simulates it there.
   */
  pedalPoweredUpForMidiChannel(): void;
  /**
   * The last step of the MIDI channel wizard, once the pedal has powered up holding both footswitches:
   * PC 0 on the chosen MIDI channel sets the pedal to it, and the editor sends on it from then on.
   */
  setPedalMidiChannel(midiChannel: number): void;
  clearSent(): void;
  /**
   * MIDI from elsewhere (Raw MIDI for hardware checks). Sent unchanged, never throttled; the editor's state follows as
   * the pedal would read it: a CC in the MIDI map sets that control, and a PC recalls a Slot or goes Live like
   * `recallSlot` or `goLive`, but leaves the Slot selection alone. PC 123–127 reach no Slot and change nothing.
   */
  forward(bytes: MidiMessage): void;
  /**
   * A message from the selected MIDI input, routed by MIDI channel (SPEC.md §5.8). On the pedal's MIDI channel it is
   * passed through like `forward`: sent unchanged, never throttled, and followed. Anything on another MIDI channel, and
   * anything with no MIDI channel (MIDI clock, SysEx), is ignored and never sent.
   */
  receive(bytes: MidiMessage): void;
  /**
   * Transmits the full Working State, throttled; the Sync Status is In Sync once it finishes.
   * Resolves false if it was abandoned (the output changed or another Send All began).
   */
  sendAll(): Promise<boolean>;
  setAutoSendAll(on: boolean): void;
  setSendThrottleMs(ms: number): void;
  /**
   * At launch, takes up what the last session left: its Working State (Possibly Stale), Slot Map, MIDI channel,
   * devices and Send All settings. Sends nothing; a restored Web MIDI output connects once Web MIDI lists it.
   */
  restore(session: Session): void;
  setMidiChannel(midiChannel: number): void;
  setOutput(id: string): void;
  /** Selects the MIDI input Pass-through hears, or none. */
  setInput(id: string | null): void;
  isOutputConnected(): boolean;
  isOutputVirtual(): boolean;
  test(): Promise<void>;
  connectWebMidi(): Promise<void>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Monitor times count from when the editor started. */
const startedAt = Date.now();

export type EditorDeps = {
  /** The current time as an ISO string. */
  now(): string;
};

const defaultDeps: EditorDeps = { now: () => new Date().toISOString() };

/** The editor's state and actions, sending to `virtualPedal` whenever it is the selected output. */
export function createEditorStore(virtualPedal: VirtualPedal, deps: EditorDeps = defaultDeps) {
  /** Bumped to abandon a Send All in progress: a newer one started, or the output changed. */
  let sendAllRun = 0;
  /** Shared so React StrictMode's double effect asks the browser only once. */
  let webMidiRequest: Promise<void> | undefined;
  let nextSentId = 1;

  const store = create<EditorStore>((set, get) => {
    const sendToOutput = (bytes: MidiMessage) => {
      const { outputId, webMidi } = get();
      if (outputId === VIRTUAL_PEDAL_PORT.id) virtualPedal.send(bytes);
      else webMidi?.send(bytes);
      set({ sent: logSent(get().sent, { id: nextSentId++, at: Date.now() - startedAt, bytes }) });
    };
    const continuousThrottle = createThrottle(CONTINUOUS_SEND_MS, sendToOutput);
    /** Paces continuous controls through the throttle, like a knob; everything else goes straight out. */
    const sendPaced = (bytes: MidiMessage) => {
      const msg = decode(bytes);
      const param = msg.kind === 'cc' ? paramByCc(msg.cc) : undefined;
      if (param?.kind === 'continuous') continuousThrottle.send(param.id, bytes);
      else sendToOutput(bytes);
    };
    /** Applies `action` with the editor core and sends what it says to. */
    const apply = (action: EditorAction, send = sendPaced) => {
      const { state, messages } = dispatch(get().editor, action);
      set({ editor: state, canUndo: history.canUndo(state.history), canRedo: history.canRedo(state.history) });
      messages.forEach((m) => send(m));
    };
    const abandonSendAll = () => {
      sendAllRun++;
      set({ sendingAll: false });
    };

    /** The selected output has just become reachable: the pedal may hold anything. */
    const onConnect = () => {
      abandonSendAll();
      apply({ type: 'connected' });
      if (get().autoSendAll && get().isOutputConnected()) void get().sendAll();
    };

    const requestAndListen = async () => {
      const webMidi = await requestWebMidi();
      if (!webMidi) {
        set({ webMidiStatus: 'unavailable' });
        return;
      }
      // A new outputs array on every port change also re-renders the connection indicator.
      // Web MIDI has already changed by the time it reports a port change, so compare the outputs list instead.
      const selectedOutputListed = () => get().outputs.some((p) => p.id === get().outputId);
      const refresh = () => {
        const wasConnected = selectedOutputListed();
        set({ outputs: [VIRTUAL_PEDAL_PORT, ...webMidi.listOutputs()], inputs: webMidi.listInputs() });
        const connected = selectedOutputListed();
        if (connected && !wasConnected) onConnect();
        if (!connected && wasConnected) abandonSendAll();
      };
      webMidi.onPortsChange(refresh);
      webMidi.onMessage((bytes) => get().receive(bytes));
      // Selected before Web MIDI was ready: restored from the last session.
      if (!get().isOutputVirtual()) webMidi.selectOutput(get().outputId);
      webMidi.selectInput(get().inputId);
      set({ webMidi, webMidiStatus: 'available' });
      refresh();
    };

    return {
      editor: initialEditorState(),
      webMidi: null,
      webMidiStatus: 'pending',
      outputs: [VIRTUAL_PEDAL_PORT],
      outputId: VIRTUAL_PEDAL_PORT.id,
      inputs: [],
      inputId: null,
      autoSendAll: DEFAULT_SETTINGS.autoSendAll,
      sendThrottleMs: DEFAULT_SETTINGS.sendThrottleMs,
      sendingAll: false,
      sent: [],
      selectedSlot: 1,
      canUndo: false,
      canRedo: false,
      setParam(id, value, { undoable } = {}) {
        apply({ type: 'setParam', id, value, undoable });
      },
      beginGesture() {
        apply({ type: 'beginGesture' });
      },
      endGesture() {
        apply({ type: 'endGesture' });
      },
      undo() {
        apply({ type: 'undo' });
      },
      redo() {
        apply({ type: 'redo' });
      },
      loadWorking(working) {
        apply({ type: 'load', working });
        if (get().isOutputConnected()) return get().sendAll();
        abandonSendAll();
        return Promise.resolve(false);
      },
      selectSlot(selectedSlot) {
        set({ selectedSlot });
      },
      recallSlot(slot) {
        set({ selectedSlot: slot });
        apply({ type: 'recall', slot });
      },
      async storeSlot(slot, origin, working) {
        // Abandoned part-way, the pedal may not hold the Working State, so storing it would save the wrong thing.
        if (!(await (working ? get().loadWorking(working) : get().sendAll()))) return false;
        apply({ type: 'store', slot, origin, writtenAt: deps.now() });
        return true;
      },
      goLive() {
        apply({ type: 'live' });
      },
      factoryReset() {
        apply({ type: 'factoryReset' });
      },
      pedalPoweredUpForMidiChannel() {
        if (get().isOutputVirtual()) virtualPedal.powerUpHoldingBothFootswitches();
      },
      setPedalMidiChannel(midiChannel) {
        apply({ type: 'setPedalMidiChannel', midiChannel });
      },
      clearSent() {
        set({ sent: [] });
      },
      forward(bytes) {
        apply({ type: 'forward', bytes }, sendToOutput);
      },
      receive(bytes) {
        apply({ type: 'receive', bytes }, sendToOutput);
      },
      async sendAll() {
        const run = ++sendAllRun;
        set({ sendingAll: true });
        for (const [i, id] of sendAllOrder().entries()) {
          if (i > 0) await sleep(get().sendThrottleMs);
          if (run !== sendAllRun) return false;
          // Read the latest state each step, so an edit made mid-way isn't overwritten with an older value.
          sendToOutput(encodeParam(get().editor, id));
        }
        set({ sendingAll: false });
        apply({ type: 'sendAllFinished' });
        return true;
      },
      setAutoSendAll(autoSendAll) {
        set({ autoSendAll });
      },
      setSendThrottleMs(sendThrottleMs) {
        set({ sendThrottleMs });
      },
      restore({ working, slotMap, midiChannel, outputId, inputId, settings }) {
        apply({ type: 'restore', working, slotMap, midiChannel });
        const { autoSendAll, sendThrottleMs } = settings;
        set({ outputId, inputId, autoSendAll, sendThrottleMs });
        const { webMidi } = get();
        webMidi?.selectOutput(get().isOutputVirtual() ? null : outputId);
        webMidi?.selectInput(inputId);
      },
      setMidiChannel(midiChannel) {
        apply({ type: 'setMidiChannel', midiChannel });
      },
      setOutput(id) {
        get().webMidi?.selectOutput(id === VIRTUAL_PEDAL_PORT.id ? null : id);
        set({ outputId: id });
        onConnect();
      },
      setInput(id) {
        get().webMidi?.selectInput(id);
        set({ inputId: id });
      },
      isOutputVirtual() {
        return get().outputId === VIRTUAL_PEDAL_PORT.id;
      },
      isOutputConnected() {
        const { outputId, webMidi } = get();
        return outputId === VIRTUAL_PEDAL_PORT.id || !!webMidi?.isConnected(outputId);
      },
      async test() {
        const { setParam } = get();
        const bypass = get().editor.working.bypass;
        setParam('bypass', switchValue(PARAMS.bypass, !isOn(bypass)), { undoable: false });
        await sleep(TEST_HOLD_MS);
        setParam('bypass', bypass, { undoable: false });
      },
      connectWebMidi() {
        webMidiRequest ??= requestAndListen();
        return webMidiRequest;
      },
    };
  });
  return store;
}

export const virtualPedal = createVirtualPedal();

export const useEditorStore = createEditorStore(virtualPedal);

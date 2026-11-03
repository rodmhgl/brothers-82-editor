import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlChange, programChange } from '../midi/encode';
import { PARAMS } from '../midi/map';
import { VIRTUAL_PEDAL_PORT, createVirtualPedal, type VirtualPedal } from '../midi/transport/virtual';
import { sendAllOrder } from '../model/core';
import type { SlotOrigin } from '../model/slotMap';
import type { SyncStatus } from '../model/sync';
import { createEditorStore } from './editorStore';
import { DEFAULT_SETTINGS, SESSION_VERSION, type Session } from './session';
import { defaultWorkingState } from '../model/state';

let virtualPedal: VirtualPedal;
let useEditorStore: ReturnType<typeof createEditorStore>;

/** A minimal MIDIAccess with one output that can be unplugged and plugged back in, and one input that can `play`. */
function fakeMidiAccess() {
  const output = { id: 'out-1', name: 'MIDIBox', type: 'output', state: 'connected', send: vi.fn() };
  const input = {
    id: 'in-1',
    name: 'DAW',
    type: 'input',
    state: 'connected',
    onmidimessage: null as ((e: { data: Uint8Array }) => void) | null,
  };
  const access = {
    inputs: new Map([[input.id, input]]),
    outputs: new Map([[output.id, output]]),
    onstatechange: null as ((e: unknown) => void) | null,
  };
  const setState = (state: 'connected' | 'disconnected') => {
    output.state = state;
    access.onstatechange?.({ port: output });
  };
  return {
    access,
    output,
    unplug: () => setState('disconnected'),
    plugIn: () => setState('connected'),
    play: (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) }),
  };
}

/** Bytes the Virtual Pedal has logged since `from`, as `CC n` labels. */
function loggedCcs(from: number) {
  return virtualPedal
    .getSnapshot()
    .log.slice(from)
    .map((e) => e.text.match(/^CC (\d+)/)?.[1]);
}

const NOW = '2026-10-05T12:00:00.000Z';

function setSyncStatus(status: SyncStatus) {
  useEditorStore.setState((s) => ({ editor: { ...s.editor, sync: status } }));
}

beforeEach(() => {
  vi.useFakeTimers();
  virtualPedal = createVirtualPedal();
  useEditorStore = createEditorStore(virtualPedal, { now: () => NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Send All', () => {
  it('reproduces the Working State on the Virtual Pedal and makes the Sync Status In Sync', async () => {
    const { setMidiChannel, setParam } = useEditorStore.getState();
    // Edits on MIDI channel 5 never reach the Virtual Pedal (it listens on 2), so it drifts.
    setMidiChannel(5);
    setParam('motoByp2', 127);
    setParam('odType', 3);
    setParam('effectOrder', 1);
    setParam('tone2', 90);
    setParam('channel2Bypass', 0);
    setMidiChannel(2);
    await vi.runAllTimersAsync();
    expect(virtualPedal.getSnapshot().state.motoByp2).toBe(0);
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');

    const before = virtualPedal.getSnapshot().log.length;
    const done = useEditorStore.getState().sendAll();
    expect(useEditorStore.getState().sendingAll).toBe(true);
    await vi.runAllTimersAsync();
    await done;

    const {
      editor: { working, sync },
      sendingAll,
    } = useEditorStore.getState();
    const pedal = virtualPedal.getSnapshot().state;
    for (const id of sendAllOrder()) expect(pedal[id], id).toBe(working[id]);
    expect(loggedCcs(before)).toEqual(sendAllOrder().map((id) => String(PARAMS[id].cc)));
    expect(sync).toBe('inSync');
    expect(sendingAll).toBe(false);
  });

  it('waits the send throttle between messages', async () => {
    const before = virtualPedal.getSnapshot().log.length;
    void useEditorStore.getState().sendAll();

    expect(virtualPedal.getSnapshot().log.length - before).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(virtualPedal.getSnapshot().log.length - before).toBe(2);
    await vi.runAllTimersAsync();
    expect(virtualPedal.getSnapshot().log.length - before).toBe(sendAllOrder().length);
  });

  it('sends values edited while it is under way, not the ones it started with', async () => {
    const done = useEditorStore.getState().sendAll();
    useEditorStore.getState().setParam('channel2Bypass', 0);
    await vi.runAllTimersAsync();
    await done;

    expect(virtualPedal.getSnapshot().state.channel2Bypass).toBe(0);
  });
});

describe('the Test button', () => {
  it('flips Channel 2 Bypass, then puts it back, so the LED changes and returns', async () => {
    const before = virtualPedal.getSnapshot().log.length;
    const done = useEditorStore.getState().test();
    await vi.runAllTimersAsync();
    await done;

    expect(virtualPedal.getSnapshot().log.slice(before).map((e) => e.text)).toEqual([
      'CC 103 = 0 → Channel 2 Bypass → Bypassed',
      'CC 103 = 127 → Channel 2 Bypass → Engaged',
    ]);
    expect(useEditorStore.getState().editor.working.channel2Bypass).toBe(127);
  });

  it('with Channel 2 bypassed, engages it, then bypasses it again', async () => {
    useEditorStore.getState().setParam('channel2Bypass', 0);
    const before = virtualPedal.getSnapshot().log.length;
    const done = useEditorStore.getState().test();
    await vi.runAllTimersAsync();
    await done;

    expect(virtualPedal.getSnapshot().log.slice(before).map((e) => e.text)).toEqual([
      'CC 103 = 127 → Channel 2 Bypass → Engaged',
      'CC 103 = 0 → Channel 2 Bypass → Bypassed',
    ]);
    expect(useEditorStore.getState().editor.working.channel2Bypass).toBe(0);
  });
});

describe('Sync Status in the editor', () => {
  it('starts Possibly Stale', () => {
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');
  });

  it('is not changed by single edits', () => {
    setSyncStatus('inSync');
    useEditorStore.getState().setParam('vol2', 3);
    expect(useEditorStore.getState().editor.sync).toBe('inSync');

    setSyncStatus('unknown');
    useEditorStore.getState().setParam('effectOrder', 3);
    expect(useEditorStore.getState().editor.sync).toBe('unknown');
  });
});

describe('connecting an output', () => {
  async function connectFakeWebMidi() {
    const fake = fakeMidiAccess();
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => fake.access });
    await useEditorStore.getState().connectWebMidi();
    return fake;
  }

  it('Sends All on connect by default, ending In Sync', async () => {
    const fake = await connectFakeWebMidi();

    useEditorStore.getState().setOutput('out-1');
    await vi.runAllTimersAsync();

    expect(fake.output.send).toHaveBeenCalledTimes(sendAllOrder().length);
    expect(useEditorStore.getState().editor.sync).toBe('inSync');
  });

  it('only marks the Sync Status Possibly Stale when auto Send All is off', async () => {
    const fake = await connectFakeWebMidi();
    setSyncStatus('inSync');
    useEditorStore.getState().setAutoSendAll(false);

    useEditorStore.getState().setOutput('out-1');
    await vi.runAllTimersAsync();

    expect(fake.output.send).not.toHaveBeenCalled();
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');
  });

  it('treats the selected output coming back as a reconnect', async () => {
    const fake = await connectFakeWebMidi();
    useEditorStore.getState().setOutput('out-1');
    await vi.runAllTimersAsync();
    fake.output.send.mockClear();

    fake.unplug();
    useEditorStore.getState().setAutoSendAll(false);
    fake.plugIn();
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');

    useEditorStore.getState().setAutoSendAll(true);
    fake.unplug();
    fake.plugIn();
    await vi.runAllTimersAsync();
    expect(fake.output.send).toHaveBeenCalledTimes(sendAllOrder().length);
    expect(useEditorStore.getState().editor.sync).toBe('inSync');
  });

  it('abandons a Send All when the output changes mid-way', async () => {
    const fake = await connectFakeWebMidi();
    useEditorStore.getState().setAutoSendAll(false);
    useEditorStore.getState().setOutput('out-1');
    const done = useEditorStore.getState().sendAll();
    await vi.advanceTimersByTimeAsync(2);

    useEditorStore.getState().setOutput(VIRTUAL_PEDAL_PORT.id);
    await vi.runAllTimersAsync();
    await done;

    expect(fake.output.send.mock.calls.length).toBeLessThan(sendAllOrder().length);
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');
    expect(useEditorStore.getState().sendingAll).toBe(false);
  });
});

describe('restoring the last session', () => {
  const working = { ...defaultWorkingState(), vol2: 100, ampType: 3 };
  const session: Session = {
    version: SESSION_VERSION,
    working,
    source: null,
    slotMap: { 5: { slot: 5, snapshot: working, name: 'Untitled', writtenAt: NOW } },
    midiChannel: 2,
    outputId: 'out-1',
    inputId: 'in-1',
    settings: { ...DEFAULT_SETTINGS, sendThrottleMs: 7 },
  };

  it('takes up its Working State, Slot Map, devices and Send All settings, Possibly Stale and sending nothing', async () => {
    setSyncStatus('inSync');
    useEditorStore.getState().restore({ ...session, settings: { ...session.settings, autoSendAll: false } });
    await vi.runAllTimersAsync();

    expect(useEditorStore.getState()).toMatchObject({
      editor: { working, slotMap: session.slotMap, sync: 'possiblyStale' },
      outputId: 'out-1',
      inputId: 'in-1',
      autoSendAll: false,
      sendThrottleMs: 7,
    });
    expect(useEditorStore.getState().sent).toEqual([]);
  });

  it('connects to the restored output and input once Web MIDI lists them, Sending All on connect', async () => {
    useEditorStore.getState().restore(session);
    const fake = fakeMidiAccess();
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => fake.access });
    await useEditorStore.getState().connectWebMidi();
    await vi.runAllTimersAsync();

    expect(fake.output.send).toHaveBeenCalledTimes(sendAllOrder().length);
    expect(fake.output.send).toHaveBeenCalledWith(controlChange(2, PARAMS.vol2.cc, 100));
    expect(useEditorStore.getState().editor.sync).toBe('inSync');

    fake.play([0xb1, 17, 90]);
    expect(useEditorStore.getState().editor.working.tone2).toBe(90);
  });

  it('paces Send All by the send throttle', async () => {
    useEditorStore.getState().setSendThrottleMs(20);
    void useEditorStore.getState().sendAll();
    await vi.advanceTimersByTimeAsync(20 * 3);

    expect(loggedCcs(0)).toHaveLength(4);
  });
});

describe('continuous sends', () => {
  it('send at most one message per 5 ms per knob and always the final value', async () => {
    const before = virtualPedal.getSnapshot().log.length;
    const { setParam } = useEditorStore.getState();

    for (let v = 10; v < 20; v++) setParam('vol2', v);
    setParam('vol1', 1);
    expect(loggedCcs(before)).toEqual(['15', '18']);

    await vi.advanceTimersByTimeAsync(5);
    expect(virtualPedal.getSnapshot().log.slice(before).map((e) => e.text)).toEqual([
      'CC 15 = 10 → Vol 2',
      'CC 18 = 1 → Vol 1',
      'CC 15 = 19 → Vol 2',
    ]);
  });

  it('never hold back toggles or switches', () => {
    const before = virtualPedal.getSnapshot().log.length;
    const { setParam } = useEditorStore.getState();

    setParam('channel1Bypass', 127);
    setParam('channel1Bypass', 0);

    expect(loggedCcs(before)).toEqual(['102', '102']);
  });
});

describe('Slots', () => {
  const shimmer = { presetId: 'shimmer', name: 'Shimmer Tape' };

  /** Stores the Working State in a Slot and waits for its Send All. */
  async function store(slot: number, origin: SlotOrigin = shimmer) {
    const done = useEditorStore.getState().storeSlot(slot, origin);
    await vi.runAllTimersAsync();
    return done;
  }

  it('recalls a Slot the Slot Map doesn’t know with PC n, making the Sync Status Unknown', () => {
    const { recallSlot } = useEditorStore.getState();
    const working = useEditorStore.getState().editor.working;

    recallSlot(7);

    expect(virtualPedal.getSnapshot().log.at(-1)?.text).toBe('PC 7 → recall Slot 7 → empty, nothing changes');
    expect(useEditorStore.getState()).toMatchObject({ selectedSlot: 7, editor: { sync: 'unknown', working } });
  });

  it('stores by sending everything first, then CC 111 = Slot number', async () => {
    expect(await store(9)).toBe(true);

    const texts = virtualPedal.getSnapshot().log.map((e) => e.text);
    expect(texts).toHaveLength(sendAllOrder().length + 1);
    expect(texts.at(-1)).toBe('CC 111 = 9 → stored in Slot 9');
    expect(useEditorStore.getState().editor.sync).toBe('inSync');
  });

  it('records what it stored in the Slot Map, with its source Preset and when', async () => {
    useEditorStore.getState().setParam('vol2', 90);

    await store(9);

    expect(useEditorStore.getState().editor.slotMap[9]).toEqual({
      slot: 9,
      snapshot: useEditorStore.getState().editor.working,
      presetId: 'shimmer',
      name: 'Shimmer Tape',
      writtenAt: NOW,
    });
  });

  it('records a store with no source Preset under the Working State’s name only', async () => {
    await store(9, { presetId: null, name: 'Untitled' });

    expect(useEditorStore.getState().editor.slotMap[9]).not.toHaveProperty('presetId');
    expect(useEditorStore.getState().editor.slotMap[9]?.name).toBe('Untitled');
  });

  it('can store a given Working State instead, which becomes the Working State', async () => {
    const working = { ...useEditorStore.getState().editor.working, vol1: 20 };

    const done = useEditorStore.getState().storeSlot(9, shimmer, working);
    await vi.runAllTimersAsync();
    await done;

    expect(useEditorStore.getState().editor.working).toEqual(working);
    expect(useEditorStore.getState().editor.slotMap[9]?.snapshot).toEqual(working);
    expect(virtualPedal.getSnapshot().state.vol1).toBe(20);
    expect(loggedCcs(0).filter((cc) => cc === '111')).toHaveLength(1);
  });

  it('does not store, or record a store, when its Send All is abandoned', async () => {
    const done = useEditorStore.getState().storeSlot(9, shimmer);
    void useEditorStore.getState().sendAll();
    await vi.runAllTimersAsync();

    expect(await done).toBe(false);
    expect(loggedCcs(0)).not.toContain('111');
    expect(useEditorStore.getState().editor.slotMap).toEqual({});
  });

  it('recalling a Slot the Slot Map knows makes its snapshot the Working State, In Sync', async () => {
    useEditorStore.getState().setParam('vol2', 90);
    await store(9);
    useEditorStore.getState().setParam('vol2', 10);
    useEditorStore.getState().recallSlot(10);

    useEditorStore.getState().recallSlot(9);

    expect(useEditorStore.getState()).toMatchObject({ selectedSlot: 9, editor: { sync: 'inSync' } });
    expect(useEditorStore.getState().editor.working.vol2).toBe(90);
    // The Virtual Pedal recalls the same thing on its own.
    expect(virtualPedal.getSnapshot().state.vol2).toBe(90);
  });

  it('Live sends PC 0 and makes the Sync Status Possibly Stale', () => {
    setSyncStatus('inSync');

    useEditorStore.getState().goLive();

    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xc1, 0]);
    expect(useEditorStore.getState().editor.sync).toBe('possiblyStale');
  });

  it('forgets a Slot stored with Raw MIDI, as the editor can’t know what the pedal held', async () => {
    await store(9);

    useEditorStore.getState().forward(controlChange(2, 111, 9));

    expect(useEditorStore.getState().editor.slotMap).toEqual({});
  });
});

describe('Performance Controls', () => {
  it('Expression sends CC 100 at most once per 5 ms, always the final value, and stays out of the Working State', async () => {
    const { setParam } = useEditorStore.getState();
    const working = useEditorStore.getState().editor.working;

    for (let v = 0; v <= 50; v += 10) setParam('expression', v);
    await vi.advanceTimersByTimeAsync(5);

    expect(virtualPedal.getSnapshot().log.map((e) => e.text)).toEqual(['CC 100 = 0 → Expression', 'CC 100 = 50 → Expression · Expression: no target dips on']);
    expect(useEditorStore.getState().editor.performance.expression).toBe(50);
    expect(useEditorStore.getState().editor.working).toBe(working);
  });

  it('Raw MIDI to CC 100 sets Expression as a value, not on/off', () => {
    useEditorStore.getState().forward(controlChange(2, 100, 70));

    expect(useEditorStore.getState().editor.performance.expression).toBe(70);
  });
});

describe('MIDI channel', () => {
  it('the MIDI channel wizard sends PC 0 on the chosen MIDI channel, then the editor uses it', () => {
    useEditorStore.getState().pedalPoweredUpForMidiChannel();
    setSyncStatus('inSync');

    useEditorStore.getState().setPedalMidiChannel(7);

    expect(virtualPedal.getSnapshot().log.at(-1)?.text).toBe('PC 0 on MIDI channel 7 → MIDI channel set to 7');
    expect(useEditorStore.getState()).toMatchObject({ editor: { global: { midiChannel: 7 }, sync: 'possiblyStale' } });
    useEditorStore.getState().setParam('vol2', 10);
    expect(virtualPedal.getSnapshot().state.vol2).toBe(10);
  });
});

describe('MIDI Monitor', () => {
  it('logs every outgoing message newest first, one row per CC while it repeats', async () => {
    const { setParam, recallSlot, clearSent } = useEditorStore.getState();

    setParam('vol2', 10);
    setParam('ampType', 2);
    setParam('ampType', 3);
    recallSlot(4);
    await vi.runAllTimersAsync();

    expect(useEditorStore.getState().sent.map((m) => m.bytes)).toEqual([
      [0xc1, 4],
      [0xb1, 21, 3],
      [0xb1, 15, 10],
    ]);
    clearSent();
    expect(useEditorStore.getState().sent).toEqual([]);
  });
});

describe('undo/redo', () => {
  it('undoes and redoes Working State edits, sending each result to the pedal', async () => {
    const { setParam } = useEditorStore.getState();
    setParam('effectOrder', 2);
    setParam('motoByp2', 127);
    await vi.runAllTimersAsync();

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().editor.working.motoByp2).toBe(PARAMS.motoByp2.default);
    expect(virtualPedal.getSnapshot().state.motoByp2).toBe(PARAMS.motoByp2.default);
    useEditorStore.getState().undo();
    expect(virtualPedal.getSnapshot().state.effectOrder).toBe(PARAMS.effectOrder.default);
    expect(useEditorStore.getState().canUndo).toBe(false);

    useEditorStore.getState().redo();
    useEditorStore.getState().redo();
    expect(virtualPedal.getSnapshot().state.effectOrder).toBe(2);
    expect(virtualPedal.getSnapshot().state.motoByp2).toBe(127);
    expect(useEditorStore.getState().canRedo).toBe(false);
  });

  it('does nothing with nothing to undo or redo', () => {
    const before = virtualPedal.getSnapshot().log.length;
    useEditorStore.getState().undo();
    useEditorStore.getState().redo();
    expect(virtualPedal.getSnapshot().log.length).toBe(before);
  });

  it('undoes a knob drag as one step, after its last throttled value has gone out', async () => {
    const { beginGesture, endGesture, setParam } = useEditorStore.getState();
    beginGesture();
    for (let v = 65; v <= 100; v++) setParam('vol2', v);
    endGesture();
    useEditorStore.getState().undo();
    await vi.runAllTimersAsync();

    expect(useEditorStore.getState().editor.working.vol2).toBe(PARAMS.vol2.default);
    expect(virtualPedal.getSnapshot().state.vol2).toBe(PARAMS.vol2.default);
    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it('leaves Global Settings and Performance Controls alone', () => {
    const s = useEditorStore.getState();
    s.setParam('vol2', 100);
    s.setMidiChannel(5);
    s.setParam('expression', 10);

    useEditorStore.getState().undo();
    const {
      editor: { working, global, performance },
      canUndo,
    } = useEditorStore.getState();
    expect(working.vol2).toBe(PARAMS.vol2.default);
    expect(global.midiChannel).toBe(5);
    expect(performance).toEqual({ expression: 10 });
    expect(canUndo).toBe(false);
  });

  it('starts afresh when a whole new Working State is loaded', async () => {
    useEditorStore.getState().setParam('vol2', 100);
    const done = useEditorStore.getState().loadWorking({ ...useEditorStore.getState().editor.working, vol1: 20 });
    await vi.runAllTimersAsync();
    await done;
    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it('starts afresh when a Slot is recalled', () => {
    const s = useEditorStore.getState();
    s.setParam('vol2', 100);
    s.setParam('vol1', 20);
    s.undo();
    expect(useEditorStore.getState().canRedo).toBe(true);

    useEditorStore.getState().recallSlot(3);
    expect(useEditorStore.getState().canUndo).toBe(false);
    expect(useEditorStore.getState().canRedo).toBe(false);
  });

  it('starts afresh on going Live', () => {
    useEditorStore.getState().setParam('vol2', 100);

    useEditorStore.getState().goLive();

    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it('starts afresh when the MIDI channel wizard goes Live', () => {
    useEditorStore.getState().setParam('vol2', 100);

    useEditorStore.getState().setPedalMidiChannel(7);

    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it('does not record the Test button or Raw MIDI', async () => {
    const done = useEditorStore.getState().test();
    await vi.runAllTimersAsync();
    await done;
    useEditorStore.getState().forward(controlChange(2, PARAMS.vol2.cc, 3));
    expect(useEditorStore.getState().canUndo).toBe(false);
  });
});

describe('Raw MIDI CC', () => {
  it('sends CC 56 like any other: there is no CC 56 guard', () => {
    useEditorStore.getState().forward(controlChange(2, 56, 127));

    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xb1, 56, 127]);
    expect(virtualPedal.getSnapshot().log.at(-1)?.text).toBe('CC 56 = 127 → (not in MIDI map)');
  });
});

describe('Raw MIDI Program Change', () => {
  /** Makes an undoable edit, so a cleared history shows. */
  function editMix() {
    useEditorStore.getState().setParam('vol2', 100);
    expect(useEditorStore.getState().canUndo).toBe(true);
  }

  it('PC n recalls a Slot the Slot Map doesn’t know, like recallSlot, but leaves the Slot selection alone', () => {
    editMix();
    setSyncStatus('inSync');
    useEditorStore.setState({ selectedSlot: 4 });
    const working = useEditorStore.getState().editor.working;

    useEditorStore.getState().forward(programChange(2, 7));

    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xc1, 7]);
    expect(useEditorStore.getState()).toMatchObject({ selectedSlot: 4, editor: { sync: 'unknown', working }, canUndo: false });
  });

  it('PC n recalling a Slot the Slot Map knows makes its snapshot the Working State, In Sync', async () => {
    useEditorStore.getState().setParam('vol2', 90);
    const stored = useEditorStore.getState().storeSlot(9, { presetId: null, name: 'Untitled' });
    await vi.runAllTimersAsync();
    await stored;
    useEditorStore.getState().setParam('vol2', 10);
    useEditorStore.setState({ selectedSlot: 2 });

    useEditorStore.getState().forward(programChange(2, 9));

    expect(useEditorStore.getState()).toMatchObject({ selectedSlot: 2, editor: { sync: 'inSync' }, canUndo: false });
    expect(useEditorStore.getState().editor.working.vol2).toBe(90);
    expect(virtualPedal.getSnapshot().state.vol2).toBe(90);
  });

  it('PC 0 goes Live: the undo history clears and the Sync Status is Possibly Stale', () => {
    editMix();
    setSyncStatus('inSync');

    useEditorStore.getState().forward(programChange(2, 0));

    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xc1, 0]);
    expect(useEditorStore.getState()).toMatchObject({ editor: { sync: 'possiblyStale' }, canUndo: false });
  });

  it('PC 123–127 reach no Slot and change nothing in the editor', () => {
    editMix();
    setSyncStatus('inSync');
    const before = useEditorStore.getState();

    for (const program of [123, 127]) useEditorStore.getState().forward(programChange(2, program));

    expect(useEditorStore.getState().sent.slice(0, 2).map((m) => m.bytes)).toEqual([
      [0xc1, 127],
      [0xc1, 123],
    ]);
    expect(useEditorStore.getState()).toMatchObject({
      editor: { sync: 'inSync', working: before.editor.working },
      selectedSlot: before.selectedSlot,
      canUndo: true,
    });
  });
});

describe('MIDI input and Pass-through', () => {
  async function connectWithInput() {
    const fake = fakeMidiAccess();
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => fake.access });
    await useEditorStore.getState().connectWebMidi();
    return fake;
  }

  it('lists the Web MIDI inputs and starts with none selected', async () => {
    await connectWithInput();

    expect(useEditorStore.getState()).toMatchObject({ inputs: [{ id: 'in-1', name: 'DAW' }], inputId: null });
  });

  it('hears nothing until an input is selected', async () => {
    const fake = await connectWithInput();

    fake.play([0xb1, 15, 3]);

    expect(useEditorStore.getState().editor.working.vol2).not.toBe(3);
    expect(virtualPedal.getSnapshot().log).toEqual([]);
  });

  it('passes messages on the pedal’s MIDI channel through to the pedal unchanged, updating the Working State', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    const from = virtualPedal.getSnapshot().log.length;

    fake.play([0xb1, 17, 90]);

    expect(useEditorStore.getState().editor.working.tone2).toBe(90);
    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xb1, 17, 90]);
    expect(virtualPedal.getSnapshot().log.slice(from).map((e) => e.text)).toEqual(['CC 17 = 90 → Tone 2']);
    expect(useEditorStore.getState().canUndo).toBe(false);
  });

  it('forwards a CC outside the MIDI map to the pedal without decoding it', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    const before = useEditorStore.getState().editor;
    const from = virtualPedal.getSnapshot().log.length;

    fake.play([0xb1, 105, 127]);

    expect(useEditorStore.getState().sent[0]?.bytes).toEqual([0xb1, 105, 127]);
    expect(useEditorStore.getState().editor).toEqual(before);
    expect(virtualPedal.getSnapshot().log.slice(from).map((e) => e.text)).toEqual(['CC 105 = 127 → (not in MIDI map)']);
  });

  it('never holds back a passed-through continuous control', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    const from = virtualPedal.getSnapshot().log.length;

    for (const value of [1, 2, 3]) fake.play([0xb1, 15, value]);

    expect(virtualPedal.getSnapshot().log.slice(from)).toHaveLength(3);
  });

  it('a Program Change recalls the Slot like any other: Unknown when the Slot Map has no entry', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    setSyncStatus('inSync');

    fake.play([0xc1, 9]);

    expect(useEditorStore.getState().editor.sync).toBe('unknown');
  });

  it('drops MIDI clock: the pedal doesn’t follow it', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');

    fake.play([0xf8]);

    expect(useEditorStore.getState().sent).toEqual([]);
  });

  it('forwards nothing from another MIDI channel', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    const before = useEditorStore.getState();

    fake.play([0xb4, 15, 3]);

    expect(useEditorStore.getState().sent).toBe(before.sent);
    expect(useEditorStore.getState().editor).toBe(before.editor);
  });

  it('hears nothing once the input is deselected', async () => {
    const fake = await connectWithInput();
    useEditorStore.getState().setInput('in-1');
    useEditorStore.getState().setInput(null);

    fake.play([0xb1, 15, 3]);

    expect(useEditorStore.getState().sent).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { PARAMS, paramByCc } from '../midi/map';
import { dispatch, encodeSendAll, initialEditorState, sendAllOrder, type EditorAction, type EditorState } from './core';
import { EMPTY_HISTORY } from './history';
import { defaultWorkingState } from './state';

/** Dispatches each action in turn; the messages are every action's, in order. */
function run(state: EditorState, ...actions: EditorAction[]) {
  return actions.reduce(
    (acc, action) => {
      const result = dispatch(acc.state, action);
      return { state: result.state, messages: [...acc.messages, ...result.messages] };
    },
    { state, messages: [] as number[][] },
  );
}

const set = (id: Extract<EditorAction, { type: 'setParam' }>['id'], value: number): EditorAction => ({
  type: 'setParam',
  id,
  value,
});

const fresh = initialEditorState;

describe('the initial Editor State', () => {
  it('holds the default Working State, Performance Controls at rest, MIDI channel 2 and Possibly Stale', () => {
    const state = fresh();

    expect(state.working).toEqual(defaultWorkingState());
    expect(state.performance).toEqual({ expression: 0 });
    expect(state.global).toEqual({ midiChannel: 2 });
    expect(state.sync).toBe('possiblyStale');
    expect(state.slotMap).toEqual({});
    expect(state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('restore', () => {
  const working = { ...defaultWorkingState(), vol2: 100 };
  const slotMap = { 5: { slot: 5, snapshot: working, name: 'Untitled', writtenAt: '2026-10-05T12:00:00.000Z' } };

  it('takes up the last session’s Working State, Slot Map and MIDI channel, sending nothing', () => {
    const { state, messages } = dispatch(fresh(), { type: 'restore', working, slotMap, midiChannel: 7 });

    expect(messages).toEqual([]);
    expect(state.working).toEqual(working);
    expect(state.slotMap).toEqual(slotMap);
    expect(state.global.midiChannel).toBe(7);
  });

  it('is Possibly Stale, with no undo history: the pedal may have been changed since', () => {
    const edited = run(fresh(), { type: 'sendAllFinished' }, set('vol2', 10)).state;
    const { state } = dispatch(edited, { type: 'restore', working, slotMap, midiChannel: 2 });

    expect(state.sync).toBe('possiblyStale');
    expect(state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('setParam', () => {
  it('setting Vol 2 to 100 on MIDI channel 2 sends B1 0F 64', () => {
    const result = dispatch(fresh(), set('vol2', 100));

    expect(result.state.working.vol2).toBe(100);
    expect(result.messages).toEqual([[0xb1, 0x0f, 0x64]]);
  });

  it('sends on the Editor State’s MIDI channel', () => {
    const { messages } = run(fresh(), { type: 'setMidiChannel', midiChannel: 5 }, set('vol2', 1));

    expect(messages).toEqual([[0xb4, 0x0f, 1]]);
  });

  it('clamps and rounds values into the range the MIDI map allows', () => {
    expect(dispatch(fresh(), set('vol2', 200)).messages).toEqual([[0xb1, 0x0f, 0x7f]]);
    expect(dispatch(fresh(), set('vol2', -5)).messages).toEqual([[0xb1, 0x0f, 0x00]]);
    expect(dispatch(fresh(), set('vol2', 63.6)).state.working.vol2).toBe(64);
  });

  it.each([
    ['gain2', 14, 10],
    ['gain1', 16, 20],
    ['tone2', 17, 90],
    ['vol1', 18, 100],
    ['tone1', 19, 30],
    ['ampType', 21, 3],
    ['effectOrder', 22, 1],
    ['odType', 23, 2],
    ['gateRelease', 27, 10],
    ['gateThreshold', 29, 127],
    ['clean1', 72, 127],
    ['noiseGate', 71, 127],
    ['channel1Bypass', 102, 127],
    ['channel2Bypass', 103, 0],
  ] as const)('%s sends CC %i = %i and lands in the Working State', (id, cc, value) => {
    const result = dispatch(fresh(), set(id, value));

    expect(result.messages).toEqual([[0xb1, cc, value]]);
    expect(result.state.working[id]).toBe(value);
  });

  it('sends 3-position toggles only as positions 1/2/3', () => {
    expect(dispatch(fresh(), set('ampType', 0)).messages).toEqual([[0xb1, 21, 1]]);
    expect(dispatch(fresh(), set('odType', 9)).messages).toEqual([[0xb1, 23, 3]]);
    expect(dispatch(fresh(), set('effectOrder', 2)).messages).toEqual([[0xb1, 22, 2]]);
  });

  it('sends on/off params only as 0 or 127', () => {
    expect(dispatch(fresh(), set('motoByp2', 1)).messages).toEqual([[0xb1, 74, 127]]);
    expect(dispatch(fresh(), set('channel1Bypass', 1)).messages).toEqual([[0xb1, 102, 127]]);
    expect(dispatch(fresh(), set('channel2Bypass', 0)).messages).toEqual([[0xb1, 103, 0]]);
  });

  it.each([
    ['volume1Target', 61],
    ['volume2Target', 62],
    ['gain1Target', 63],
    ['gain2Target', 64],
    ['tone1Target', 65],
    ['tone2Target', 66],
    ['sweep', 67],
    ['polarity', 68],
    ['noiseGate', 71],
    ['clean1', 72],
    ['motoByp1', 73],
    ['motoByp2', 74],
    ['contour2', 75],
    ['presence2', 76],
    ['master', 77],
  ] as const)('dip %s sends CC %i = 127 on, 0 off', (id, cc) => {
    const { messages, state } = run(fresh(), set(id, 1), set(id, 0));

    expect(messages).toEqual([
      [0xb1, cc, 127],
      [0xb1, cc, 0],
    ]);
    expect(state.working[id]).toBe(0);
  });

  it('Expression sends CC 100, clamped and rounded', () => {
    expect(dispatch(fresh(), set('expression', 90))).toMatchObject({
      state: { performance: { expression: 90 } },
      messages: [[0xb1, 100, 90]],
    });
    expect(dispatch(fresh(), set('expression', 300)).messages).toEqual([[0xb1, 100, 127]]);
    expect(dispatch(fresh(), set('expression', 12.4)).state.performance.expression).toBe(12);
  });

  it('a single edit never changes the Sync Status', () => {
    for (const status of ['inSync', 'possiblyStale', 'unknown'] as const) {
      const start = { ...fresh(), sync: status };

      expect(dispatch(start, set('vol2', 3)).state.sync).toBe(status);
    }
  });
});

describe('undo/redo', () => {
  it('undoes and redoes Working State edits, sending each result', () => {
    const edited = run(fresh(), set('vol2', 10), set('gateRelease', 90)).state;

    const undone = run(edited, { type: 'undo' }, { type: 'undo' });
    expect(undone.state.working).toMatchObject({ vol2: 64, gateRelease: 64 });
    expect(undone.messages).toEqual([
      [0xb1, 27, 64],
      [0xb1, 15, 64],
    ]);

    const redone = dispatch(undone.state, { type: 'redo' });
    expect(redone.state.working.vol2).toBe(10);
    expect(redone.messages).toEqual([[0xb1, 15, 10]]);
  });

  it('records nothing for edits made with undoable: false, or for Performance Controls', () => {
    const { state } = run(
      fresh(),
      { type: 'setParam', id: 'channel2Bypass', value: 127, undoable: false },
      set('expression', 9),
    );

    expect(state.history).toEqual(EMPTY_HISTORY);
  });

  it('records a gesture as one step', () => {
    const { state } = run(fresh(), { type: 'beginGesture' }, set('vol2', 10), set('vol2', 20), { type: 'endGesture' });

    expect(dispatch(state, { type: 'undo' }).messages).toEqual([[0xb1, 15, 64]]);
  });

  it('does nothing with nothing to undo or redo', () => {
    expect(dispatch(fresh(), { type: 'undo' })).toEqual({ state: fresh(), messages: [] });
    expect(dispatch(fresh(), { type: 'redo' })).toEqual({ state: fresh(), messages: [] });
  });
});

describe('load', () => {
  it('replaces the Working State and clears the history, Possibly Stale until Send All finishes; sends nothing itself', () => {
    const working = { ...defaultWorkingState(), vol2: 3 };
    const start = run(fresh(), { type: 'sendAllFinished' }, set('gateRelease', 5)).state;

    const result = dispatch(start, { type: 'load', working });

    expect(result).toMatchObject({ state: { working, history: EMPTY_HISTORY, sync: 'possiblyStale' }, messages: [] });
  });
});

describe('Slots', () => {
  const origin = { presetId: 'p1', name: 'Shimmer' };
  /** Slot 9 stored with Vol 2 at 100, then Vol 2 moved on to 5. */
  const withSlot9 = () =>
    run(
      fresh(),
      set('vol2', 100),
      { type: 'sendAllFinished' },
      { type: 'store', slot: 9, origin, writtenAt: '2026-10-07T00:00:00.000Z' },
      set('vol2', 5),
    ).state;

  it('storing sends CC 111 = n and records the Working State in the Slot Map', () => {
    const start = run(fresh(), set('vol2', 100)).state;
    const result = dispatch(start, { type: 'store', slot: 9, origin, writtenAt: 'when' });

    expect(result.messages).toEqual([[0xb1, 111, 9]]);
    expect(result.state.slotMap[9]).toEqual({ slot: 9, snapshot: start.working, presetId: 'p1', name: 'Shimmer', writtenAt: 'when' });
  });

  it('records a store with no source Preset under its name only', () => {
    const result = dispatch(fresh(), { type: 'store', slot: 3, origin: { presetId: null, name: 'Untitled' }, writtenAt: 'when' });

    expect(result.state.slotMap[3]).not.toHaveProperty('presetId');
  });

  it('recalling a Slot the Slot Map knows sends PC n and makes its snapshot the Working State, In Sync', () => {
    const result = dispatch({ ...withSlot9(), sync: 'unknown' }, { type: 'recall', slot: 9 });

    expect(result.messages).toEqual([[0xc1, 9]]);
    expect(result.state.working.vol2).toBe(100);
    expect(result.state.sync).toBe('inSync');
    expect(result.state.history).toEqual(EMPTY_HISTORY);
  });

  it('recalling a Slot the Slot Map doesn’t know leaves the Working State, Unknown', () => {
    const start = withSlot9();
    const result = dispatch(start, { type: 'recall', slot: 10 });

    expect(result.messages).toEqual([[0xc1, 10]]);
    expect(result.state.working).toEqual(start.working);
    expect(result.state.sync).toBe('unknown');
    expect(result.state.history).toEqual(EMPTY_HISTORY);
  });

  it('recalling any Toggle Slot is Unknown until the editor stores to it: no Slot is special', () => {
    const inSync = run(fresh(), { type: 'sendAllFinished' }).state;
    for (const slot of [1, 2, 3, 4]) {
      expect(dispatch(inSync, { type: 'recall', slot }).state.sync, `Slot ${slot}`).toBe('unknown');
    }

    const stored = run(inSync, { type: 'store', slot: 2, origin, writtenAt: 'when' }, { type: 'live' }).state;
    expect(dispatch(stored, { type: 'recall', slot: 2 }).state.sync).toBe('inSync');
  });

  it('Live sends PC 0, clears the history and makes the Sync Status Possibly Stale', () => {
    const result = dispatch(withSlot9(), { type: 'live' });

    expect(result.messages).toEqual([[0xc1, 0]]);
    expect(result.state.sync).toBe('possiblyStale');
    expect(result.state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('forward', () => {
  const forward = (state: EditorState, bytes: number[]) => dispatch(state, { type: 'forward', bytes });

  it.each([
    ['a mapped CC', [0xb1, 15, 3]],
    ['a toggle out of range', [0xb1, 21, 0]],
    ['a CC on another MIDI channel', [0xb4, 15, 3]],
    ['an unmapped CC', [0xb1, 1, 3]],
    ['PC 0', [0xc1, 0]],
    ['PC n', [0xc1, 9]],
    ['PC 123', [0xc1, 123]],
    ['Save to Slot', [0xb1, 111, 9]],
    ['MIDI clock', [0xf8]],
  ])('sends %s unchanged', (_, bytes) => {
    expect(forward(fresh(), bytes).messages).toEqual([bytes]);
  });

  it('puts a forwarded CC in the slice its scope picks, as the pedal decodes it', () => {
    let state = fresh();
    state = forward(state, [0xb1, 21, 0]).state;
    state = forward(state, [0xb1, 100, 70]).state;

    expect(state.working.ampType).toBe(1);
    expect(state.performance).toMatchObject({ expression: 70 });
  });

  it('does not record a forwarded CC for undo', () => {
    expect(forward(fresh(), [0xb1, 15, 3]).state.history).toEqual(EMPTY_HISTORY);
  });

  it('changes nothing for messages the pedal ignores or can’t place', () => {
    for (const bytes of [[0xb4, 15, 3], [0xb1, 1, 3], [0xc1, 123], [0xb1, 111, 0], [0xb1, 105, 127], [0xb1, 56, 0], [0xf8]]) {
      expect(forward(fresh(), bytes).state, String(bytes)).toEqual(fresh());
    }
  });

  it('PC 0 goes Live: Possibly Stale, history cleared', () => {
    const start = run(fresh(), { type: 'sendAllFinished' }, set('vol2', 1)).state;
    const { state } = forward(start, [0xc1, 0]);

    expect(state.sync).toBe('possiblyStale');
    expect(state.history).toEqual(EMPTY_HISTORY);
  });

  it('PC n recalls a Slot by the Slot Map: Unknown when it has no entry, its snapshot In Sync when it has', () => {
    expect(forward(fresh(), [0xc1, 9]).state.sync).toBe('unknown');

    const stored = run(
      fresh(),
      set('vol2', 100),
      { type: 'store', slot: 9, origin: { presetId: null, name: 'Untitled' }, writtenAt: 'when' },
      set('vol2', 5),
    ).state;
    const { state } = forward(stored, [0xc1, 9]);
    expect(state.working.vol2).toBe(100);
    expect(state.sync).toBe('inSync');
  });

  it('Save to Slot forgets that Slot, as the editor can’t know what the pedal held', () => {
    const stored = dispatch(fresh(), { type: 'store', slot: 9, origin: { presetId: null, name: 'x' }, writtenAt: 'when' }).state;

    expect(forward(stored, [0xb1, 111, 9]).state.slotMap).toEqual({});
  });

  it('reads on the Editor State’s MIDI channel', () => {
    const start = dispatch(fresh(), { type: 'setMidiChannel', midiChannel: 5 }).state;

    expect(forward(start, [0xb1, 15, 3]).state.working.vol2).toBe(64);
    expect(forward(start, [0xb4, 15, 3]).state.working.vol2).toBe(3);
  });
});

describe('receive (Pass-through)', () => {
  const receive = (state: EditorState, bytes: number[]) => dispatch(state, { type: 'receive', bytes });

  it('forwards a message on the pedal’s MIDI channel unchanged and follows it', () => {
    const result = receive(fresh(), [0xb1, 17, 90]);

    expect(result.messages).toEqual([[0xb1, 17, 90]]);
    expect(result.state.working.tone2).toBe(90);
  });

  it('does not record a passed-through CC for undo', () => {
    expect(receive(fresh(), [0xb1, 15, 3]).state.history).toEqual(EMPTY_HISTORY);
  });

  it('never promotes Unknown to In Sync', () => {
    const unknown = receive(fresh(), [0xc1, 9]).state;

    expect(unknown.sync).toBe('unknown');
    expect(receive(unknown, [0xb1, 15, 3]).state.sync).toBe('unknown');
  });

  it('follows the Slot recall rules for Program Changes', () => {
    expect(receive(fresh(), [0xc1, 9]).state.sync).toBe('unknown');
    expect(receive(fresh(), [0xc1, 0]).state.sync).toBe('possiblyStale');

    const stored = run(
      fresh(),
      set('vol2', 100),
      { type: 'store', slot: 9, origin: { presetId: null, name: 'Untitled' }, writtenAt: 'when' },
      set('vol2', 5),
    ).state;
    const { state, messages } = receive(stored, [0xc1, 9]);
    expect(messages).toEqual([[0xc1, 9]]);
    expect(state.working.vol2).toBe(100);
    expect(state.sync).toBe('inSync');
  });

  it('forwards nothing, and changes nothing, on another MIDI channel', () => {
    for (const bytes of [[0xb4, 15, 3], [0xc0, 9], [0x90, 60, 100]]) {
      expect(receive(fresh(), bytes), String(bytes)).toEqual({ state: fresh(), messages: [] });
    }
  });

  it('drops SysEx, MIDI clock and other system messages', () => {
    for (const bytes of [[0xf0, 0x7e, 0xf7], [0xfe], [0xf8], [0xfa], [0xfb], [0xfc]]) {
      expect(receive(fresh(), bytes), String(bytes)).toEqual({ state: fresh(), messages: [] });
    }
  });

  it('routes by the Editor State’s MIDI channel', () => {
    const start = dispatch(fresh(), { type: 'setMidiChannel', midiChannel: 5 }).state;

    expect(receive(start, [0xb4, 15, 3]).messages).toEqual([[0xb4, 15, 3]]);
    expect(receive(start, [0xb1, 15, 3]).messages).toEqual([]);
  });
});

describe('MIDI channel', () => {
  it('setMidiChannel sends nothing', () => {
    const result = dispatch(fresh(), { type: 'setMidiChannel', midiChannel: 7 });

    expect(result).toEqual({ state: { ...fresh(), global: { midiChannel: 7 } }, messages: [] });
  });

  it.each([
    [1, 0xc0],
    [5, 0xc4],
    [16, 0xcf],
  ])('the MIDI channel wizard sends PC 0 on MIDI channel %i, goes Live, and sends on it from then on', (midiChannel, status) => {
    const start = run(fresh(), { type: 'sendAllFinished' }, set('vol2', 1)).state;
    const result = dispatch(start, { type: 'setPedalMidiChannel', midiChannel });

    expect(result.messages).toEqual([[status, 0]]);
    expect(result.state.global.midiChannel).toBe(midiChannel);
    expect(result.state.sync).toBe('possiblyStale');
    expect(result.state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('connection and Send All', () => {
  it('connecting makes the Sync Status Possibly Stale; a finished Send All makes it In Sync', () => {
    const inSync = dispatch(fresh(), { type: 'sendAllFinished' });
    expect(inSync).toMatchObject({ state: { sync: 'inSync' }, messages: [] });

    expect(dispatch(inSync.state, { type: 'connected' })).toMatchObject({ state: { sync: 'possiblyStale' }, messages: [] });
  });

  it('sends every Working State control once, in order dips → toggles → Hidden Options → knobs → footswitches', () => {
    const groups = sendAllOrder().map((id) => PARAMS[id].group);
    const rank = (g: string) => ['dipLeft', 'dipRight', 'toggle', 'hidden', 'knob', 'footswitch'].indexOf(g);

    expect(groups.map(rank)).toEqual([...groups.map(rank)].sort((a, b) => a - b));
    expect(new Set(sendAllOrder())).toEqual(new Set(Object.keys(defaultWorkingState())));
    expect(sendAllOrder()).toHaveLength(Object.keys(defaultWorkingState()).length);
  });

  it('encodes the Working State as CCs on the MIDI channel, in Send All order', () => {
    const working = { ...defaultWorkingState(), vol2: 100, motoByp2: 127, effectOrder: 1, channel1Bypass: 127, gateRelease: 90 };
    const state = { ...fresh(), working, global: { midiChannel: 2 } };

    expect(encodeSendAll(state)).toEqual([
      ...[61, 62, 63, 64, 65, 66, 67, 68].map((cc) => [0xb1, cc, 0]), // Expression / CV targets
      [0xb1, 71, 0], // Noise Gate
      [0xb1, 72, 0], // Clean 1
      [0xb1, 73, 0], // MotoByp 1
      [0xb1, 74, 127], // MotoByp 2
      [0xb1, 75, 0], // Contour 2
      [0xb1, 76, 0], // Presence 2
      [0xb1, 77, 0], // Master
      [0xb1, 21, 2], // Amp Type: Plexi
      [0xb1, 22, 1], // Effect Order: 2>1
      [0xb1, 23, 2], // OD Type: Super
      [0xb1, 27, 90], // Gate Release
      [0xb1, 29, 64], // Gate Threshold
      [0xb1, 14, 64], // Gain 2
      [0xb1, 15, 100], // Vol 2
      [0xb1, 16, 64], // Gain 1
      [0xb1, 17, 64], // Tone 2
      [0xb1, 18, 64], // Vol 1
      [0xb1, 19, 64], // Tone 1
      [0xb1, 102, 127], // Channel 1 Bypass
      [0xb1, 103, 127], // Channel 2 Bypass
    ]);
  });

  it('never sends Performance Controls', () => {
    expect(sendAllOrder()).not.toContain('expression');
  });
});

describe('the MIDI map', () => {
  it('New starts with every knob at 64, toggles in the middle, Channel 2 engaged and Channel 1 bypassed', () => {
    expect(defaultWorkingState()).toMatchObject({
      gain2: 64,
      vol2: 64,
      gain1: 64,
      tone2: 64,
      vol1: 64,
      tone1: 64,
      ampType: 2,
      effectOrder: 2,
      odType: 2,
      channel2Bypass: 127,
      channel1Bypass: 0,
    });
  });

  it('keeps Expression out of Presets', () => {
    expect(PARAMS.expression.scope).toBe('performance');
    expect(Object.keys(defaultWorkingState())).not.toContain('expression');
  });

  it('has none of the Brothers AM or Clean CCs that SPEC §4 leaves out', () => {
    for (const cc of [20, 52, 56, 104, 105, 106]) expect(paramByCc(cc), `CC ${cc}`).toBeUndefined();
  });

  it('names Sweep B/T and Polarity F/R', () => {
    expect(PARAMS.sweep.values.map((v) => v.label)).toEqual(['B', 'T']);
    expect(PARAMS.polarity.values.map((v) => v.label)).toEqual(['F', 'R']);
  });
});

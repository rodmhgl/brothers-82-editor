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
    expect(state.performance).toEqual({ dynamicsMax: 0, ramping: 0, expression: 0 });
    expect(state.global).toEqual({ midiChannel: 2 });
    expect(state.sync).toBe('possiblyStale');
    expect(state.slotMap).toEqual({});
    expect(state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('restore', () => {
  const working = { ...defaultWorkingState(), sensitivity: 100 };
  const slotMap = { 5: { slot: 5, snapshot: working, name: 'Untitled', writtenAt: '2026-10-05T12:00:00.000Z' } };

  it('takes up the last session’s Working State, Slot Map and MIDI channel, sending nothing', () => {
    const { state, messages } = dispatch(fresh(), { type: 'restore', working, slotMap, midiChannel: 7 });

    expect(messages).toEqual([]);
    expect(state.working).toEqual(working);
    expect(state.slotMap).toEqual(slotMap);
    expect(state.global.midiChannel).toBe(7);
  });

  it('is Possibly Stale, with no undo history: the pedal may have been changed since', () => {
    const edited = run(fresh(), { type: 'sendAllFinished' }, set('sensitivity', 10)).state;
    const { state } = dispatch(edited, { type: 'restore', working, slotMap, midiChannel: 2 });

    expect(state.sync).toBe('possiblyStale');
    expect(state.history).toEqual(EMPTY_HISTORY);
  });
});

describe('setParam', () => {
  it('setting Mix to 100 on MIDI channel 2 sends B1 0F 64', () => {
    const result = dispatch(fresh(), set('sensitivity', 100));

    expect(result.state.working.sensitivity).toBe(100);
    expect(result.messages).toEqual([[0xb1, 0x0f, 0x64]]);
  });

  it('sends on the Editor State’s MIDI channel', () => {
    const { messages } = run(fresh(), { type: 'setMidiChannel', midiChannel: 5 }, set('sensitivity', 1));

    expect(messages).toEqual([[0xb4, 0x0f, 1]]);
  });

  it('clamps and rounds values into the range the MIDI map allows', () => {
    expect(dispatch(fresh(), set('sensitivity', 200)).messages).toEqual([[0xb1, 0x0f, 0x7f]]);
    expect(dispatch(fresh(), set('sensitivity', -5)).messages).toEqual([[0xb1, 0x0f, 0x00]]);
    expect(dispatch(fresh(), set('sensitivity', 63.6)).state.working.sensitivity).toBe(64);
  });

  it.each([
    ['dynamics', 14, 10],
    ['wet', 16, 20],
    ['attack', 17, 90],
    ['dry', 19, 30],
    ['release', 21, 3],
    ['physics', 23, 2],
    ['sidechain', 74, 127],
    ['noiseGate', 75, 0],
    ['mode', 22, 2],
    ['eq', 18, 100],
    ['swell', 103, 127],
    ['bypass', 102, 0],
    ['gateRelease', 24, 10],
    ['gateThreshold', 25, 127],
    ['swellIn', 26, 99],
    ['userRelease', 27, 0],
    ['envelopeBalance', 28, 64],
    ['swellOut', 29, 127],
    ['rampSpeed', 20, 5],
    ['shiftyResponse', 32, 0],
    ['envelopeType', 31, 1],
    ['spreadRouting', 33, 3],
  ] as const)('%s sends CC %i = %i and lands in the Working State', (id, cc, value) => {
    const result = dispatch(fresh(), set(id, value));

    expect(result.messages).toEqual([[0xb1, cc, value]]);
    expect(result.state.working[id]).toBe(value);
  });

  it('sends 3-position toggles only as positions 1/2/3', () => {
    expect(dispatch(fresh(), set('release', 0)).messages).toEqual([[0xb1, 21, 1]]);
    expect(dispatch(fresh(), set('physics', 9)).messages).toEqual([[0xb1, 23, 3]]);
    expect(dispatch(fresh(), set('envelopeType', 9)).messages).toEqual([[0xb1, 31, 3]]);
    expect(dispatch(fresh(), set('spreadRouting', 0)).messages).toEqual([[0xb1, 33, 1]]);
  });

  it('sends switches only as 0 or 127', () => {
    expect(dispatch(fresh(), set('sidechain', 1)).messages).toEqual([[0xb1, 74, 127]]);
    expect(dispatch(fresh(), set('swell', 1)).messages).toEqual([[0xb1, 103, 127]]);
  });

  it('sends Shifty Response only as ASR (0) or Envelope (3)', () => {
    expect(dispatch(fresh(), set('shiftyResponse', 7)).messages).toEqual([[0xb1, 32, 3]]);
    expect(dispatch(fresh(), set('shiftyResponse', 0)).messages).toEqual([[0xb1, 32, 0]]);
  });

  it.each([
    ['dynamicsTarget', 61],
    ['attackTarget', 62],
    ['eqTarget', 63],
    ['dryTarget', 64],
    ['wetTarget', 65],
    ['bounce', 66],
    ['sweep', 67],
    ['polarity', 68],
    ['miso', 71],
    ['spread', 72],
    ['latch', 73],
    ['sidechain', 74],
    ['noiseGate', 75],
    ['motion', 76],
    ['swellAux', 77],
    ['dusty', 78],
  ] as const)('dip %s sends CC %i = 127 on, 0 off', (id, cc) => {
    const { messages, state } = run(fresh(), set(id, 1), set(id, 0));

    expect(messages).toEqual([
      [0xb1, cc, 127],
      [0xb1, cc, 0],
    ]);
    expect(state.working[id]).toBe(0);
  });

  it.each([
    ['dynamicsMax', 106, 127],
    ['dynamicsMax', 106, 0],
    ['ramping', 52, 127],
    ['ramping', 52, 0],
  ] as const)('Performance Control %s sends CC %i = %i and lands in the Performance Controls', (id, cc, value) => {
    const result = dispatch(fresh(), set(id, value));

    expect(result.messages).toEqual([[0xb1, cc, value]]);
    expect(result.state.performance[id]).toBe(value);
    expect(result.state.working).toEqual(defaultWorkingState());
  });

  it('Dynamics Max is a level: any non-zero value engages it (127)', () => {
    const { state, messages } = run(fresh(), set('dynamicsMax', 1));

    expect(messages).toEqual([[0xb1, 106, 127]]);
    expect(state.performance.dynamicsMax).toBe(127);
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

      expect(dispatch(start, set('sensitivity', 3)).state.sync).toBe(status);
    }
  });
});

describe('undo/redo', () => {
  it('undoes and redoes Working State edits, sending each result', () => {
    const edited = run(fresh(), set('sensitivity', 10), set('envelopeBalance', 90)).state;

    const undone = run(edited, { type: 'undo' }, { type: 'undo' });
    expect(undone.state.working).toMatchObject({ sensitivity: 77, envelopeBalance: 0 });
    expect(undone.messages).toEqual([
      [0xb1, 28, 0],
      [0xb1, 15, 77],
    ]);

    const redone = dispatch(undone.state, { type: 'redo' });
    expect(redone.state.working.sensitivity).toBe(10);
    expect(redone.messages).toEqual([[0xb1, 15, 10]]);
  });

  it('records nothing for edits made with undoable: false, or for Performance Controls', () => {
    const { state } = run(
      fresh(),
      { type: 'setParam', id: 'bypass', value: 127, undoable: false },
      set('dynamicsMax', 127),
      set('expression', 9),
    );

    expect(state.history).toEqual(EMPTY_HISTORY);
  });

  it('records a gesture as one step', () => {
    const { state } = run(fresh(), { type: 'beginGesture' }, set('sensitivity', 10), set('sensitivity', 20), { type: 'endGesture' });

    expect(dispatch(state, { type: 'undo' }).messages).toEqual([[0xb1, 15, 77]]);
  });

  it('does nothing with nothing to undo or redo', () => {
    expect(dispatch(fresh(), { type: 'undo' })).toEqual({ state: fresh(), messages: [] });
    expect(dispatch(fresh(), { type: 'redo' })).toEqual({ state: fresh(), messages: [] });
  });
});

describe('load', () => {
  it('replaces the Working State and clears the history, Possibly Stale until Send All finishes; sends nothing itself', () => {
    const working = { ...defaultWorkingState(), sensitivity: 3 };
    const start = run(fresh(), { type: 'sendAllFinished' }, set('envelopeBalance', 5)).state;

    const result = dispatch(start, { type: 'load', working });

    expect(result).toMatchObject({ state: { working, history: EMPTY_HISTORY, sync: 'possiblyStale' }, messages: [] });
  });
});

describe('Slots', () => {
  const origin = { presetId: 'p1', name: 'Shimmer' };
  /** Slot 9 stored with Mix at 100, then Mix moved on to 5. */
  const withSlot9 = () =>
    run(
      fresh(),
      set('sensitivity', 100),
      { type: 'sendAllFinished' },
      { type: 'store', slot: 9, origin, writtenAt: '2026-10-07T00:00:00.000Z' },
      set('sensitivity', 5),
    ).state;

  it('storing sends CC 111 = n and records the Working State in the Slot Map', () => {
    const start = run(fresh(), set('sensitivity', 100)).state;
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
    expect(result.state.working.sensitivity).toBe(100);
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

  it('recalling a factory Toggle Slot is Unknown until the editor stores to it', () => {
    const inSync = run(fresh(), { type: 'sendAllFinished' }).state;
    expect(dispatch(inSync, { type: 'recall', slot: 1 }).state.sync).toBe('unknown');
    expect(dispatch(inSync, { type: 'recall', slot: 2 }).state.sync).toBe('unknown');

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

describe('factoryReset', () => {
  /** Slot 9 stored, then Hidden Options, Ramp Speed and a knob edited. */
  const edited = () =>
    run(
      fresh(),
      { type: 'sendAllFinished' },
      { type: 'store', slot: 9, origin: { presetId: null, name: 'Nine' }, writtenAt: 'when' },
      set('gateThreshold', 90),
      set('spreadRouting', 3),
      set('rampSpeed', 10),
      set('sensitivity', 100),
    ).state;

  it('sends CC 56 and puts the Hidden Options back to their defaults, leaving Ramp Speed and the rest', () => {
    const result = dispatch(edited(), { type: 'factoryReset' });

    expect(result.messages).toEqual([[0xb1, 56, 127]]);
    expect(result.state.working).toMatchObject({ gateThreshold: 26, spreadRouting: 2, rampSpeed: 10, sensitivity: 100 });
  });

  it('keeps the Slot Map, clears the history and makes the Sync Status Possibly Stale', () => {
    const start = edited();
    const result = dispatch(start, { type: 'factoryReset' });

    expect(result.state.slotMap).toEqual(start.slotMap);
    expect(result.state.history).toEqual(EMPTY_HISTORY);
    expect(result.state.sync).toBe('possiblyStale');
  });

  it('is followed the same way when forwarded, whatever the value', () => {
    const result = dispatch(edited(), { type: 'forward', bytes: [0xb1, 56, 0] });

    expect(result.messages).toEqual([[0xb1, 56, 0]]);
    expect(result.state.working).toMatchObject({ gateThreshold: 26, spreadRouting: 2, rampSpeed: 10 });
    expect(result.state.sync).toBe('possiblyStale');
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
    ['AUX hold (CC 105)', [0xb1, 105, 127]],
    ['MIDI clock', [0xf8]],
  ])('sends %s unchanged', (_, bytes) => {
    expect(forward(fresh(), bytes).messages).toEqual([bytes]);
  });

  it('puts a forwarded CC in the slice its scope picks, as the pedal decodes it', () => {
    let state = fresh();
    state = forward(state, [0xb1, 21, 0]).state;
    state = forward(state, [0xb1, 106, 1]).state;
    state = forward(state, [0xb1, 100, 70]).state;

    expect(state.working.release).toBe(1);
    expect(state.performance).toMatchObject({ dynamicsMax: 127, expression: 70 });
  });

  it('does not record a forwarded CC for undo', () => {
    expect(forward(fresh(), [0xb1, 15, 3]).state.history).toEqual(EMPTY_HISTORY);
  });

  it('changes nothing for messages the pedal ignores or can’t place', () => {
    for (const bytes of [[0xb4, 15, 3], [0xb1, 1, 3], [0xc1, 123], [0xb1, 111, 0], [0xb1, 105, 127], [0xb1, 105, 0], [0xf8]]) {
      expect(forward(fresh(), bytes).state, String(bytes)).toEqual(fresh());
    }
  });

  it('PC 0 goes Live: Possibly Stale, history cleared', () => {
    const start = run(fresh(), { type: 'sendAllFinished' }, set('sensitivity', 1)).state;
    const { state } = forward(start, [0xc1, 0]);

    expect(state.sync).toBe('possiblyStale');
    expect(state.history).toEqual(EMPTY_HISTORY);
  });

  it('PC n recalls a Slot by the Slot Map: Unknown when it has no entry, its snapshot In Sync when it has', () => {
    expect(forward(fresh(), [0xc1, 9]).state.sync).toBe('unknown');

    const stored = run(
      fresh(),
      set('sensitivity', 100),
      { type: 'store', slot: 9, origin: { presetId: null, name: 'Untitled' }, writtenAt: 'when' },
      set('sensitivity', 5),
    ).state;
    const { state } = forward(stored, [0xc1, 9]);
    expect(state.working.sensitivity).toBe(100);
    expect(state.sync).toBe('inSync');
  });

  it('Save to Slot forgets that Slot, as the editor can’t know what the pedal held', () => {
    const stored = dispatch(fresh(), { type: 'store', slot: 9, origin: { presetId: null, name: 'x' }, writtenAt: 'when' }).state;

    expect(forward(stored, [0xb1, 111, 9]).state.slotMap).toEqual({});
  });

  it('reads on the Editor State’s MIDI channel', () => {
    const start = dispatch(fresh(), { type: 'setMidiChannel', midiChannel: 5 }).state;

    expect(forward(start, [0xb1, 15, 3]).state.working.sensitivity).toBe(77);
    expect(forward(start, [0xb4, 15, 3]).state.working.sensitivity).toBe(3);
  });
});

describe('receive (Pass-through)', () => {
  const receive = (state: EditorState, bytes: number[]) => dispatch(state, { type: 'receive', bytes });

  it('forwards a message on the pedal’s MIDI channel unchanged and follows it', () => {
    const result = receive(fresh(), [0xb1, 17, 90]);

    expect(result.messages).toEqual([[0xb1, 17, 90]]);
    expect(result.state.working.attack).toBe(90);
  });

  it('forwards AUX hold (CC 105) unchanged, leaving the Working State, Swell and Sync Status alone', () => {
    const start = run(fresh(), { type: 'sendAllFinished' }).state;
    const result = receive(start, [0xb1, 105, 127]);

    expect(result.messages).toEqual([[0xb1, 105, 127]]);
    expect(result.state).toEqual(start);
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
      set('sensitivity', 100),
      { type: 'store', slot: 9, origin: { presetId: null, name: 'Untitled' }, writtenAt: 'when' },
      set('sensitivity', 5),
    ).state;
    const { state, messages } = receive(stored, [0xc1, 9]);
    expect(messages).toEqual([[0xc1, 9]]);
    expect(state.working.sensitivity).toBe(100);
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
    const start = run(fresh(), { type: 'sendAllFinished' }, set('sensitivity', 1)).state;
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
    const working = { ...defaultWorkingState(), sensitivity: 100, sidechain: 127, mode: 1, swell: 127, envelopeBalance: 90, shiftyResponse: 3 };
    const state = { ...fresh(), working, global: { midiChannel: 2 } };

    expect(encodeSendAll(state)).toEqual([
      ...[61, 62, 63, 64, 65, 66, 67, 68].map((cc) => [0xb1, cc, 0]), // Ramp / Expression targets
      [0xb1, 71, 0], // Miso
      [0xb1, 72, 0], // Spread
      [0xb1, 73, 0], // Latch
      [0xb1, 74, 127], // Sidechain
      [0xb1, 75, 0], // Noise Gate
      [0xb1, 76, 0], // Motion
      [0xb1, 77, 0], // Swell Aux
      [0xb1, 78, 0], // Dusty
      [0xb1, 21, 2], // Release: User
      [0xb1, 22, 1], // Mode: Shifty
      [0xb1, 23, 2], // Physics: Off
      [0xb1, 20, 64], // Ramp Speed
      [0xb1, 24, 64], // Gate Release
      [0xb1, 25, 26], // Gate Threshold
      [0xb1, 26, 64], // Swell In
      [0xb1, 27, 64], // User Release
      [0xb1, 28, 90], // Envelope Balance
      [0xb1, 29, 64], // Swell Out
      [0xb1, 31, 1], // Envelope Type: Analog
      [0xb1, 32, 3], // Shifty Response: Envelope
      [0xb1, 33, 2], // Spread Routing: Both
      [0xb1, 14, 39], // Dynamics
      [0xb1, 15, 100], // Sensitivity
      [0xb1, 16, 77], // Wet
      [0xb1, 17, 39], // Attack
      [0xb1, 18, 64], // EQ
      [0xb1, 19, 77], // Dry
      [0xb1, 102, 127], // Bypass: engaged
      [0xb1, 103, 127], // Swell
    ]);
  });

  it('never sends Performance Controls', () => {
    for (const id of ['dynamicsMax', 'ramping', 'expression']) expect(sendAllOrder()).not.toContain(id);
  });
});

describe('the MIDI map', () => {
  it('starts from the pedal defaults: engaged, Swell off, toggles in the middle, EQ flat', () => {
    expect(defaultWorkingState()).toMatchObject({ bypass: 127, swell: 0, release: 2, mode: 2, physics: 2, eq: 64 });
  });

  it('keeps Performance Controls out of Presets', () => {
    for (const id of ['dynamicsMax', 'expression', 'ramping'] as const) expect(PARAMS[id].scope, id).toBe('performance');
    for (const id of ['dynamicsMax', 'expression', 'ramping']) expect(Object.keys(defaultWorkingState())).not.toContain(id);
  });

  it('has none of the Lost+Found-only controls: Clock Listen, subdivisions, Factory Reset, Dry Kill, Tap or Random', () => {
    for (const cc of [51, 53, 54, 56, 57, 93, 112, 113, 114]) expect(paramByCc(cc), `CC ${cc}`).toBeUndefined();
  });

  it('names Sweep B/T and Polarity F/R', () => {
    expect(PARAMS.sweep.values.map((v) => v.label)).toEqual(['B', 'T']);
    expect(PARAMS.polarity.values.map((v) => v.label)).toEqual(['F', 'R']);
  });
});

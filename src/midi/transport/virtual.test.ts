import { describe, expect, it } from 'vitest';
import { dispatch, initialEditorState } from '../../model/core';
import { PARAMS, type ParamDef, type ParamId } from '../map';
import { VIRTUAL_PEDAL_PORT, createVirtualPedal } from './virtual';

describe('Virtual Pedal transport', () => {
  it('lists itself as an output and has no inputs (the pedal never sends MIDI)', () => {
    const pedal = createVirtualPedal();

    expect(pedal.listOutputs()).toEqual([VIRTUAL_PEDAL_PORT]);
    expect(pedal.listInputs()).toEqual([]);
  });

  it('decodes a Vol 2 CC into its simulated state and message log', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 0x0f, 0x64]);

    expect(pedal.getSnapshot().state.vol2).toBe(100);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual(['CC 15 = 100 → Vol 2']);
  });

  it('follows the domain core end to end', () => {
    const pedal = createVirtualPedal();
    const { messages } = dispatch(initialEditorState(), { type: 'setParam', id: 'vol2', value: 12 });

    messages.forEach((m) => pedal.send(m));

    expect(pedal.getSnapshot().state.vol2).toBe(12);
  });

  it('logs MIDI clock as unknown: the pedal doesn’t follow it', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xf8]);
    pedal.send([0xfa]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual(['Unknown: F8', 'Unknown: FA']);
  });

  it('notifies subscribers when its state changes', () => {
    const pedal = createVirtualPedal();
    let calls = 0;
    pedal.subscribe(() => calls++);

    pedal.send([0xb1, 0x0f, 0x01]);

    expect(calls).toBe(1);
  });

  it('ignores messages on a MIDI channel other than its own, and logs them', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb0, 0x0f, 0x01]);

    expect(pedal.getSnapshot().state.vol2).toBe(64);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 15 = 1 on MIDI channel 1 → ignored (pedal listens on MIDI channel 2)',
    ]);
  });
});

describe('Virtual Pedal: Brothers 82 controls', () => {
  it('names the position a toggle is now in', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 21, 2]);
    pedal.send([0xb1, 22, 1]);
    pedal.send([0xb1, 23, 127]);

    expect(pedal.getSnapshot().state).toMatchObject({ ampType: 2, effectOrder: 1, odType: 3 });
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 21 = 2 → Amp Type → Plexi',
      'CC 22 = 1 → Effect Order → 2>1',
      'CC 23 = 127 → OD Type → RJM',
    ]);
  });

  it('starts with Channel 2 engaged and Channel 1 bypassed', () => {
    expect(createVirtualPedal().getSnapshot().state).toMatchObject({ channel1Bypass: 0, channel2Bypass: 127 });
  });

  it('decodes the footswitches and dips as off (0) or on (≥1)', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 103, 0]);
    pedal.send([0xb1, 102, 1]);
    pedal.send([0xb1, 72, 64]);
    pedal.send([0xb1, 67, 1]);

    expect(pedal.getSnapshot().state).toMatchObject({ channel2Bypass: 0, channel1Bypass: 127, clean1: 127, sweep: 127 });
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 103 = 0 → Channel 2 Bypass → Bypassed',
      'CC 102 = 1 → Channel 1 Bypass → Engaged',
      'CC 72 = 64 → Clean 1 → On · Clean 1 with 2+1: Channel 1 is now a clean blend',
      'CC 67 = 1 → Sweep → T',
    ]);
  });

  it('decodes every param in the MIDI map into its own state', () => {
    for (const param of Object.values(PARAMS) as ParamDef[]) {
      const pedal = createVirtualPedal();
      const value = param.values?.at(-1)?.value ?? 100;

      pedal.send([0xb1, param.cc, value]);

      expect(pedal.getSnapshot().state[param.id as ParamId], param.id).toBe(value);
      expect(pedal.getSnapshot().log[0]?.text).toMatch(new RegExp(`^CC ${param.cc} = ${value} → ${param.label}`));
    }
  });

  it.each([
    [104, 'CC 104 = 127 → (not in MIDI map)'],
    [105, 'CC 105 = 127 → (not in MIDI map)'],
    [106, 'CC 106 = 127 → (not in MIDI map)'],
    [52, 'CC 52 = 127 → (not in MIDI map)'],
    [56, 'CC 56 = 127 → (not in MIDI map)'],
    [20, 'CC 20 = 127 → (not in MIDI map)'],
  ])('leaves CC %i out of the MIDI map, changing nothing', (cc, text) => {
    const pedal = createVirtualPedal();
    const before = pedal.getSnapshot().state;

    pedal.send([0xb1, cc, 127]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([text]);
    expect(pedal.getSnapshot().state).toEqual(before);
  });

  it('logs Program Changes as Live or a Slot recall, and ignores other MIDI channels', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xc1, 0]);
    pedal.send([0xc1, 5]);
    pedal.send([0xc1, 1]);
    pedal.send([0xc4, 5]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'PC 0 → Live',
      'PC 5 → recall Slot 5 → empty, nothing changes',
      'PC 1 → recall Slot 1 → empty, nothing changes',
      'PC 5 on MIDI channel 5 → ignored (pedal listens on MIDI channel 2)',
    ]);
  });
});

describe('Virtual Pedal: log notes (SPEC.md §5.3)', () => {
  /** The log after sending these CCs on the pedal's MIDI channel. */
  const logAfter = (...ccs: [cc: number, value: number][]) => {
    const pedal = createVirtualPedal();
    ccs.forEach(([cc, value]) => pedal.send([0xb1, cc, value]));
    return pedal.getSnapshot().log.map((e) => e.text);
  };

  it('notes what Master does when it turns on, and only then', () => {
    expect(logAfter([77, 127], [77, 127], [77, 0])).toEqual([
      'CC 77 = 127 → Master → On · Master: Vol 2 now sets the overall output volume',
      'CC 77 = 127 → Master → On',
      'CC 77 = 0 → Master → Off',
    ]);
  });

  it('notes a clean boost when Clean 1 turns on outside 2+1', () => {
    expect(logAfter([22, 1], [72, 127]).at(-1)).toBe('CC 72 = 127 → Clean 1 → On · Clean 1: Channel 1 is now a clean boost');
  });

  it('notes a clean blend when Clean 1 turns on at 2+1', () => {
    expect(logAfter([72, 127])).toEqual(['CC 72 = 127 → Clean 1 → On · Clean 1 with 2+1: Channel 1 is now a clean blend']);
  });

  it('notes the change when Effect Order moves Clean 1 between boost and blend', () => {
    expect(logAfter([72, 127], [22, 1], [22, 3], [22, 2]).slice(1)).toEqual([
      'CC 22 = 1 → Effect Order → 2>1 · Clean 1: Channel 1 is now a clean boost',
      'CC 22 = 3 → Effect Order → 2<1',
      'CC 22 = 2 → Effect Order → 2+1 · Clean 1 with 2+1: Channel 1 is now a clean blend',
    ]);
  });

  it('adds no Clean 1 note to Effect Order while Clean 1 is off', () => {
    expect(logAfter([22, 1], [22, 2])).toEqual(['CC 22 = 1 → Effect Order → 2>1', 'CC 22 = 2 → Effect Order → 2+1']);
  });

  it('notes that Gate Threshold and Gate Release have no effect while Noise Gate is off', () => {
    expect(logAfter([29, 10], [27, 20])).toEqual([
      'CC 29 = 10 → Gate Threshold · Gate Threshold/Gate Release have no effect while Noise Gate is off',
      'CC 27 = 20 → Gate Release · Gate Threshold/Gate Release have no effect while Noise Gate is off',
    ]);
  });

  it('adds no gate note once Noise Gate is on, or to a CC that changes nothing', () => {
    expect(logAfter([29, 64], [71, 127], [29, 10], [27, 20])).toEqual([
      'CC 29 = 64 → Gate Threshold',
      'CC 71 = 127 → Noise Gate → On',
      'CC 29 = 10 → Gate Threshold',
      'CC 27 = 20 → Gate Release',
    ]);
  });

  it('notes that Expression has no target dips on', () => {
    expect(logAfter([100, 40])).toEqual(['CC 100 = 40 → Expression · Expression: no target dips on']);
  });

  it('does not count Sweep and Polarity as target dips', () => {
    expect(logAfter([67, 127], [68, 127], [100, 40]).at(-1)).toBe('CC 100 = 40 → Expression · Expression: no target dips on');
  });

  it.each([61, 62, 63, 64, 65, 66])('adds no Expression note with target dip CC %i on', (cc) => {
    expect(logAfter([cc, 127], [100, 40]).at(-1)).toBe('CC 100 = 40 → Expression');
  });

  it('adds no note to a recalled Slot', () => {
    const pedal = createVirtualPedal();
    [[77, 127], [72, 127], [111, 9], [77, 0], [72, 0]].forEach(([cc, value]) => pedal.send([0xb1, cc!, value!]));

    pedal.send([0xc1, 9]);

    expect(pedal.getSnapshot().log.at(-1)?.text).toBe('PC 9 → recall Slot 9');
  });
});

describe('Virtual Pedal: Slots', () => {
  it('stores its Preset controls with CC 111 = n and brings them back with PC n', () => {
    const pedal = createVirtualPedal();
    pedal.send([0xb1, 15, 100]);
    pedal.send([0xb1, 100, 90]);

    pedal.send([0xb1, 111, 9]);
    pedal.send([0xb1, 15, 10]);
    pedal.send([0xb1, 100, 0]);
    pedal.send([0xc1, 9]);

    // Expression is a Performance Control, so a Slot neither saves nor restores it.
    expect(pedal.getSnapshot().state).toMatchObject({ vol2: 100, expression: 0 });
    const log = pedal.getSnapshot().log.map((e) => e.text);
    expect(log[2]).toBe('CC 111 = 9 → stored in Slot 9');
    expect(log.at(-1)).toBe('PC 9 → recall Slot 9');
  });

  it('stores nothing for a value that is no Slot', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 111, 0]);
    pedal.send([0xb1, 111, 123]);
    pedal.send([0xc1, 123]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 111 = 0 → no such Slot, nothing stored',
      'CC 111 = 123 → no such Slot, nothing stored',
      'PC 123 → no such Slot, nothing changes',
    ]);
  });
});

describe('Virtual Pedal: MIDI channel', () => {
  it('powered up holding both footswitches, adopts the MIDI channel of the first Program Change', () => {
    const pedal = createVirtualPedal();

    pedal.powerUpHoldingBothFootswitches();
    pedal.send([0xb4, 0x0f, 0x01]);
    pedal.send([0xc4, 0]);
    pedal.send([0xb4, 0x0f, 0x10]);
    pedal.send([0xc1, 0]);

    expect(pedal.getSnapshot().midiChannel).toBe(5);
    expect(pedal.getSnapshot().state.vol2).toBe(16);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'Powered up holding both footswitches → waiting for a Program Change to set the MIDI channel',
      'CC 15 = 1 on MIDI channel 5 → ignored (pedal listens on MIDI channel 2)',
      'PC 0 on MIDI channel 5 → MIDI channel set to 5',
      'CC 15 = 16 → Vol 2',
      'PC 0 on MIDI channel 2 → ignored (pedal listens on MIDI channel 5)',
    ]);
  });
});

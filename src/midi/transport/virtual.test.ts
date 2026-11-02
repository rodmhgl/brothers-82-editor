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

  it('decodes a Sensitivity CC into its simulated state and message log', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 0x0f, 0x64]);

    expect(pedal.getSnapshot().state.sensitivity).toBe(100);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual(['CC 15 = 100 → Sensitivity']);
  });

  it('follows the domain core end to end', () => {
    const pedal = createVirtualPedal();
    const { messages } = dispatch(initialEditorState(), { type: 'setParam', id: 'sensitivity', value: 12 });

    messages.forEach((m) => pedal.send(m));

    expect(pedal.getSnapshot().state.sensitivity).toBe(12);
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

    expect(pedal.getSnapshot().state.sensitivity).toBe(77);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 15 = 1 on MIDI channel 1 → ignored (pedal listens on MIDI channel 2)',
    ]);
  });
});

describe('Virtual Pedal: Factory Reset', () => {
  it('puts the Hidden Options back to their defaults, leaving Ramp Speed, the rest and stored Slots', () => {
    const pedal = createVirtualPedal();
    pedal.send([0xb1, 25, 90]);
    pedal.send([0xb1, 20, 10]);
    pedal.send([0xb1, 15, 100]);
    pedal.send([0xb1, 111, 9]);

    pedal.send([0xb1, 56, 0]);

    expect(pedal.getSnapshot().state).toMatchObject({ gateThreshold: 26, rampSpeed: 10, sensitivity: 100 });
    expect(pedal.getSnapshot().log.at(-1)?.text).toBe('CC 56 = 0 → Factory Reset → Hidden Options back to defaults');

    pedal.send([0xc1, 9]);
    expect(pedal.getSnapshot().state.gateThreshold).toBe(90);
  });
});

describe('Virtual Pedal: Clean controls', () => {
  it('names the position a toggle is now in', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 22, 1]);
    pedal.send([0xb1, 21, 127]);
    pedal.send([0xb1, 31, 2]);
    pedal.send([0xb1, 33, 0]);

    expect(pedal.getSnapshot().state).toMatchObject({ mode: 1, release: 3, envelopeType: 2, spreadRouting: 1 });
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 22 = 1 → Mode → Shifty',
      'CC 21 = 127 → Release → Slow',
      'CC 31 = 2 → Envelope Type → Combo',
      'CC 33 = 0 → Spread Routing → EQ',
    ]);
  });

  it('decodes the footswitches, dips and Shifty Response as off (0) or on (≥1)', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 102, 0]);
    pedal.send([0xb1, 103, 1]);
    pedal.send([0xb1, 78, 64]);
    pedal.send([0xb1, 67, 1]);
    pedal.send([0xb1, 32, 2]);
    pedal.send([0xb1, 106, 127]);

    expect(pedal.getSnapshot().state).toMatchObject({ bypass: 0, swell: 127, dusty: 127, sweep: 127, shiftyResponse: 3, dynamicsMax: 127 });
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 102 = 0 → Bypass → Off',
      'CC 103 = 1 → Swell → On',
      'CC 78 = 64 → Dusty → On · Dusty: limiter is now an overdrive',
      'CC 67 = 1 → Sweep → T',
      'CC 32 = 2 → Shifty Response → Envelope',
      'CC 106 = 127 → Dynamics Max → On',
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

  it('logs the Alt Menu as not in the MIDI map', () => {
    const pedal = createVirtualPedal();

    pedal.send([0xb1, 104, 127]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual(['CC 104 = 127 → (not in MIDI map)']);
  });

  it('logs the alternate Swell CC as AUX hold, changing no state', () => {
    const pedal = createVirtualPedal();
    const before = pedal.getSnapshot().state;

    pedal.send([0xb1, 105, 127]);
    pedal.send([0xb1, 105, 0]);

    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'CC 105 = 127 → AUX hold → On',
      'CC 105 = 0 → AUX hold → Off',
    ]);
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
      'PC 1 → recall Slot 1 → factory preset (not simulated), nothing changes',
      'PC 5 on MIDI channel 5 → ignored (pedal listens on MIDI channel 2)',
    ]);
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
    expect(pedal.getSnapshot().state).toMatchObject({ sensitivity: 100, expression: 0 });
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
    expect(pedal.getSnapshot().state.sensitivity).toBe(16);
    expect(pedal.getSnapshot().log.map((e) => e.text)).toEqual([
      'Powered up holding both footswitches → waiting for a Program Change to set the MIDI channel',
      'CC 15 = 1 on MIDI channel 5 → ignored (pedal listens on MIDI channel 2)',
      'PC 0 on MIDI channel 5 → MIDI channel set to 5',
      'CC 15 = 16 → Sensitivity',
      'PC 0 on MIDI channel 2 → ignored (pedal listens on MIDI channel 5)',
    ]);
  });
});

describe('Virtual Pedal: log notes (SPEC.md §5.3)', () => {
  const textsAfter = (...messages: number[][]) => {
    const pedal = createVirtualPedal();
    messages.forEach((m) => pedal.send(m));
    return pedal.getSnapshot().log.map((e) => e.text);
  };

  it('notes ramping is engaged when the first target dip turns on, and only then', () => {
    expect(textsAfter([0xb1, 66, 127], [0xb1, 63, 127], [0xb1, 61, 127], [0xb1, 63, 127])).toEqual([
      'CC 66 = 127 → Bounce → On',
      'CC 63 = 127 → EQ target → On · Ramping engaged: SENSITIVITY knob now sets ramp speed',
      'CC 61 = 127 → Dynamics target → On',
      'CC 63 = 127 → EQ target → On',
    ]);
  });

  it('notes ramping again once every target dip has been off', () => {
    expect(textsAfter([0xb1, 65, 127], [0xb1, 65, 0], [0xb1, 65, 1]).at(-1)).toBe(
      'CC 65 = 1 → Wet target → On · Ramping engaged: SENSITIVITY knob now sets ramp speed',
    );
  });

  it('notes what Dusty, Sidechain and Swell Aux do when they turn on', () => {
    expect(textsAfter([0xb1, 78, 127], [0xb1, 74, 127], [0xb1, 77, 127], [0xb1, 77, 127], [0xb1, 78, 0])).toEqual([
      'CC 78 = 127 → Dusty → On · Dusty: limiter is now an overdrive',
      'CC 74 = 127 → Sidechain → On · Sidechain: following the external input',
      'CC 77 = 127 → Swell Aux → On · Swell Aux: AUX now triggers manual swells',
      'CC 77 = 127 → Swell Aux → On',
      'CC 78 = 0 → Dusty → Off',
    ]);
  });

  it('notes Shifty Response has no effect when it changes outside the Shifty EQ mode', () => {
    expect(textsAfter([0xb1, 32, 0], [0xb1, 32, 0], [0xb1, 22, 1], [0xb1, 32, 3])).toEqual([
      'CC 32 = 0 → Shifty Response → ASR · Shifty Response has no effect outside the Shifty EQ mode',
      'CC 32 = 0 → Shifty Response → ASR',
      'CC 22 = 1 → Mode → Shifty',
      'CC 32 = 3 → Shifty Response → Envelope',
    ]);
  });

  it('adds no note to a recalled Slot', () => {
    const texts = textsAfter([0xb1, 78, 127], [0xb1, 111, 9], [0xb1, 78, 0], [0xc1, 9]);

    expect(texts.at(-1)).toBe('PC 9 → recall Slot 9');
  });
});

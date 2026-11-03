import { describe, expect, it } from 'vitest';
import { PARAMS, type ParamId } from '../midi/map';
import { initialEditorState, type EditorState } from './core';
import { describeControl } from './help';

function withWorking(working: Partial<EditorState['working']>): EditorState {
  const state = initialEditorState();
  return { ...state, working: { ...state.working, ...working } };
}

describe('describeControl', () => {
  it('gives a knob its name, CC, current value as a percentage and description', () => {
    expect(describeControl('gain1', withWorking({ gain1: 127 }))).toEqual({
      name: 'Gain 1',
      cc: 16,
      value: 127,
      meaning: '100%',
      description: PARAMS.gain1.help,
    });
  });

  it('shows a toggle or switch value by its label', () => {
    expect(describeControl('ampType', withWorking({ ampType: 2 })).meaning).toBe('Plexi');
    expect(describeControl('effectOrder', withWorking({ effectOrder: 3 })).meaning).toBe('2<1');
    expect(describeControl('clean1', withWorking({ clean1: 127, effectOrder: 1 })).meaning).toBe('On');
    expect(describeControl('sweep', withWorking({ sweep: 127 })).meaning).toBe('T');
    expect(describeControl('channel1Bypass', withWorking({ channel1Bypass: 0 })).meaning).toBe('Bypassed');
  });

  it('reads Expression from the Performance Controls', () => {
    const state = initialEditorState();
    const help = describeControl('expression', { ...state, working: { ...state.working, gain1Target: 127 }, performance: { expression: 127 } });
    expect(help).toMatchObject({ name: 'Expression', cc: 100, value: 127, meaning: '100%', description: PARAMS.expression.help });
  });

  it('describes every param', () => {
    const state = initialEditorState();
    for (const id of Object.keys(PARAMS) as ParamId[]) {
      const help = describeControl(id, state);
      expect(help.name, id).not.toBe('');
      expect(help.meaning, id).not.toBe('');
      expect(help.description, id).not.toBe('');
    }
  });
});

describe('describeControl reads the context a control is in', () => {
  it('describes what Contour 2 does to the mids for the current Amp Type', () => {
    expect(describeControl('contour2', withWorking({ ampType: 2, contour2: 0 })).description).toContain(
      'Amp Type on Plexi, Channel 2’s mids are more prominent; turning Contour 2 on makes them more filtered.',
    );
    expect(describeControl('contour2', withWorking({ ampType: 3, contour2: 0 })).description).toContain(
      'Amp Type on Solo, Channel 2’s mids are scooped; turning Contour 2 on makes them more pronounced.',
    );
    expect(describeControl('contour2', withWorking({ ampType: 1, contour2: 127 })).description).toContain(
      'Amp Type on 800, Channel 2’s mids are more filtered; turning Contour 2 off makes them more prominent.',
    );
  });

  it('describes what Presence 2 does to the highs for the current Amp Type', () => {
    expect(describeControl('presence2', withWorking({ ampType: 1, presence2: 0 })).description).toContain(
      'Amp Type on 800, Channel 2’s highs have more bite; turning Presence 2 on makes them rounder.',
    );
    expect(describeControl('presence2', withWorking({ ampType: 2, presence2: 127 })).description).toContain(
      'Amp Type on Plexi, Channel 2’s highs are rounder; turning Presence 2 off makes them bite more.',
    );
    expect(describeControl('presence2', withWorking({ ampType: 3, presence2: 0 })).description).toContain(
      'Amp Type on Solo, Channel 2’s highs are smoother; turning Presence 2 on makes them more aggressive.',
    );
  });

  it('says Vol 1, with Master on, has no effect unless both Channels are on, and is then a stack mix control', () => {
    const masterOn = { master: 127, channel1Bypass: 127, channel2Bypass: 0 };
    const alone = describeControl('vol1', withWorking(masterOn));
    expect(alone.meaning).toBe('50% · No effect');
    expect(alone.description).toContain('Master is on, so Vol 1 has no effect unless both Channels are on.');

    const both = describeControl('vol1', withWorking({ ...masterOn, channel2Bypass: 127, effectOrder: 3 }));
    expect(both.meaning).toBe('50% · Stack mix');
    expect(both.description).toContain('Both Channels are on, so it mixes the stack, and how depends on Effect Order (now 2<1).');

    expect(describeControl('vol1', withWorking({ master: 0 })).meaning).toBe('50%');
  });

  it('mentions the clean blend on Clean 1 when Effect Order is 2+1', () => {
    const blend = describeControl('clean1', withWorking({ clean1: 127, effectOrder: 2 }));
    expect(blend.meaning).toBe('On · Clean blend');
    expect(blend.description).toContain('Effect Order is 2+1, so this makes Channel 1 a clean blend alongside Channel 2.');

    expect(describeControl('clean1', withWorking({ clean1: 0, effectOrder: 2 })).description).toContain('clean blend');
    const series = describeControl('clean1', withWorking({ clean1: 127, effectOrder: 1 }));
    expect(series.meaning).toBe('On');
    expect(series.description).not.toContain('clean blend');
  });

  it('notes on Gate Threshold and Gate Release when Noise Gate is off', () => {
    for (const id of ['gateThreshold', 'gateRelease'] as const) {
      const off = describeControl(id, withWorking({ noiseGate: 0 }));
      expect(off.meaning, id).toBe('50% · No effect');
      expect(off.description, id).toContain('Noise Gate is off, so this has no effect until the Noise Gate dip is on.');
      expect(describeControl(id, withWorking({ noiseGate: 127 })).meaning, id).toBe('50%');
    }
  });

  it('notes on Expression that it needs at least one target dip', () => {
    const state = withWorking({});
    const none = describeControl('expression', state);
    expect(none.meaning).toBe('0% · No targets');
    expect(none.description).toContain('No target dip is on, so right now it moves nothing.');

    const withTarget = describeControl('expression', withWorking({ gain1Target: 127 }));
    expect(withTarget.meaning).toBe('0%');
    expect(withTarget.description).not.toContain('moves nothing');
  });
});

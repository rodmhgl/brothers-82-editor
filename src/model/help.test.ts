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
    expect(describeControl('wet', withWorking({ wet: 127 }))).toEqual({
      name: 'Wet',
      cc: 16,
      value: 127,
      meaning: '100%',
      description: PARAMS.wet.help,
    });
  });

  it('shows a toggle, Hidden Option or switch value by its label', () => {
    expect(describeControl('mode', withWorking({ mode: 1 })).meaning).toBe('Shifty');
    expect(describeControl('envelopeType', withWorking({ envelopeType: 2 })).meaning).toBe('Combo');
    expect(describeControl('shiftyResponse', withWorking({ shiftyResponse: 3 })).meaning).toBe('Envelope');
    expect(describeControl('dusty', withWorking({ dusty: 127 })).meaning).toBe('On');
    expect(describeControl('sweep', withWorking({ sweep: 127 })).meaning).toBe('T');
  });

  it('shows EQ relative to its noon detent', () => {
    expect(describeControl('eq', withWorking({ eq: 64 })).meaning).toMatch(/^Noon · /);
    expect(describeControl('eq', withWorking({ eq: 70 })).meaning).toMatch(/^Noon \+6 · /);
    expect(describeControl('eq', withWorking({ eq: 54 })).meaning).toMatch(/^Noon −10 · /);
  });

  it('reads Performance Controls from the Performance Controls', () => {
    const state = initialEditorState();
    const help = describeControl('dynamicsMax', { ...state, performance: { ...state.performance, dynamicsMax: 127 } });
    expect(help).toMatchObject({ name: 'Dynamics Max', cc: 106, value: 127, meaning: 'On', description: PARAMS.dynamicsMax.help });
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
  it('names the zone Dynamics is in: compression below noon, limiting from noon, sag at the top', () => {
    expect(describeControl('dynamics', withWorking({ dynamics: 0 })).meaning).toBe('0% · Compression');
    expect(describeControl('dynamics', withWorking({ dynamics: 63 })).meaning).toBe('50% · Compression');
    expect(describeControl('dynamics', withWorking({ dynamics: 64 })).meaning).toBe('50% · Limiting');
    expect(describeControl('dynamics', withWorking({ dynamics: 101 })).meaning).toBe('80% · Limiting');
    expect(describeControl('dynamics', withWorking({ dynamics: 102 })).meaning).toBe('80% · Sag');
    expect(describeControl('dynamics', withWorking({ dynamics: 127 })).meaning).toBe('100% · Sag');
  });

  it('gives EQ its direction and the EQ mode', () => {
    expect(describeControl('eq', withWorking({ eq: 54, mode: 2 })).meaning).toBe('Noon −10 · Cuts highs · Manual');
    expect(describeControl('eq', withWorking({ eq: 64, mode: 1 })).meaning).toBe('Noon · Flat · Shifty');
    expect(describeControl('eq', withWorking({ eq: 70, mode: 3 })).meaning).toBe('Noon +6 · Cuts lows · Modulated');
  });

  it('notes when Sensitivity is the Dusty amount', () => {
    const sensitivity = (dusty: number) => describeControl('sensitivity', withWorking({ sensitivity: 127, dusty }));
    expect(sensitivity(0)).toMatchObject({ meaning: '100%' });
    expect(sensitivity(0).description).not.toMatch(/Dusty is on/);
    expect(sensitivity(127)).toMatchObject({ meaning: '100% · Dusty amount' });
    expect(sensitivity(127).description).toMatch(/Dusty is on/);
  });

  it('notes when ramping has taken over the physical Sensitivity knob', () => {
    const sensitivity = (working: Partial<EditorState['working']>) => describeControl('sensitivity', withWorking(working));
    expect(sensitivity({}).description).not.toMatch(/Ramping is engaged/);
    expect(sensitivity({ eqTarget: 127 }).description).toMatch(/Ramping is engaged/);
    expect(sensitivity({ wetTarget: 127 }).description).toMatch(/Ramping is engaged/);
    expect(sensitivity({ bounce: 127 }).description).not.toMatch(/Ramping is engaged/);
    expect(sensitivity({ sensitivity: 0, eqTarget: 127 }).meaning).toBe('0% · Knob is Ramp Speed');
    expect(sensitivity({ sensitivity: 0, eqTarget: 127, dusty: 127 }).meaning).toBe('0% · Dusty amount · Knob is Ramp Speed');
  });

  it('notes what else Attack is setting the speed of', () => {
    const attack = (working: Partial<EditorState['working']>) => describeControl('attack', withWorking({ attack: 0, ...working }));
    expect(attack({ mode: 2, motion: 0 })).toMatchObject({ meaning: '0%' });
    expect(attack({ mode: 2, motion: 0 }).description).toMatch(/only the compressor/);
    expect(attack({ mode: 1, motion: 0 })).toMatchObject({ meaning: '0% · Also EQ speed' });
    expect(attack({ mode: 1, motion: 0 }).description).toMatch(/also sets how fast the Shifty EQ moves\./);
    expect(attack({ mode: 3, motion: 0 }).description).toMatch(/also sets how fast the Modulated EQ moves\./);
    expect(attack({ mode: 2, motion: 127 })).toMatchObject({ meaning: '0% · Also Motion rate' });
    expect(attack({ mode: 2, motion: 127 }).description).toMatch(/also sets the Motion rate\./);
    expect(attack({ mode: 3, motion: 127 })).toMatchObject({ meaning: '0% · Also EQ speed, Motion rate' });
    expect(attack({ mode: 3, motion: 127 }).description).toMatch(/also sets how fast the Modulated EQ moves and the Motion rate\./);
  });

  it('says User Release only matters with Release in the middle', () => {
    const userRelease = (release: number) => describeControl('userRelease', withWorking({ release, userRelease: 64 }));
    expect(userRelease(2)).toMatchObject({ meaning: '50% · In use' });
    expect(userRelease(2).description).toMatch(/Release is on User/);
    expect(userRelease(1)).toMatchObject({ meaning: '50% · Not in use' });
    expect(userRelease(1).description).toMatch(/Release is on Fast/);
    expect(userRelease(3).description).toMatch(/Release is on Slow/);
  });
});

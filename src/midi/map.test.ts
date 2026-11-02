import { describe, expect, it } from 'vitest';
import { PARAMS, SAVE_TO_SLOT_CC, SLOT_COUNT, clampToParam, paramByCc, type ParamDef } from './map';

type Row = [id: string, cc: number, group: ParamDef['group'], scope: ParamDef['scope'], defaultValue: number];

/** SPEC.md §4: the Brothers AM MIDI manual's table with the Brothers 82 changes. */
const SPEC: Row[] = [
  // §4.1 Knobs
  ['gain2', 14, 'knob', 'preset', 64],
  ['vol2', 15, 'knob', 'preset', 64],
  ['gain1', 16, 'knob', 'preset', 64],
  ['tone2', 17, 'knob', 'preset', 64],
  ['vol1', 18, 'knob', 'preset', 64],
  ['tone1', 19, 'knob', 'preset', 64],
  // §4.2 Toggles
  ['ampType', 21, 'toggle', 'preset', 2],
  ['effectOrder', 22, 'toggle', 'preset', 2],
  ['odType', 23, 'toggle', 'preset', 2],
  // §4.3 Hidden Options
  ['gateRelease', 27, 'hidden', 'preset', 64],
  ['gateThreshold', 29, 'hidden', 'preset', 64],
  // §4.4 Footswitches
  ['channel1Bypass', 102, 'footswitch', 'preset', 0],
  ['channel2Bypass', 103, 'footswitch', 'preset', 127],
  // §4.5 Dip switches
  ['volume1Target', 61, 'dipLeft', 'preset', 0],
  ['volume2Target', 62, 'dipLeft', 'preset', 0],
  ['gain1Target', 63, 'dipLeft', 'preset', 0],
  ['gain2Target', 64, 'dipLeft', 'preset', 0],
  ['tone1Target', 65, 'dipLeft', 'preset', 0],
  ['tone2Target', 66, 'dipLeft', 'preset', 0],
  ['sweep', 67, 'dipLeft', 'preset', 0],
  ['polarity', 68, 'dipLeft', 'preset', 0],
  ['noiseGate', 71, 'dipRight', 'preset', 0],
  ['clean1', 72, 'dipRight', 'preset', 0],
  ['motoByp1', 73, 'dipRight', 'preset', 0],
  ['motoByp2', 74, 'dipRight', 'preset', 0],
  ['contour2', 75, 'dipRight', 'preset', 0],
  ['presence2', 76, 'dipRight', 'preset', 0],
  ['master', 77, 'dipRight', 'preset', 0],
  // §4.6 Other
  ['expression', 100, 'performance', 'performance', 0],
];

const params: ParamDef[] = Object.values(PARAMS);
const labels = (id: string) => (PARAMS as Record<string, ParamDef>)[id]!.values?.map((v) => `${v.label}=${v.value}`);

describe('the Brothers 82 MIDI map', () => {
  it.each(SPEC)('%s is CC %i, group %s, scope %s, default %i', (id, cc, group, scope, defaultValue) => {
    const param = (PARAMS as Record<string, ParamDef>)[id];

    expect(param).toMatchObject({ id, cc, group, scope, default: defaultValue });
    expect(paramByCc(cc)).toBe(param);
  });

  it('holds exactly the params in SPEC §4, each on its own CC', () => {
    expect(params.map((p) => p.id).sort()).toEqual(SPEC.map(([id]) => id).sort());
    expect(new Set(params.map((p) => p.cc)).size).toBe(params.length);
  });

  it('names the toggle positions, sent as 1 / 2 / 3', () => {
    expect(labels('ampType')).toEqual(['800=1', 'Plexi=2', 'Solo=3']);
    expect(labels('effectOrder')).toEqual(['2>1=1', '2+1=2', '2<1=3']);
    expect(labels('odType')).toEqual(['808=1', 'Super=2', 'RJM=3']);
  });

  it('names Channel Bypass Bypassed / Engaged, Sweep B / T and Polarity F / R, sent as 0 / 127', () => {
    expect(labels('channel1Bypass')).toEqual(['Bypassed=0', 'Engaged=127']);
    expect(labels('channel2Bypass')).toEqual(['Bypassed=0', 'Engaged=127']);
    expect(labels('sweep')).toEqual(['B=0', 'T=127']);
    expect(labels('polarity')).toEqual(['F=0', 'R=127']);
  });

  it('decodes values as the pedal does: on/off 0 vs ≥1 (sent 0 / 127), toggles 0–1 / 2 / ≥3', () => {
    expect([0, 1, 64].map((v) => clampToParam(PARAMS.channel2Bypass, v))).toEqual([0, 127, 127]);
    expect([0, 1, 2, 3, 127].map((v) => clampToParam(PARAMS.effectOrder, v))).toEqual([1, 1, 2, 3, 3]);
    expect([-4, 63.6, 200].map((v) => clampToParam(PARAMS.gain2, v))).toEqual([0, 64, 127]);
  });

  it('has 122 Slots, saved with CC 111', () => {
    expect(SLOT_COUNT).toBe(122);
    expect(SAVE_TO_SLOT_CC).toBe(111);
  });
});

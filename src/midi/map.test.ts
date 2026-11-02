import { describe, expect, it } from 'vitest';
import { PARAMS, SAVE_TO_SLOT_CC, SLOT_COUNT, clampToParam, paramByCc, type ParamDef } from './map';

type Row = [id: string, cc: number, group: ParamDef['group'], scope: ParamDef['scope'], defaultValue: number];

/** SPEC.md §4, transcribed from the Clean MIDI manual. */
const SPEC: Row[] = [
  // §4.1 Knobs
  ['dynamics', 14, 'knob', 'preset', 39],
  ['sensitivity', 15, 'knob', 'preset', 77],
  ['wet', 16, 'knob', 'preset', 77],
  ['attack', 17, 'knob', 'preset', 39],
  ['eq', 18, 'knob', 'preset', 64],
  ['dry', 19, 'knob', 'preset', 77],
  // §4.2 Toggles
  ['release', 21, 'toggle', 'preset', 2],
  ['mode', 22, 'toggle', 'preset', 2],
  ['physics', 23, 'toggle', 'preset', 2],
  // §4.3 Hidden Options
  ['rampSpeed', 20, 'hidden', 'preset', 64],
  ['gateRelease', 24, 'hidden', 'preset', 64],
  ['gateThreshold', 25, 'hidden', 'preset', 26],
  ['swellIn', 26, 'hidden', 'preset', 64],
  ['userRelease', 27, 'hidden', 'preset', 64],
  ['envelopeBalance', 28, 'hidden', 'preset', 0],
  ['swellOut', 29, 'hidden', 'preset', 64],
  ['envelopeType', 31, 'hidden', 'preset', 1],
  ['shiftyResponse', 32, 'hidden', 'preset', 3],
  ['spreadRouting', 33, 'hidden', 'preset', 2],
  // §4.4 Footswitches
  ['bypass', 102, 'footswitch', 'preset', 127],
  ['swell', 103, 'footswitch', 'preset', 0],
  ['dynamicsMax', 106, 'performance', 'performance', 0],
  // §4.5 Dip switches
  ['dynamicsTarget', 61, 'dipLeft', 'preset', 0],
  ['attackTarget', 62, 'dipLeft', 'preset', 0],
  ['eqTarget', 63, 'dipLeft', 'preset', 0],
  ['dryTarget', 64, 'dipLeft', 'preset', 0],
  ['wetTarget', 65, 'dipLeft', 'preset', 0],
  ['bounce', 66, 'dipLeft', 'preset', 0],
  ['sweep', 67, 'dipLeft', 'preset', 0],
  ['polarity', 68, 'dipLeft', 'preset', 0],
  ['miso', 71, 'dipRight', 'preset', 0],
  ['spread', 72, 'dipRight', 'preset', 0],
  ['latch', 73, 'dipRight', 'preset', 0],
  ['sidechain', 74, 'dipRight', 'preset', 0],
  ['noiseGate', 75, 'dipRight', 'preset', 0],
  ['motion', 76, 'dipRight', 'preset', 0],
  ['swellAux', 77, 'dipRight', 'preset', 0],
  ['dusty', 78, 'dipRight', 'preset', 0],
  // §4.6 Other
  ['ramping', 52, 'performance', 'performance', 0],
  ['expression', 100, 'performance', 'performance', 0],
];

const params: ParamDef[] = Object.values(PARAMS);
const labels = (id: string) => (PARAMS as Record<string, ParamDef>)[id]!.values?.map((v) => `${v.label}=${v.value}`);

describe('the Clean MIDI map', () => {
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
    expect(labels('release')).toEqual(['Fast=1', 'User=2', 'Slow=3']);
    expect(labels('mode')).toEqual(['Shifty=1', 'Manual=2', 'Modulated=3']);
    expect(labels('physics')).toEqual(['Wobbly=1', 'Off=2', 'Twitchy=3']);
    expect(labels('envelopeType')).toEqual(['Analog=1', 'Combo=2', 'Adaptive=3']);
    expect(labels('spreadRouting')).toEqual(['EQ=1', 'Both=2', 'Volume=3']);
  });

  it('sends Shifty Response as ASR = 0 and Envelope = 3', () => {
    expect(labels('shiftyResponse')).toEqual(['ASR=0', 'Envelope=3']);
    expect(clampToParam(PARAMS.shiftyResponse, 0)).toBe(0);
    expect(clampToParam(PARAMS.shiftyResponse, 3)).toBe(3);
    expect(clampToParam(PARAMS.shiftyResponse, 127)).toBe(3);
  });

  it('names Sweep B / T and Polarity F / R', () => {
    expect(labels('sweep')).toEqual(['B=0', 'T=127']);
    expect(labels('polarity')).toEqual(['F=0', 'R=127']);
  });

  it('gives EQ a noon detent, and Envelope Balance none', () => {
    expect(PARAMS.eq.detent).toBe(64);
    expect('detent' in PARAMS.envelopeBalance).toBe(false);
  });

  it('decodes values as the pedal does: on/off 0 vs ≥1 (sent 0 / 127), toggles 0–1 / 2 / ≥3', () => {
    expect([0, 1, 64].map((v) => clampToParam(PARAMS.bypass, v))).toEqual([0, 127, 127]);
    expect([0, 1, 2, 3, 127].map((v) => clampToParam(PARAMS.mode, v))).toEqual([1, 1, 2, 3, 3]);
    expect([-4, 63.6, 200].map((v) => clampToParam(PARAMS.dynamics, v))).toEqual([0, 64, 127]);
  });

  it('has 122 Slots, saved with CC 111', () => {
    expect(SLOT_COUNT).toBe(122);
    expect(SAVE_TO_SLOT_CC).toBe(111);
  });
});

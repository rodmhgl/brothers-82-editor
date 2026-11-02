import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../midi/map';
import { HIDDEN_OPTIONS, PEDAL_GRID } from './pedalGrid';

describe('pedal grid', () => {
  it('lays out the knobs and toggles as on the pedal', () => {
    expect(PEDAL_GRID).toEqual([
      ['gain2', 'vol2', 'gain1'],
      ['tone2', 'vol1', 'tone1'],
      ['ampType', 'effectOrder', 'odType'],
    ]);
  });

  it('holds every Hidden Option once', () => {
    const hidden = Object.values(PARAMS)
      .filter((p) => p.group === 'hidden')
      .map((p) => p.id);
    expect(HIDDEN_OPTIONS.toSorted()).toEqual(hidden.toSorted());
  });
});

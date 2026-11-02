import { describe, expect, it } from 'vitest';
import { PARAMS } from '../../midi/map';
import { HIDDEN_BESIDE_GRID, HIDDEN_GRID, PEDAL_GRID } from './pedalGrid';

describe('pedal grid', () => {
  it('lays out the knobs and toggles as on the pedal', () => {
    expect(PEDAL_GRID).toEqual([
      ['dynamics', 'sensitivity', 'wet'],
      ['attack', 'eq', 'dry'],
      ['release', 'mode', 'physics'],
    ]);
  });

  it('puts each Hidden Option where its host control sits', () => {
    expect(HIDDEN_GRID).toEqual([
      ['gateRelease', 'gateThreshold', 'swellIn'],
      ['userRelease', 'envelopeBalance', 'swellOut'],
      ['envelopeType', 'shiftyResponse', 'spreadRouting'],
    ]);
  });

  it('holds every Hidden Option once, leaving Ramp Speed beside the grid', () => {
    const hidden = Object.values(PARAMS)
      .filter((p) => p.group === 'hidden' && p.id !== HIDDEN_BESIDE_GRID)
      .map((p) => p.id);
    expect(HIDDEN_GRID.flat().toSorted()).toEqual(hidden.toSorted());
  });
});

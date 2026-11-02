import { describe, expect, it } from 'vitest';
import { defaultWorkingState } from './state';
import { customizeSummary } from './summary';

describe('customizeSummary', () => {
  it('names the active Customize dips in bank order', () => {
    expect(customizeSummary({ ...defaultWorkingState(), dusty: 127, swellAux: 127, spread: 127 })).toBe(
      'Spread · Swell Aux · Dusty',
    );
  });

  it('ignores the Ramp / Expression target dips', () => {
    expect(customizeSummary({ ...defaultWorkingState(), bounce: 127, wetTarget: 127, noiseGate: 127 })).toBe(
      'Noise Gate',
    );
  });

  it('is empty when no Customize dip is on', () => {
    expect(customizeSummary(defaultWorkingState())).toBe('');
  });
});

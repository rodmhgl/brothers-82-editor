import { describe, expect, it } from 'vitest';
import { defaultWorkingState } from './state';
import { customizeSummary } from './summary';

describe('customizeSummary', () => {
  it('names the active Customize dips in bank order', () => {
    expect(customizeSummary({ ...defaultWorkingState(), master: 127, contour2: 127, clean1: 127 })).toBe(
      'Clean 1 · Contour 2 · Master',
    );
  });

  it('ignores the Expression / CV target dips', () => {
    expect(customizeSummary({ ...defaultWorkingState(), sweep: 127, gain1Target: 127, noiseGate: 127 })).toBe(
      'Noise Gate',
    );
  });

  it('is empty when no Customize dip is on', () => {
    expect(customizeSummary(defaultWorkingState())).toBe('');
  });
});

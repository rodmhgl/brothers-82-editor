import { describe, expect, it } from 'vitest';
import { defaultWorkingState } from './state';
import { toggleSummary } from './summary';

describe('toggleSummary', () => {
  it('names the Amp Type, OD Type and Effect Order', () => {
    expect(toggleSummary(defaultWorkingState())).toBe('Plexi · Super · 2+1');
  });

  it('follows each toggle', () => {
    expect(toggleSummary({ ...defaultWorkingState(), ampType: 3, odType: 1, effectOrder: 3 })).toBe('Solo · 808 · 2<1');
  });

  it('ignores the dips', () => {
    expect(toggleSummary({ ...defaultWorkingState(), noiseGate: 127, master: 127 })).toBe('Plexi · Super · 2+1');
  });
});

import { describe, expect, it } from 'vitest';
import left from '../presets/factory-left.cleanpreset.json?raw';
import right from '../presets/factory-right.cleanpreset.json?raw';
import { FACTORY_PRESETS, isFactoryPreset } from './factoryPresets';
import { parsePreset } from './schema';

describe('the Factory Presets', () => {
  it('are valid Preset files, read without warnings', () => {
    for (const text of [left, right]) expect(parsePreset(text)).toMatchObject({ ok: true, warnings: [] });
  });

  it('hold the pedal’s factory Toggle Slots (hardware check #7)', () => {
    const [factoryLeft, factoryRight] = FACTORY_PRESETS;

    expect(factoryLeft).toMatchObject({ name: 'Factory Left', params: { dynamics: 80, wet: 127, attack: 47, eq: 64, mode: 2 } });
    expect(factoryRight).toMatchObject({ name: 'Factory Right', params: { dynamics: 52, wet: 81, attack: 64, eq: 79, mode: 3 } });
  });

  it('are told apart by id', () => {
    expect(isFactoryPreset(FACTORY_PRESETS[0]!.id)).toBe(true);
    expect(isFactoryPreset('id-Shimmer Tape')).toBe(false);
    expect(isFactoryPreset(null)).toBe(false);
  });
});

import left from '../presets/factory-left.cleanpreset.json?raw';
import right from '../presets/factory-right.cleanpreset.json?raw';
import { parsePreset, type Preset } from './schema';

// The presets Clean ships with in its Toggle Slots (docs/hardware-checks.md #7), built into the editor. They are in
// every Library, read-only: they can be recalled, stored, exported and duplicated, never saved over, renamed or deleted.

function builtIn(text: string): Preset {
  const result = parsePreset(text);
  if (!result.ok) throw new Error(`Factory Preset: ${result.error}`);
  return result.preset;
}

/** Factory Left, then Factory Right, as the preset toggle reads. */
export const FACTORY_PRESETS: readonly Preset[] = [builtIn(left), builtIn(right)];

export function isFactoryPreset(id: string | null): boolean {
  return FACTORY_PRESETS.some((p) => p.id === id);
}

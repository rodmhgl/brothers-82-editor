import type { PresetParamId } from '../../midi/map';

/** The knobs and toggles, row by row as they sit on the pedal (SPEC.md §3.2, §5.4). */
export const PEDAL_GRID = [
  ['gain2', 'vol2', 'gain1'],
  ['tone2', 'vol1', 'tone1'],
  ['ampType', 'effectOrder', 'odType'],
] as const satisfies readonly (readonly PresetParamId[])[];

/** The Hidden Options (SPEC.md §4.3). */
export const HIDDEN_OPTIONS = ['gateThreshold', 'gateRelease'] as const satisfies readonly PresetParamId[];

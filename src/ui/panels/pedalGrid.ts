import type { PresetParamId } from '../../midi/map';

/** The knobs and toggles, row by row as they sit on the pedal (SPEC.md §5.4). */
export const PEDAL_GRID = [
  ['dynamics', 'sensitivity', 'wet'],
  ['attack', 'eq', 'dry'],
  ['release', 'mode', 'physics'],
] as const satisfies readonly (readonly PresetParamId[])[];

type HostId = (typeof PEDAL_GRID)[number][number];

/** The Hidden Option each control hosts (SPEC.md §3.5). Shifty Response has no host on the pedal (MIDI only), so it sits under the Mode it affects. */
const HIDDEN_UNDER = {
  dynamics: 'gateRelease',
  sensitivity: 'gateThreshold',
  wet: 'swellIn',
  attack: 'userRelease',
  eq: 'envelopeBalance',
  dry: 'swellOut',
  release: 'envelopeType',
  mode: 'shiftyResponse',
  physics: 'spreadRouting',
} as const satisfies Record<HostId, PresetParamId>;

/** The Hidden Options laid out like the pedal, each where its host control sits (SPEC.md §5.5). */
export const HIDDEN_GRID = PEDAL_GRID.map((row) => row.map((host) => HIDDEN_UNDER[host]));

/** Hosted by no control: on the pedal, Sensitivity sets it while ramping. It sits beside the grid (SPEC.md §5.5). */
export const HIDDEN_BESIDE_GRID = 'rampSpeed' satisfies PresetParamId;

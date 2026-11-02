import { PARAMS, isOn, type PresetParamId } from '../midi/map';
import type { WorkingState } from './state';

/** The Customize dips, in bank order. */
const CUSTOMIZE_DIPS = Object.values(PARAMS).filter((p) => p.group === 'dipRight');

/** A Preset at a glance in the Library list: its active Customize dips, e.g. "Noise Gate · Clean 1 · Master". */
export function customizeSummary(params: WorkingState): string {
  return CUSTOMIZE_DIPS.filter((p) => isOn(params[p.id as PresetParamId]))
    .map((p) => p.label)
    .join(' · ');
}

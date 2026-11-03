import { PARAMS, settingLabel } from '../midi/map';
import type { WorkingState } from './state';

/** The toggles a summary names, in the order it names them. */
const SUMMARY_TOGGLES = [PARAMS.ampType, PARAMS.odType, PARAMS.effectOrder];

/** A Preset at a glance in the Library list: its Amp Type, OD Type and Effect Order, e.g. "Plexi · Super · 2+1". */
export function toggleSummary(params: WorkingState): string {
  return SUMMARY_TOGGLES.map((p) => settingLabel(p, params[p.id]) ?? String(params[p.id])).join(' · ');
}

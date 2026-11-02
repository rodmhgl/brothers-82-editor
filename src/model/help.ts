import { PARAMS, settingLabel, type ParamDef, type ParamId } from '../midi/map';
import { valueOf, type EditorState } from './core';

// What the help shows for a control (SPEC.md §5.10): its name, CC, current value and meaning, and a
// plain-language description.

export type ControlHelp = {
  name: string;
  cc: number;
  /** The raw value the editor holds. */
  value: number;
  /** What that value means, e.g. "41%", "Plexi", "On". */
  meaning: string;
  description: string;
};

const percent = (param: ParamDef, value: number) => `${Math.round(((value - param.min) / (param.max - param.min)) * 100)}%`;

function meaningOf(param: ParamDef, value: number): string {
  if (param.kind === 'continuous') return percent(param, value);
  return settingLabel(param, value) ?? String(value);
}

/** Help for a control, read against the editor's current state. */
export function describeControl(id: ParamId, state: EditorState): ControlHelp {
  const param: ParamDef = PARAMS[id];
  const value = valueOf(state, id);
  return {
    name: param.label,
    cc: param.cc,
    value,
    meaning: meaningOf(param, value),
    description: param.help,
  };
}

import {
  PARAMS,
  TOGGLE_MIDDLE,
  dynamicsZone,
  isOn,
  isRampingEngaged,
  settingLabel,
  type ParamDef,
  type ParamId,
} from '../midi/map';
import { valueOf, type EditorState } from './core';
import type { WorkingState } from './state';

// What the help shows for a control (SPEC.md §5.10): its name, CC, current value and meaning, and a
// plain-language description. Some controls' meaning depends on others (Dusty, ramping, the EQ mode, Release).

export type ControlHelp = {
  name: string;
  cc: number;
  /** The raw value the editor holds. */
  value: number;
  /** What that value means, e.g. "41%", "Noon +6 · Cuts lows · Manual", "Shifty", "On". */
  meaning: string;
  description: string;
};

/** What the rest of the Working State adds to a control's help: short tags after its meaning, and notes after its description. */
type ContextualHelp = { tags: string[]; notes: string[] };

const percent = (param: ParamDef, value: number) => `${Math.round(((value - param.min) / (param.max - param.min)) * 100)}%`;

function meaningOf(param: ParamDef, value: number): string {
  if (param.kind === 'continuous') {
    if (param.detent !== undefined) {
      const offset = value - param.detent;
      return offset === 0 ? 'Noon' : `Noon ${offset > 0 ? '+' : '−'}${Math.abs(offset)}`;
    }
    return percent(param, value);
  }
  return settingLabel(param, value) ?? String(value);
}

function contextualHelp(id: ParamId, working: WorkingState): ContextualHelp {
  const help: ContextualHelp = { tags: [], notes: [] };
  switch (id) {
    case 'dynamics':
      help.tags.push(dynamicsZone(working.dynamics));
      break;
    case 'eq': {
      const offset = working.eq - PARAMS.eq.detent;
      help.tags.push(offset === 0 ? 'Flat' : offset < 0 ? 'Cuts highs' : 'Cuts lows', settingLabel(PARAMS.mode, working.mode)!);
      break;
    }
    case 'sensitivity':
      if (isOn(working.dusty)) {
        help.tags.push('Dusty amount');
        help.notes.push('Dusty is on, so this also sets roughly how hard the limiter overdrives.');
      }
      if (isRampingEngaged(working)) {
        help.tags.push('Knob is Ramp Speed');
        help.notes.push('Ramping is engaged, so on the pedal its SENSITIVITY knob now sets Ramp Speed; from here it still sets Sensitivity.');
      }
      break;
    case 'attack': {
      // Shifty and Modulated move the EQ; Manual (the middle) holds it still.
      const alsoSets = [
        working.mode !== TOGGLE_MIDDLE && { tag: 'EQ speed', note: `how fast the ${settingLabel(PARAMS.mode, working.mode)} EQ moves` },
        isOn(working.motion) && { tag: 'Motion rate', note: 'the Motion rate' },
      ].filter((s) => s !== false);
      if (alsoSets.length) {
        help.tags.push(`Also ${alsoSets.map((s) => s.tag).join(', ')}`);
        help.notes.push(`Right now it also sets ${alsoSets.map((s) => s.note).join(' and ')}.`);
      } else {
        help.notes.push('With Mode on Manual and Motion off, it sets only the compressor’s attack.');
      }
      break;
    }
    case 'userRelease':
      if (working.release === TOGGLE_MIDDLE) {
        help.tags.push('In use');
        help.notes.push('Release is on User, so this is the release time.');
      } else {
        help.tags.push('Not in use');
        help.notes.push(`Release is on ${settingLabel(PARAMS.release, working.release)}, so this has no effect until Release is moved to the middle.`);
      }
      break;
  }
  return help;
}

/** Help for a control, read against the editor's current state. */
export function describeControl(id: ParamId, state: EditorState): ControlHelp {
  const param: ParamDef = PARAMS[id];
  const value = valueOf(state, id);
  const { tags, notes } = contextualHelp(id, state.working);
  return {
    name: param.label,
    cc: param.cc,
    value,
    meaning: [meaningOf(param, value), ...tags].join(' · '),
    description: [param.help, ...notes].join(' '),
  };
}

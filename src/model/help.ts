import { AMP_TYPE_SOLO, EFFECT_ORDER_PARALLEL, PARAMS, TARGET_DIPS, isOn, settingLabel, type ParamDef, type ParamId } from '../midi/map';
import { valueOf, type EditorState } from './core';
import type { WorkingState } from './state';

// What the help shows for a control (SPEC.md §5.10): its name, CC, current value and meaning, and a
// plain-language description. Some controls' meaning depends on others (Amp Type, Master, Effect Order, Noise Gate).

export type ControlHelp = {
  name: string;
  cc: number;
  /** The raw value the editor holds. */
  value: number;
  /** What that value means, e.g. "41%", "Plexi", "On". */
  meaning: string;
  description: string;
};

/** What the rest of the Working State adds to a control's help: short tags after its meaning, and notes after its description. */
type ContextualHelp = { tags: string[]; notes: string[] };

const percent = (param: ParamDef, value: number) => `${Math.round(((value - param.min) / (param.max - param.min)) * 100)}%`;

function meaningOf(param: ParamDef, value: number): string {
  if (param.kind === 'continuous') return percent(param, value);
  return settingLabel(param, value) ?? String(value);
}

/** One way Channel 2 can sound, said as "its mids/highs …" (`now`) and as "makes them …" (`after`). */
type Sound = { now: string; after: string };
const sound = (now: string, after: string): Sound => ({ now, after });

/** How Channel 2 sounds with an inverting dip [off, on]: Plexi and 800 one way, Solo the other (SPEC.md §3.6). */
const INVERTED = {
  contour2: {
    band: 'mids',
    plexiOr800: [sound('are more prominent', 'more prominent'), sound('are more filtered', 'more filtered')],
    solo: [sound('are scooped', 'scooped'), sound('are more pronounced', 'more pronounced')],
  },
  presence2: {
    band: 'highs',
    plexiOr800: [sound('have more bite', 'bite more'), sound('are rounder', 'rounder')],
    solo: [sound('are smoother', 'smoother'), sound('are more aggressive', 'more aggressive')],
  },
} as const;

/** A note saying what an inverting dip does to Channel 2 for the current Amp Type, and what flipping it would do. */
function invertedNote(id: keyof typeof INVERTED, working: WorkingState): string {
  const { band, plexiOr800, solo } = INVERTED[id];
  const [off, on] = working.ampType === AMP_TYPE_SOLO ? solo : plexiOr800;
  const isOnNow = isOn(working[id]);
  const [current, flipped] = isOnNow ? [on, off] : [off, on];
  const amp = settingLabel(PARAMS.ampType, working.ampType);
  return `With Amp Type on ${amp}, Channel 2’s ${band} ${current.now}; turning ${PARAMS[id].label} ${isOnNow ? 'off' : 'on'} makes them ${flipped.after}.`;
}

function contextualHelp(id: ParamId, working: WorkingState): ContextualHelp {
  const help: ContextualHelp = { tags: [], notes: [] };
  switch (id) {
    case 'contour2':
    case 'presence2':
      help.notes.push(invertedNote(id, working));
      break;
    case 'vol1':
      if (!isOn(working.master)) break;
      if (isOn(working.channel1Bypass) && isOn(working.channel2Bypass)) {
        help.tags.push('Stack mix');
        help.notes.push(
          `Master is on, so Vol 2 sets the overall volume. Both Channels are on, so Vol 1 mixes the stack, and how depends on Effect Order (now ${settingLabel(PARAMS.effectOrder, working.effectOrder)}).`,
        );
      } else {
        help.tags.push('No effect');
        help.notes.push('Master is on, so Vol 1 has no effect unless both Channels are on. It then acts as a stack mix control.');
      }
      break;
    case 'clean1': {
      if (working.effectOrder !== EFFECT_ORDER_PARALLEL) break;
      const order = `Effect Order is ${settingLabel(PARAMS.effectOrder, working.effectOrder)}`;
      if (isOn(working.clean1)) {
        help.tags.push('Clean blend');
        help.notes.push(`${order}, so this makes Channel 1 a clean blend alongside Channel 2.`);
      } else {
        help.notes.push(`${order}, so turning this on would make Channel 1 a clean blend alongside Channel 2.`);
      }
      break;
    }
    case 'gateThreshold':
    case 'gateRelease':
      if (isOn(working.noiseGate)) break;
      help.tags.push('No effect');
      help.notes.push('Noise Gate is off, so this has no effect right now.');
      break;
    case 'expression':
      if (Object.values(TARGET_DIPS).some((dip) => isOn(working[dip]))) break;
      help.tags.push('No targets');
      help.notes.push('No target dip is on right now.');
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

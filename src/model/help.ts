import { EFFECT_ORDER_PARALLEL, PARAMS, TARGET_DIPS, isOn, settingLabel, type ParamDef, type ParamId } from '../midi/map';
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

const SOLO = PARAMS.ampType.values[2]!.value;

/** A sound, said as "they …" and as "makes them …". */
type Sound = { is: string; made: string };
const sound = (is: string, made = is.replace(/^are /, '')): Sound => ({ is, made });

/** How Channel 2 sounds with an inverting dip [off, on]: Plexi and 800 one way, Solo the other (SPEC.md §3.6). */
const INVERTED = {
  contour2: {
    band: 'mids',
    plexi800: [sound('are more prominent'), sound('are more filtered')],
    solo: [sound('are scooped'), sound('are more pronounced')],
  },
  presence2: {
    band: 'highs',
    plexi800: [sound('have more bite', 'bite more'), sound('are rounder')],
    solo: [sound('are smoother'), sound('are more aggressive')],
  },
} as const;

/** A note saying what an inverting dip does to Channel 2 for the current Amp Type, and what flipping it would do. */
function invertedNote(id: keyof typeof INVERTED, working: WorkingState): string {
  const { band, plexi800, solo } = INVERTED[id];
  const [off, on] = working.ampType === SOLO ? solo : plexi800;
  const isOnNow = isOn(working[id]);
  const [now, then] = isOnNow ? [on, off] : [off, on];
  const amp = settingLabel(PARAMS.ampType, working.ampType);
  return `With Amp Type on ${amp}, Channel 2’s ${band} ${now.is}; turning ${PARAMS[id].label} ${isOnNow ? 'off' : 'on'} makes them ${then.made}.`;
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
          `Master is on, so Vol 2 sets the overall volume. Both Channels are on, so it mixes the stack, and how depends on Effect Order (now ${settingLabel(PARAMS.effectOrder, working.effectOrder)}).`,
        );
      } else {
        help.tags.push('No effect');
        help.notes.push('Master is on, so Vol 1 has no effect unless both Channels are on. It then acts as a stack mix control.');
      }
      break;
    case 'clean1':
      if (working.effectOrder !== EFFECT_ORDER_PARALLEL) break;
      if (isOn(working.clean1)) {
        help.tags.push('Clean blend');
        help.notes.push('Effect Order is 2+1, so this makes Channel 1 a clean blend alongside Channel 2.');
      } else {
        help.notes.push('Effect Order is 2+1, so turning this on would make Channel 1 a clean blend alongside Channel 2.');
      }
      break;
    case 'gateThreshold':
    case 'gateRelease':
      if (isOn(working.noiseGate)) break;
      help.tags.push('No effect');
      help.notes.push('Noise Gate is off, so this has no effect until the Noise Gate dip is on.');
      break;
    case 'expression':
      if (Object.values(TARGET_DIPS).some((dip) => isOn(working[dip]))) break;
      help.tags.push('No targets');
      help.notes.push('No target dip is on, so right now it moves nothing.');
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

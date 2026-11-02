import {
  DEFAULT_MIDI_CHANNEL,
  PARAMS,
  type ParamDef,
  type ParamId,
  type PerformanceParamId,
  type PresetParamId,
} from '../midi/map';

// Raw controls only: the values the editor sends (ADR 0001).
export type WorkingState = Record<PresetParamId, number>;

/** Performance Controls: sent to the pedal but never stored in a Preset. Raw values, like the Working State. */
export type PerformanceState = Record<PerformanceParamId, number>;

/** Global Settings: no Preset changes them, and Send All never sends them. */
export type GlobalSettings = { midiChannel: number };

/** Every control the pedal itself holds, whatever its scope. What the Virtual Pedal simulates. */
export type PedalState = Record<ParamId, number>;

/** Each param's default, for every param of `scope` (all of them if no scope is given). */
const defaultsOf = <Id extends ParamId>(scope?: ParamDef['scope']) =>
  Object.fromEntries(
    Object.values(PARAMS)
      .filter((p: ParamDef) => !scope || p.scope === scope)
      .map((p) => [p.id, p.default]),
  ) as Record<Id, number>;

export function defaultWorkingState(): WorkingState {
  return defaultsOf<PresetParamId>('preset');
}

export function defaultPerformanceState(): PerformanceState {
  return defaultsOf<PerformanceParamId>('performance');
}

export function defaultGlobalSettings(): GlobalSettings {
  return { midiChannel: DEFAULT_MIDI_CHANNEL };
}

export function defaultPedalState(): PedalState {
  return defaultsOf<ParamId>();
}

/** The Hidden Options. Ramp Speed is grouped with them but set by a knob while ramping, so it isn't one. */
const HIDDEN_OPTIONS = Object.values(PARAMS).filter((p: ParamDef) => p.group === 'hidden' && p.id !== PARAMS.rampSpeed.id);

/** `state` after a Factory Reset (CC 56): every Hidden Option back to its default, everything else as it was. */
export function withHiddenOptionsReset<S extends WorkingState | PedalState>(state: S): S {
  return { ...state, ...Object.fromEntries(HIDDEN_OPTIONS.map((p) => [p.id, p.default])) };
}

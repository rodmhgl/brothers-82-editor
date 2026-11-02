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

// Single source of truth for the pedal's MIDI implementation (SPEC.md §4).
// UI code must never read CC numbers directly; it goes through this map.

export const MIDI_MAP_VERSION = 1;

/** The pedal's factory MIDI channel (SPEC.md §4). */
export const DEFAULT_MIDI_CHANNEL = 2;

export type ParamDef = {
  id: string;
  label: string;
  cc: number;
  kind: 'continuous' | 'toggle3' | 'switch';
  values?: { label: string; value: number }[];
  group: 'knob' | 'toggle' | 'hidden' | 'dipLeft' | 'dipRight' | 'footswitch' | 'performance';
  scope: 'preset' | 'performance';
  min: number;
  max: number;
  default: number;
  help: string;
};

const SWITCH_VALUES = [
  { label: 'Off', value: 0 },
  { label: 'On', value: 127 },
];

/** The pedal's numbered memory locations; PC n recalls Slot n (SPEC.md §4.7). */
export const SLOT_COUNT = 122;

/** Program Change 0 puts the pedal in Live mode. */
export const LIVE_PROGRAM = 0;

/** Save to Slot: value = Slot number (SPEC.md §4.6). */
export const SAVE_TO_SLOT_CC = 111;

const level = <Id extends string, Group extends 'knob' | 'hidden'>(
  id: Id,
  label: string,
  cc: number,
  group: Group,
  defaultValue: number,
  help: string,
) => ({ id, label, cc, kind: 'continuous', group, scope: 'preset', min: 0, max: 127, default: defaultValue, help }) as const;

/** A 3-position control, sent as 1 / 2 / 3: the pedal reads 0 or 1 as position 1 and ≥3 as position 3. */
const toggle3 = <Id extends string>(
  id: Id,
  label: string,
  cc: number,
  positions: readonly [string, string, string],
  help: string,
) =>
  ({
    id,
    label,
    cc,
    kind: 'toggle3',
    values: positions.map((p, i) => ({ label: p, value: i + 1 })),
    group: 'toggle',
    scope: 'preset',
    min: 1,
    max: 3,
    default: 2,
    help,
  }) as const;

const onOff = <Id extends string, Group extends ParamDef['group']>(
  id: Id,
  label: string,
  cc: number,
  group: Group,
  defaultValue: number,
  help: string,
  values: { label: string; value: number }[] = SWITCH_VALUES,
) => ({ id, label, cc, kind: 'switch', values, group, scope: 'preset', min: 0, max: 127, default: defaultValue, help }) as const;

const BYPASS_VALUES = [
  { label: 'Bypassed', value: 0 },
  { label: 'Engaged', value: 127 },
];

const dip = <Id extends string>(
  id: Id,
  label: string,
  cc: number,
  group: 'dipLeft' | 'dipRight',
  help: string,
  values?: { label: string; value: number }[],
) => onOff(id, label, cc, group, 0, help, values);

const target = <Id extends string>(id: Id, knob: string, cc: number) =>
  dip(id, `${knob} target`, cc, 'dipLeft', `Lets an expression pedal or control voltage move ${knob}.`);

export const PARAMS = {
  // Knobs (SPEC.md §4.1).
  gain2: level('gain2', 'Gain 2', 14, 'knob', 64, 'How much drive Channel 2, the amp side, adds.'),
  vol2: level('vol2', 'Vol 2', 15, 'knob', 64, 'Output level of Channel 2.'),
  gain1: level('gain1', 'Gain 1', 16, 'knob', 64, 'How much drive Channel 1, the overdrive side, adds.'),
  tone2: level('tone2', 'Tone 2', 17, 'knob', 64, 'Tone of Channel 2.'),
  vol1: level('vol1', 'Vol 1', 18, 'knob', 64, 'Output level of Channel 1.'),
  tone1: level('tone1', 'Tone 1', 19, 'knob', 64, 'Tone of Channel 1.'),
  // Toggles (SPEC.md §4.2).
  ampType: toggle3('ampType', 'Amp Type', 21, ['800', 'Plexi', 'Solo'], 'The voicing of Channel 2: 800, Plexi or Solo.'),
  effectOrder: toggle3('effectOrder', 'Effect Order', 22, ['2>1', '2+1', '2<1'], 'How the Channels combine: Channel 2 feeds Channel 1 (2>1), in parallel (2+1), or Channel 1 feeds Channel 2 (2<1).'),
  odType: toggle3('odType', 'OD Type', 23, ['808', 'Super', 'RJM'], 'The voicing of Channel 1: 808, Super or RJM.'),
  // Hidden Options (SPEC.md §4.3). 64 is a placeholder until hardware check #3.
  gateRelease: level('gateRelease', 'Gate Release', 27, 'hidden', 64, 'How quickly the Noise Gate re-engages (with the Noise Gate dip on).'),
  gateThreshold: level('gateThreshold', 'Gate Threshold', 29, 'hidden', 64, 'The level below which the Noise Gate mutes the signal (with the Noise Gate dip on).'),
  // Footswitches (SPEC.md §4.4): both states are stored in a Preset.
  channel1Bypass: onOff('channel1Bypass', 'Channel 1 Bypass', 102, 'footswitch', 0, 'Engages or bypasses Channel 1, like tapping the right footswitch.', BYPASS_VALUES),
  channel2Bypass: onOff('channel2Bypass', 'Channel 2 Bypass', 103, 'footswitch', 127, 'Engages or bypasses Channel 2, like tapping the left footswitch.', BYPASS_VALUES),
  // Dip switches (SPEC.md §3.6, §4.5), left to right as seen from above the pedal.
  volume1Target: target('volume1Target', 'Volume 1', 61),
  volume2Target: target('volume2Target', 'Volume 2', 62),
  gain1Target: target('gain1Target', 'Gain 1', 63),
  gain2Target: target('gain2Target', 'Gain 2', 64),
  tone1Target: target('tone1Target', 'Tone 1', 65),
  tone2Target: target('tone2Target', 'Tone 2', 66),
  sweep: dip('sweep', 'Sweep', 67, 'dipLeft', 'Which half of a knob’s range Expression moves through: bottom (B) or top (T).', [
    { label: 'B', value: 0 },
    { label: 'T', value: 127 },
  ]),
  polarity: dip('polarity', 'Polarity', 68, 'dipLeft', 'Which way Expression moves the targets: forward (F) or reverse (R).', [
    { label: 'F', value: 0 },
    { label: 'R', value: 127 },
  ]),
  noiseGate: dip('noiseGate', 'Noise Gate', 71, 'dipRight', 'Engages the noise gate, set by Gate Threshold and Gate Release.'),
  clean1: dip('clean1', 'Clean 1', 72, 'dipRight', 'Removes most of the clipping from Channel 1, making it a clean boost that keeps each OD Type’s character.'),
  motoByp1: dip('motoByp1', 'MotoByp 1', 73, 'dipRight', 'On the pedal, makes the Channel 1 footswitch momentary. The editor’s bypass buttons always latch.'),
  motoByp2: dip('motoByp2', 'MotoByp 2', 74, 'dipRight', 'On the pedal, makes the Channel 2 footswitch momentary. The editor’s bypass buttons always latch.'),
  contour2: dip('contour2', 'Contour 2', 75, 'dipRight', 'Inverts the midrange response of Channel 2.'),
  presence2: dip('presence2', 'Presence 2', 76, 'dipRight', 'Inverts the high-frequency response of Channel 2.'),
  master: dip('master', 'Master', 77, 'dipRight', 'Makes Vol 2 set the overall output volume at all times, even with Channel 2 bypassed. Vol 1 then works only with both Channels on, as a stack mix control.'),
  // Performance Controls (SPEC.md §4.6): sent live, never stored in a Preset or sent by Send All.
  expression: {
    id: 'expression',
    label: 'Expression',
    cc: 100,
    kind: 'continuous',
    group: 'performance',
    scope: 'performance',
    min: 0,
    max: 127,
    default: 0,
    help: 'Moves the knobs whose Expression / CV target dips are on, like an expression pedal, from heel (0) to toe (127). It needs at least one target dip on.',
  },
} as const satisfies Record<string, ParamDef>;

export type ParamId = keyof typeof PARAMS;

/** Params saved in a Preset, and so held in the Working State. */
export type PresetParamId = {
  [K in ParamId]: (typeof PARAMS)[K]['scope'] extends 'preset' ? K : never;
}[ParamId];

/** Performance Controls: only Expression. */
export type PerformanceParamId = {
  [K in ParamId]: (typeof PARAMS)[K]['scope'] extends 'performance' ? K : never;
}[ParamId];

/** Effect Order's 2+1 position, as the Working State holds it. */
export const EFFECT_ORDER_PARALLEL = PARAMS.effectOrder.values[1]!.value;

/** Amp Type's Solo position, the voicing Contour 2 and Presence 2 work the other way round for. */
export const AMP_TYPE_SOLO = PARAMS.ampType.values[2]!.value;

/** The Expression / CV target dip for each knob (CC 61–66). */
export const TARGET_DIPS: Partial<Record<PresetParamId, PresetParamId>> = {
  vol1: 'volume1Target',
  vol2: 'volume2Target',
  gain1: 'gain1Target',
  gain2: 'gain2Target',
  tone1: 'tone1Target',
  tone2: 'tone2Target',
};

const byCc = new Map<number, ParamDef>(Object.values(PARAMS).map((p) => [p.cc, p]));

/** How the pedal reads an on/off control: 0 = off, ≥1 = on. */
export function isOn(value: number): boolean {
  return value >= 1;
}

/** The value that turns an on/off control on (its max) or off (its min). */
export function switchValue(param: ParamDef, on: boolean): number {
  return on ? param.max : param.min;
}

/**
 * Rounds and clamps a value into the range the parameter accepts. Matches the pedal's own decoding:
 * toggles read 0/1 as position 1 and ≥3 as position 3; switches read ≥1 as on (sent as their max).
 */
export function clampToParam(param: ParamDef, value: number): number {
  if (param.kind === 'switch') return isOn(value) ? param.max : param.min;
  return Math.min(param.max, Math.max(param.min, Math.round(value)));
}

/** The name of the setting `value` gives a control with named settings, e.g. "Plexi" or "On"; undefined for a plain level. */
export function settingLabel(param: ParamDef, value: number): string | undefined {
  return param.values?.find((v) => v.value === value)?.label;
}

export function paramByCc(cc: number): ParamDef | undefined {
  return byCc.get(cc);
}

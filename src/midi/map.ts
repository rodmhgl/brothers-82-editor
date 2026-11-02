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
  /** A centre the knob marks and snaps back to on double-click (e.g. flat EQ). */
  detent?: number;
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

/** Enters (≥1) or leaves (0) the Hidden Options, like holding both footswitches. Never sent by the editor (SPEC.md §4.4). */
export const ALT_MENU_CC = 104;

/** A second Swell CC: holding AUX, where CC 103 is pressing it. Never sent by the editor (SPEC.md §4.4). */
export const SWELL_ALTERNATE_CC = 105;

/** Factory Reset, any value: puts the Live Hidden Options back to their defaults. Saved Slots are untouched (SPEC.md §4.6). */
export const FACTORY_RESET_CC = 56;

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
  group: 'toggle' | 'hidden',
  positions: readonly [string, string, string],
  defaultValue: number,
  help: string,
) =>
  ({
    id,
    label,
    cc,
    kind: 'toggle3',
    values: positions.map((p, i) => ({ label: p, value: i + 1 })),
    group,
    scope: 'preset',
    min: 1,
    max: 3,
    default: defaultValue,
    help,
  }) as const;

const onOff = <Id extends string, Group extends ParamDef['group'], Scope extends ParamDef['scope']>(
  id: Id,
  label: string,
  cc: number,
  group: Group,
  scope: Scope,
  defaultValue: number,
  help: string,
  values: { label: string; value: number }[] = SWITCH_VALUES,
  // Off is 0; on is sent as the last value (127, or 3 for Shifty Response).
) => ({ id, label, cc, kind: 'switch', values, group, scope, min: 0, max: values.at(-1)!.value, default: defaultValue, help }) as const;

const dip = <Id extends string>(
  id: Id,
  label: string,
  cc: number,
  group: 'dipLeft' | 'dipRight',
  help: string,
  values?: { label: string; value: number }[],
) => onOff(id, label, cc, group, 'preset', 0, help, values);

const target = <Id extends string>(id: Id, knob: string, cc: number) =>
  dip(id, `${knob} target`, cc, 'dipLeft', `Lets ramping or an expression pedal move ${knob}.`);

export const PARAMS = {
  // Knobs (SPEC.md §4.1). Defaults: the manual's "safe space" setting (hardware check #8).
  dynamics: level('dynamics', 'Dynamics', 14, 'knob', 39, 'How hard the signal is clamped: compression up to noon, hard limiting at noon, then sag at the top.'),
  sensitivity: level('sensitivity', 'Sensitivity', 15, 'knob', 77, 'What counts as too loud: higher reacts to quieter playing.'),
  wet: level('wet', 'Wet', 16, 'knob', 77, 'Level of the compressed signal; can boost.'),
  attack: level('attack', 'Attack', 17, 'knob', 39, 'How fast the compressor clamps down, 0.5 ms to 300 ms. Also the speed of the moving EQ modes and Motion.'),
  eq: { ...level('eq', 'EQ', 18, 'knob', 64, 'Counter-clockwise removes highs, clockwise removes lows; noon is flat.'), detent: 64 },
  dry: level('dry', 'Dry', 19, 'knob', 77, 'Level of the unprocessed signal; can boost.'),
  // Toggles (SPEC.md §4.2).
  release: toggle3('release', 'Release', 21, 'toggle', ['Fast', 'User', 'Slow'], 2, 'How fast the compressor lets go: Fast (50 ms), User (the User Release Hidden Option) or Slow (1.5 s).'),
  mode: toggle3('mode', 'Mode', 22, 'toggle', ['Shifty', 'Manual', 'Modulated'], 2, 'How the EQ behaves: Shifty opens toward full range as you play, Manual stays put, Modulated moves as you play.'),
  physics: toggle3('physics', 'Physics', 23, 'toggle', ['Wobbly', 'Off', 'Twitchy'], 2, 'Adds unstable movement: Wobbly, none, or Twitchy.'),
  // Hidden Options (SPEC.md §4.3), with Ramp Speed. Defaults from MIDI dumps of the pedal.
  rampSpeed: level('rampSpeed', 'Ramp Speed', 20, 'hidden', 64, 'How fast ramping or bouncing moves; on the pedal, the SENSITIVITY knob sets this while ramping.'),
  gateRelease: level('gateRelease', 'Gate Release', 24, 'hidden', 64, 'How quickly the Noise Gate closes again: faster to slower.'),
  gateThreshold: level('gateThreshold', 'Gate Threshold', 25, 'hidden', 26, 'The level below which the Noise Gate mutes the input (with the Noise Gate dip on).'),
  swellIn: level('swellIn', 'Swell In', 26, 'hidden', 64, 'How long a swell takes to fade in, 100 ms to 4 s.'),
  userRelease: level('userRelease', 'User Release', 27, 'hidden', 64, 'The release time used with the Release toggle in the middle, 50 ms to 1.5 s.'),
  envelopeBalance: level('envelopeBalance', 'Envelope Balance', 28, 'hidden', 0, 'Cuts lows from the signal that drives the compressor, so bass triggers it less. Not heard as filtering.'),
  swellOut: level('swellOut', 'Swell Out', 29, 'hidden', 64, 'How long a swell takes to fade out, 100 ms to 4 s.'),
  envelopeType: toggle3('envelopeType', 'Envelope Type', 31, 'hidden', ['Analog', 'Combo', 'Adaptive'], 1, 'The envelope follower: Analog, Combo (Analog attack with Adaptive release) or Adaptive.'),
  // MIDI only: no control on the pedal sets it. Sent as ASR = 0 and Envelope = 3; 2 appears unused, so it is read as
  // on/off: 0 ASR, ≥1 Envelope.
  shiftyResponse: onOff('shiftyResponse', 'Shifty Response', 32, 'hidden', 'preset', 3, 'How the Shifty EQ mode moves: ASR or Envelope. Only affects the Shifty mode. MIDI only: no control on the pedal sets it.', [
    { label: 'ASR', value: 0 },
    { label: 'Envelope', value: 3 },
  ]),
  spreadRouting: toggle3('spreadRouting', 'Spread Routing', 33, 'hidden', ['EQ', 'Both', 'Volume'], 2, 'What the Spread dip moves in stereo: the EQ, both, or the volume (compressor and swell).'),
  // Footswitches (SPEC.md §4.4): both states are stored in a Preset.
  bypass: onOff('bypass', 'Bypass', 102, 'footswitch', 'preset', 127, 'Engages (On) or bypasses (Off) the pedal, like tapping the right footswitch.'),
  swell: onOff('swell', 'Swell', 103, 'footswitch', 'preset', 0, 'Engages the swell, like the AUX (left) footswitch. Dynamic or Manual depending on the Swell Aux dip.'),
  // Dip switches (SPEC.md §3.6, §4.5), left to right as seen from above the pedal.
  dynamicsTarget: target('dynamicsTarget', 'Dynamics', 61),
  attackTarget: target('attackTarget', 'Attack', 62),
  eqTarget: target('eqTarget', 'EQ', 63),
  dryTarget: target('dryTarget', 'Dry', 64),
  wetTarget: target('wetTarget', 'Wet', 65),
  bounce: dip('bounce', 'Bounce', 66, 'dipLeft', 'Ramping moves the targets back and forth continuously, instead of once when the pedal is engaged.'),
  sweep: dip('sweep', 'Sweep', 67, 'dipLeft', 'Where the ramp or expression range sits: below the knob’s position (B) or above it (T).', [
    { label: 'B', value: 0 },
    { label: 'T', value: 127 },
  ]),
  polarity: dip('polarity', 'Polarity', 68, 'dipLeft', 'Which way an expression pedal moves the targets: forward (F) or reversed (R).', [
    { label: 'F', value: 0 },
    { label: 'R', value: 127 },
  ]),
  miso: dip('miso', 'Miso', 71, 'dipRight', 'Feeds a single input cable to both outputs, so a mono source comes out in stereo.'),
  spread: dip('spread', 'Spread', 72, 'dipRight', 'Stereo motion and independent left/right dynamics; Spread Routing picks what moves.'),
  latch: dip('latch', 'Latch', 73, 'dipRight', 'On the pedal, makes the AUX footswitch latch Swell instead of acting while held.'),
  sidechain: dip('sidechain', 'Sidechain', 74, 'dipRight', 'The compressor follows the 1/8" sidechain input instead of your signal.'),
  noiseGate: dip('noiseGate', 'Noise Gate', 75, 'dipRight', 'Turns on the noise gate, set by Gate Threshold and Gate Release.'),
  motion: dip('motion', 'Motion', 76, 'dipRight', 'Modulates the amount of compression as you play: Dynamics sets the depth, Attack the rate.'),
  swellAux: dip('swellAux', 'Swell Aux', 77, 'dipRight', 'Makes AUX a manual swell: hold to mute, release to swell in, tap for one swell.'),
  dusty: dip('dusty', 'Dusty', 78, 'dipRight', 'Turns the limiter into a crumbly overdrive; Sensitivity sets roughly how much.'),
  // Performance Controls (SPEC.md §4.4, §4.6): sent live, never stored in a Preset or sent by Send All.
  dynamicsMax: onOff('dynamicsMax', 'Dynamics Max', 106, 'performance', 'performance', 0, 'Maxes out the sag while on, like holding the right footswitch.'),
  // 0 = off, ≥1 = on, as the manual says (Lost+Found measured the reverse on its pedal).
  ramping: onOff('ramping', 'Ramping', 52, 'performance', 'performance', 0, 'Lets ramping run (On) or stops it (Off).'),
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
    help: 'Moves the Ramp / Expression targets like an expression pedal, from heel (0) to toe (127); Sensitivity if no target is on.',
  },
} as const satisfies Record<string, ParamDef>;

export type ParamId = keyof typeof PARAMS;

/** A 3-position control's middle position: Release on User, Mode on Manual, Physics off. */
export const TOGGLE_MIDDLE = 2;

export type DynamicsZone = 'Compression' | 'Limiting' | 'Sag';

/**
 * Where a Dynamics value sits in its sweep (SPEC.md §3.2): compression below noon, hard limiting from noon, then
 * sag from about 3 o'clock (102). On the pedal sag is clearly heard from about 105, and faintly below that.
 */
export function dynamicsZone(value: number): DynamicsZone {
  return value < 64 ? 'Compression' : value < 102 ? 'Limiting' : 'Sag';
}

/** Params saved in a Preset, and so held in the Working State. */
export type PresetParamId = {
  [K in ParamId]: (typeof PARAMS)[K]['scope'] extends 'preset' ? K : never;
}[ParamId];

/** Performance Controls: Dynamics Max, Ramping and Expression. */
export type PerformanceParamId = {
  [K in ParamId]: (typeof PARAMS)[K]['scope'] extends 'performance' ? K : never;
}[ParamId];

/** The Ramp / Expression target dip for each knob that has one (CC 61–65). Any of them on engages ramping (SPEC.md §3.6). */
export const TARGET_DIPS: Partial<Record<PresetParamId, PresetParamId>> = {
  dynamics: 'dynamicsTarget',
  attack: 'attackTarget',
  eq: 'eqTarget',
  dry: 'dryTarget',
  wet: 'wetTarget',
};

/** Whether ramping is engaged: true while any target dip is on (SPEC.md §3.6). */
export function isRampingEngaged(dips: Record<PresetParamId, number>): boolean {
  return Object.values(TARGET_DIPS).some((id) => isOn(dips[id]));
}

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

/** The name of the setting `value` gives a control with named settings, e.g. "Shifty" or "On"; undefined for a plain level. */
export function settingLabel(param: ParamDef, value: number): string | undefined {
  return param.values?.find((v) => v.value === value)?.label;
}

export function paramByCc(cc: number): ParamDef | undefined {
  return byCc.get(cc);
}

import { DEFAULT_MIDI_CHANNEL } from '../midi/map';
import { VIRTUAL_PEDAL_PORT } from '../midi/transport/virtual';
import { isObject, readWorkingState } from '../model/schema';
import type { SlotMap, SlotMapEntry } from '../model/slotMap';
import { isSlot } from '../model/slots';
import type { WorkingState } from '../model/state';
import { MIDI_CHANNELS } from '../ui/midiChannels';
import type { WorkingSource } from './library';

// What the editor keeps between sessions (SPEC.md §5.11), and how it reads it back: anything stored may be from an
// older build or damaged, so every field is checked and falls back to its default.

/** The palettes the editor can be shown in, each named for the Settings tab. `amber-night` is the default. */
export const THEMES = {
  cream: 'Manual Cream',
  page: 'Manual Page',
  pink: 'Pink',
  'plum-ink': 'Plum Ink',
  'plum-night': 'Plum Night (dark)',
  'amber-night': 'Amber Night (dark)',
} as const;

export type Theme = keyof typeof THEMES;

export function isTheme(v: unknown): v is Theme {
  return typeof v === 'string' && Object.hasOwn(THEMES, v);
}

/** The editor's own settings: none of them is sent to the pedal. */
export type Settings = {
  /** Send All whenever an output is connected or reconnected. */
  autoSendAll: boolean;
  /** Gap between Send All messages, in ms. */
  sendThrottleMs: number;
  /** Multiplies how far a knob turns per pixel dragged. */
  knobSensitivity: number;
  theme: Theme;
  /** Percent, on top of the layout's own fit to the window. */
  uiScale: number;
  /** Shows each control's CC number beside it. */
  showCcNumbers: boolean;
  /** Storing to a Slot asks for a second click first. */
  confirmOverwrite: boolean;
};

export const SEND_THROTTLE_RANGE = { min: 0, max: 50 };
export const UI_SCALE_RANGE = { min: 75, max: 200 };
/** Knob drag sensitivities offered, as multiples of the default. */
export const KNOB_SENSITIVITIES = [0.5, 0.75, 1, 1.5, 2];

export const DEFAULT_SETTINGS: Settings = {
  autoSendAll: true,
  sendThrottleMs: 2,
  knobSensitivity: 1,
  theme: 'amber-night',
  uiScale: 100,
  showCcNumbers: true,
  confirmOverwrite: true,
};

/** Bump when a stored session can no longer be read as this one; an older session is then ignored. */
export const SESSION_VERSION = 1;

export type Session = {
  version: typeof SESSION_VERSION;
  working: WorkingState;
  /** Null for a Working State with no Preset that was never saved: it restores as Untitled. */
  source: WorkingSource | null;
  slotMap: SlotMap;
  midiChannel: number;
  outputId: string;
  inputId: string | null;
  settings: Settings;
};

const isString = (v: unknown): v is string => typeof v === 'string';

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

/** A stored session, checked field by field; null if it isn't one this version can read. */
export function parseSession(raw: unknown): Session | null {
  if (!isObject(raw) || raw.version !== SESSION_VERSION) return null;
  const midiChannel = raw.midiChannel;
  return {
    version: SESSION_VERSION,
    working: readWorkingState(raw.working),
    source: readSource(raw.source),
    slotMap: readSlotMap(raw.slotMap),
    midiChannel:
      isNumber(midiChannel) && MIDI_CHANNELS.includes(midiChannel) ? midiChannel : DEFAULT_MIDI_CHANNEL,
    outputId: isString(raw.outputId) ? raw.outputId : VIRTUAL_PEDAL_PORT.id,
    inputId: isString(raw.inputId) ? raw.inputId : null,
    settings: readSettings(raw.settings),
  };
}

function readSource(raw: unknown): WorkingSource | null {
  if (!isObject(raw) || !isString(raw.name) || !isObject(raw.params)) return null;
  return { presetId: isString(raw.presetId) ? raw.presetId : null, name: raw.name, params: readWorkingState(raw.params) };
}

function readSlotMap(raw: unknown): SlotMap {
  const slotMap: SlotMap = {};
  if (!isObject(raw)) return slotMap;
  for (const [key, entry] of Object.entries(raw)) {
    const slot = Number(key);
    if (!isSlot(slot) || !isObject(entry) || !isObject(entry.snapshot)) continue;
    if (!isString(entry.name) || !isString(entry.writtenAt)) continue;
    const read: SlotMapEntry = { slot, snapshot: readWorkingState(entry.snapshot), name: entry.name, writtenAt: entry.writtenAt };
    if (isString(entry.presetId)) read.presetId = entry.presetId;
    slotMap[slot] = read;
  }
  return slotMap;
}

function readSettings(raw: unknown): Settings {
  const stored = isObject(raw) ? raw : {};
  const defaults = DEFAULT_SETTINGS;
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const { sendThrottleMs, knobSensitivity, uiScale } = stored;
  return {
    autoSendAll: flag(stored.autoSendAll, defaults.autoSendAll),
    sendThrottleMs: isNumber(sendThrottleMs) ? Math.round(clamp(sendThrottleMs, SEND_THROTTLE_RANGE)) : defaults.sendThrottleMs,
    knobSensitivity:
      isNumber(knobSensitivity) && KNOB_SENSITIVITIES.includes(knobSensitivity) ? knobSensitivity : defaults.knobSensitivity,
    theme: isTheme(stored.theme) ? stored.theme : defaults.theme,
    uiScale: isNumber(uiScale) ? Math.round(clamp(uiScale, UI_SCALE_RANGE)) : defaults.uiScale,
    showCcNumbers: flag(stored.showCcNumbers, defaults.showCcNumbers),
    confirmOverwrite: flag(stored.confirmOverwrite, defaults.confirmOverwrite),
  };
}

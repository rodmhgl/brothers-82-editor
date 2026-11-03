import { PARAMS, clampToParam, type PresetParamId } from '../midi/map';
import type { WorkingState } from './state';

// The Preset file format (ADR 0002, SPEC.md §5.6): a small envelope and a flat map of raw preset-scoped params.

export const PRESET_FORMAT = 'brothers-82-preset';
export const PRESET_EXTENSION = '.b82preset.json';

/** A Bundle: full copies of several Presets in one file, for sharing or backup. */
export const BUNDLE_FORMAT = 'brothers-82-bundle';
export const BUNDLE_EXTENSION = '.b82bundle.json';

/**
 * Another pedal's file is refused, never loaded best-effort: it would come out an all-defaults Preset (ADR 0002).
 * Each `format` prefix names the editor it belongs to.
 */
const OTHER_PEDAL_PREFIXES: [prefix: string, editor: string][] = [
  ['clean-', 'Clean'],
  ['lost-found-', 'Lost+Found'],
];

/** Why a file object belongs to another pedal, or null if it doesn't seem to. */
function otherPedalError(file: unknown): string | null {
  if (!isObject(file) || typeof file.format !== 'string') return null;
  const format = file.format;
  const pedal = OTHER_PEDAL_PREFIXES.find(([prefix]) => format.startsWith(prefix));
  if (!pedal) return null;
  const [prefix, editor] = pedal;
  const rest = format.slice(prefix.length);
  const kind = rest === 'preset' ? 'Preset' : rest === 'bundle' ? 'Bundle' : 'file';
  return `This is a ${editor} ${kind}, open it in the ${editor} editor`;
}

/** Bump with a migration whenever a preset param is added, a param ID is renamed or what a value means changes (ADR 0002). */
export const SCHEMA_VERSION = 1;

export type Preset = {
  /** The Preset's identity: survives Rename; New, Save As and Duplicate make a new one. */
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  modifiedAt: string;
  params: WorkingState;
};

export type ParseResult = { ok: true; preset: Preset; warnings: string[] } | { ok: false; error: string };

/** The params a Preset holds, in `PARAMS` order. */
const PRESET_PARAMS = Object.values(PARAMS).filter((p) => p.scope === 'preset');

/** 2-space JSON, envelope first, params in `PARAMS` order, trailing newline: an unchanged Preset writes an identical file. */
export function serializePreset(preset: Preset): string {
  return `${JSON.stringify(presetFile(preset), null, 2)}\n`;
}

/** A Preset as the object its file holds; a Bundle embeds the same object. */
function presetFile(preset: Preset) {
  return {
    format: PRESET_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: __APP_VERSION__,
    id: preset.id,
    name: preset.name,
    notes: preset.notes,
    createdAt: preset.createdAt,
    modifiedAt: preset.modifiedAt,
    params: Object.fromEntries(PRESET_PARAMS.map((p) => [p.id, preset.params[p.id as PresetParamId]])),
  };
}

/** A Bundle file: envelope first, then each Preset in full, keeping its id. No Slot numbers and no id of its own. */
export function serializeBundle(name: string, presets: Preset[], exportedAt: string): string {
  const file = {
    format: BUNDLE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: __APP_VERSION__,
    name,
    exportedAt,
    presets: presets.map(presetFile),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** A Preset name is trimmed, non-empty and at most this long; it need not be unique. */
export const MAX_NAME_LENGTH = 64;

/** The name as stored, or null if it is blank. */
export function presetName(input: string): string | null {
  const name = input.trim().slice(0, MAX_NAME_LENGTH).trim();
  return name || null;
}

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads a Preset file. `format` decides what a file is; the extension is ignored. Newer schema versions are
 * refused, so an older editor can't silently drop fields on save (ADR 0002).
 */
export function parsePreset(text: string): ParseResult {
  const file = parseJson(text);
  return file === undefined ? { ok: false, error: 'Not a Preset file' } : readPreset(file);
}

export type LibraryFileResult = { ok: true; presets: Preset[]; problems: string[] } | { ok: false; error: string };

/**
 * Reads an imported file, a Preset or a Bundle as its `format` says. A broken Preset inside a Bundle is skipped
 * and reported, with every warning, by the Preset's name or else its position.
 */
export function parseLibraryFile(text: string): LibraryFileResult {
  const file = parseJson(text);
  const otherPedal = otherPedalError(file);
  if (otherPedal) return { ok: false, error: otherPedal };
  if (isObject(file) && file.format === PRESET_FORMAT) {
    const result = readPreset(file);
    return result.ok ? { ok: true, presets: [result.preset], problems: result.warnings } : result;
  }
  if (!isObject(file) || file.format !== BUNDLE_FORMAT) return { ok: false, error: 'Not a Preset or Bundle file' };
  const versionError = schemaVersionError(file.schemaVersion);
  if (versionError) return { ok: false, error: versionError };
  if (!Array.isArray(file.presets)) return { ok: false, error: 'Missing presets' };
  const presets: Preset[] = [];
  const problems: string[] = [];
  file.presets.forEach((item: unknown, i) => {
    const result = readPreset(item);
    if (!result.ok) {
      problems.push(`Preset ${i + 1}: ${result.error}`);
      return;
    }
    presets.push(result.preset);
    problems.push(...result.warnings.map((w) => `${result.preset.name}: ${w}`));
  });
  return { ok: true, presets, problems };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Why a file's `schemaVersion` can't be read, or null if it can. */
function schemaVersionError(schemaVersion: unknown): string | null {
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return 'Missing schemaVersion';
  }
  if (schemaVersion > SCHEMA_VERSION) return 'Made by a newer version of the editor, please update';
  return null;
}

/** A Preset from its file object, whether a file of its own or inside a Bundle. */
function readPreset(file: unknown): ParseResult {
  const otherPedal = otherPedalError(file);
  if (otherPedal) return { ok: false, error: otherPedal };
  if (!isObject(file) || file.format !== PRESET_FORMAT) return { ok: false, error: 'Not a Preset file' };
  // A newer file may hold its fields differently, so its version is checked first.
  const versionError = schemaVersionError(file.schemaVersion);
  if (versionError) return { ok: false, error: versionError };
  if (typeof file.id !== 'string' || !file.id) return { ok: false, error: 'Missing id' };
  const name = typeof file.name === 'string' ? presetName(file.name) : null;
  if (!name) return { ok: false, error: 'Missing name' };
  const warnings: string[] = [];
  if ((file.name as string).trim().length > MAX_NAME_LENGTH) {
    warnings.push(`Name longer than ${MAX_NAME_LENGTH} characters: shortened`);
  }
  const params = readParams(migrateParams(isObject(file.params) ? file.params : {}, file.schemaVersion as number), warnings);
  const date = (v: unknown) => (typeof v === 'string' ? v : new Date(0).toISOString());
  return {
    ok: true,
    preset: {
      id: file.id,
      name,
      notes: typeof file.notes === 'string' ? file.notes : '',
      createdAt: date(file.createdAt),
      modifiedAt: date(file.modifiedAt),
      params,
    },
    warnings,
  };
}

/**
 * Each step brings a file's params from one `schemaVersion` to the next (ADR 0002): step i upgrades version i + 1.
 * A param a step adds takes its map default without a warning: the file isn't missing it.
 */
const MIGRATIONS: ((params: Record<string, unknown>) => Record<string, unknown>)[] = [];

/** A file's params brought up to `SCHEMA_VERSION`, one step at a time. */
function migrateParams(params: Record<string, unknown>, schemaVersion: number): Record<string, unknown> {
  return MIGRATIONS.slice(schemaVersion - 1).reduce((migrated, step) => step(migrated), params);
}

/** A Working State from anything stored, normalised as a Preset file's params are, without the warnings. */
export function readWorkingState(raw: unknown): WorkingState {
  return readParams(isObject(raw) ? raw : {}, []);
}

/**
 * Missing params take map defaults, unknown params are dropped, and values are normalised as the pedal
 * decodes them, then clamped. Every change is reported (SPEC.md §5.6).
 */
function readParams(raw: Record<string, unknown>, warnings: string[]): WorkingState {
  const params = {} as WorkingState;
  for (const p of PRESET_PARAMS) {
    const id = p.id as PresetParamId;
    const value = raw[id];
    if (value === undefined) {
      params[id] = p.default;
      warnings.push(`${id} missing: set to ${p.default}`);
      continue;
    }
    params[id] = typeof value === 'number' && Number.isFinite(value) ? clampToParam(p, value) : p.default;
    if (params[id] !== value) warnings.push(`${id} ${JSON.stringify(value)}: set to ${params[id]}`);
  }
  const known = new Set<string>(PRESET_PARAMS.map((p) => p.id));
  for (const id of Object.keys(raw)) if (!known.has(id)) warnings.push(`Unknown param ${id} dropped`);
  return params;
}

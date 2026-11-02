import { describe, expect, it } from 'vitest';
import { defaultWorkingState } from './state';
import { parseLibraryFile, parsePreset, serializeBundle, serializePreset, type Preset } from './schema';

const shimmer: Preset = {
  id: '6f1c2d3e-0000-4000-8000-000000000001',
  name: 'Shimmer Tape',
  notes: 'Big wash',
  createdAt: '2026-10-01T10:00:00.000Z',
  modifiedAt: '2026-10-02T11:30:00.000Z',
  params: { ...defaultWorkingState(), attack: 90, mode: 2, sidechain: 127 },
};

describe('serializePreset', () => {
  it('writes the envelope first, then every preset param and no Performance Controls', () => {
    const text = serializePreset(shimmer);
    const file = JSON.parse(text);

    expect(Object.keys(file)).toEqual([
      'format',
      'schemaVersion',
      'appVersion',
      'id',
      'name',
      'notes',
      'createdAt',
      'modifiedAt',
      'params',
    ]);
    expect(file.format).toBe('clean-preset');
    expect(file.schemaVersion).toBe(1);
    expect(typeof file.appVersion).toBe('string');
    expect(Object.keys(file.params).slice(0, 6)).toEqual(['dynamics', 'sensitivity', 'wet', 'attack', 'eq', 'dry']);
    expect(file.params).toMatchObject({ attack: 90, mode: 2, sidechain: 127 });
    for (const excluded of ['dynamicsMax', 'ramping', 'expression']) {
      expect(file.params, excluded).not.toHaveProperty(excluded);
    }
  });

  it('is 2-space JSON with a trailing newline, so an unchanged Preset writes an identical file', () => {
    const text = serializePreset(shimmer);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "format": "clean-preset",\n');
    expect(serializePreset(shimmer)).toBe(text);
  });
});

describe('parsePreset', () => {
  it('reads back what serializePreset wrote, without warnings', () => {
    expect(parsePreset(serializePreset(shimmer))).toEqual({ ok: true, preset: shimmer, warnings: [] });
  });
});

describe('parsePreset rejects', () => {
  const valid = () => JSON.parse(serializePreset(shimmer));
  const parse = (file: unknown) => parsePreset(JSON.stringify(file));

  it.each([
    ['broken JSON', '{"format": "clean-preset",'],
    ['a JSON value that is not an object', '[1, 2]'],
  ])('%s', (_, text) => {
    expect(parsePreset(text)).toEqual({ ok: false, error: 'Not a Preset file' });
  });

  it('a file whose format is not a Preset, whatever its extension', () => {
    expect(parse({ ...valid(), format: 'clean-bundle' })).toEqual({ ok: false, error: 'Not a Preset file' });
    expect(parse({ ...valid(), format: undefined })).toEqual({ ok: false, error: 'Not a Preset file' });
  });

  it.each([
    ['lost-found-preset', 'This is a Lost+Found Preset, open it in the Lost+Found editor'],
    ['lost-found-bundle', 'This is a Lost+Found Bundle, open it in the Lost+Found editor'],
  ])('a %s file, naming the pedal it belongs to', (format, error) => {
    expect(parse({ ...valid(), format })).toEqual({ ok: false, error });
  });

  it.each(['id', 'name', 'schemaVersion'])('a file missing its %s', (field) => {
    expect(parse({ ...valid(), [field]: undefined })).toEqual({ ok: false, error: `Missing ${field}` });
  });

  it.each([0, 1.5, '1'])('a schemaVersion of %j', (schemaVersion) => {
    expect(parse({ ...valid(), schemaVersion })).toEqual({ ok: false, error: 'Missing schemaVersion' });
  });

  it('a blank name', () => {
    expect(parse({ ...valid(), name: '   ' })).toEqual({ ok: false, error: 'Missing name' });
  });

  it('a file made by a newer version, rather than loading it best-effort', () => {
    expect(parse({ ...valid(), schemaVersion: 2 })).toEqual({
      ok: false,
      error: 'Made by a newer version of the editor, please update',
    });
  });
});

describe('parsePreset normalises params the way the pedal decodes them, and reports each change', () => {
  const parseParams = (params: Record<string, unknown>) => {
    const file = JSON.parse(serializePreset(shimmer));
    const result = parsePreset(JSON.stringify({ ...file, params: { ...file.params, ...params } }));
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it('gives missing params their map default', () => {
    const file = JSON.parse(serializePreset(shimmer));
    delete file.params.sensitivity;
    delete file.params.dusty;
    const result = parsePreset(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.preset.params.sensitivity).toBe(77);
    expect(result.preset.params.dusty).toBe(0);
    expect(result.warnings).toEqual(['sensitivity missing: set to 77', 'dusty missing: set to 0']);
  });

  it('drops unknown params, including Performance Controls', () => {
    const result = parseParams({ sparkle: 3, expression: 127 });
    expect(result.preset.params).not.toHaveProperty('sparkle');
    expect(result.preset.params).not.toHaveProperty('expression');
    expect(result.warnings).toEqual(['Unknown param sparkle dropped', 'Unknown param expression dropped']);
  });

  it('reads toggles ≤1 as 1 and ≥3 as 3, switches ≥1 as 127, and clamps continuous values to 0–127', () => {
    const result = parseParams({ release: 0, physics: 9, sidechain: 1, sensitivity: 200, eq: -4, dynamics: 33.6 });
    expect(result.preset.params).toMatchObject({
      release: 1,
      physics: 3,
      sidechain: 127,
      sensitivity: 127,
      eq: 0,
      dynamics: 34,
    });
    expect(result.warnings).toEqual([
      'dynamics 33.6: set to 34',
      'sensitivity 200: set to 127',
      'eq -4: set to 0',
      'release 0: set to 1',
      'physics 9: set to 3',
      'sidechain 1: set to 127',
    ]);
  });

  it('replaces non-numbers with the default', () => {
    const result = parseParams({ dry: '90', mode: null });
    expect(result.preset.params).toMatchObject({ dry: 77, mode: 2 });
    expect(result.warnings).toEqual(['dry "90": set to 77', 'mode null: set to 2']);
  });

  it('shortens a name longer than 64 characters', () => {
    const file = { ...JSON.parse(serializePreset(shimmer)), name: 'x'.repeat(70) };
    const result = parsePreset(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.preset.name).toBe('x'.repeat(64));
    expect(result.warnings).toEqual(['Name longer than 64 characters: shortened']);
  });

  it('defaults missing notes and dates', () => {
    const file = JSON.parse(serializePreset(shimmer));
    delete file.notes;
    delete file.createdAt;
    const result = parsePreset(JSON.stringify(file));
    if (!result.ok) throw new Error(result.error);
    expect(result.preset.notes).toBe('');
    expect(result.preset.createdAt).toBe('1970-01-01T00:00:00.000Z');
  });
});

describe('Bundles', () => {
  const tape: Preset = { ...shimmer, id: '6f1c2d3e-0000-4000-8000-000000000002', name: 'Tape', notes: '' };

  it('writes the envelope first, then each Preset as a full Preset object keeping its id', () => {
    const file = JSON.parse(serializeBundle('My Presets', [shimmer, tape], '2026-10-07T09:00:00.000Z'));

    expect(Object.keys(file)).toEqual(['format', 'schemaVersion', 'appVersion', 'name', 'exportedAt', 'presets']);
    expect(file).toMatchObject({ format: 'clean-bundle', schemaVersion: 1, name: 'My Presets' });
    expect(file.exportedAt).toBe('2026-10-07T09:00:00.000Z');
    expect(file.presets).toEqual([JSON.parse(serializePreset(shimmer)), JSON.parse(serializePreset(tape))]);
    expect(file).not.toHaveProperty('id');
  });

  it('reads back every Preset in a Bundle, without problems', () => {
    expect(parseLibraryFile(serializeBundle('My Presets', [shimmer, tape], '2026-10-07T09:00:00.000Z'))).toEqual({
      ok: true,
      presets: [shimmer, tape],
      problems: [],
    });
  });

  it('reads a single Preset file as one Preset', () => {
    expect(parseLibraryFile(serializePreset(shimmer))).toEqual({ ok: true, presets: [shimmer], problems: [] });
  });

  it('skips a broken Preset inside a Bundle and reports it and any warnings by name or position', () => {
    const file = JSON.parse(serializeBundle('My Presets', [shimmer, tape], '2026-10-07T09:00:00.000Z'));
    delete file.presets[0].params.sensitivity;
    file.presets[1].id = '';
    file.presets.push('nope');

    expect(parseLibraryFile(JSON.stringify(file))).toEqual({
      ok: true,
      presets: [shimmer],
      problems: ['Shimmer Tape: sensitivity missing: set to 77', 'Preset 2: Missing id', 'Preset 3: Not a Preset file'],
    });
  });

  it('skips a Lost+Found Preset inside a Bundle, naming the pedal it belongs to', () => {
    const file = JSON.parse(serializeBundle('My Presets', [shimmer, tape], '2026-10-07T09:00:00.000Z'));
    file.presets[1].format = 'lost-found-preset';

    expect(parseLibraryFile(JSON.stringify(file))).toEqual({
      ok: true,
      presets: [shimmer],
      problems: ['Preset 2: This is a Lost+Found Preset, open it in the Lost+Found editor'],
    });
  });

  it.each([
    ['broken JSON', '{', 'Not a Preset or Bundle file'],
    ['another format', JSON.stringify({ format: 'something-else' }), 'Not a Preset or Bundle file'],
    ['a Bundle with no presets list', JSON.stringify({ format: 'clean-bundle', schemaVersion: 1 }), 'Missing presets'],
    [
      'a Bundle made by a newer version',
      JSON.stringify({ format: 'clean-bundle', schemaVersion: 2, presets: [] }),
      'Made by a newer version of the editor, please update',
    ],
    ['a broken Preset file', JSON.stringify({ format: 'clean-preset', schemaVersion: 1 }), 'Missing id'],
    [
      'a Lost+Found Preset',
      JSON.stringify({ format: 'lost-found-preset', schemaVersion: 1 }),
      'This is a Lost+Found Preset, open it in the Lost+Found editor',
    ],
    [
      'a Lost+Found Bundle',
      JSON.stringify({ format: 'lost-found-bundle', schemaVersion: 1, presets: [] }),
      'This is a Lost+Found Bundle, open it in the Lost+Found editor',
    ],
  ])('rejects %s', (_, text, error) => {
    expect(parseLibraryFile(text)).toEqual({ ok: false, error });
  });
});

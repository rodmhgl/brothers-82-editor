import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVirtualPedal, type VirtualPedal } from '../midi/transport/virtual';
import { FACTORY_PRESETS } from '../model/factoryPresets';
import { parseLibraryFile, parsePreset, serializeBundle, serializePreset, type Preset } from '../model/schema';
import { defaultWorkingState } from '../model/state';
import { createEditorStore } from './editorStore';
import {
  BACKUP_INTERVAL_DAYS,
  backupDue,
  createLibraryStore,
  isModified,
  type LibraryDeps,
  type PickedFolder,
} from './library';

/**
 * A Library folder held in memory: file name → contents. `permission` is what the browser allows without asking,
 * and `answer` what the user says when asked.
 */
function memoryFolder(
  files: Record<string, string> = {},
  permission: PermissionState = 'granted',
  answer: PermissionState = permission,
) {
  const asked = { count: 0 };
  const folder: PickedFolder = {
    name: 'My Presets',
    queryPermission: async () => permission,
    requestPermission: async () => {
      asked.count++;
      permission = answer;
      return permission;
    },
    list: async () => Object.keys(files),
    read: async (fileName) => files[fileName]!,
    write: async (fileName, text) => {
      files[fileName] = text;
    },
    remove: async (fileName) => {
      delete files[fileName];
    },
  };
  return { folder, files, asked };
}

/** A folder deleted since it was picked. */
function goneFolder(): PickedFolder {
  const gone = async (): Promise<never> => {
    throw new DOMException('A requested file or directory could not be found', 'NotFoundError');
  };
  return { ...memoryFolder().folder, list: gone, read: gone };
}

function preset(name: string, params: Partial<Preset['params']> = {}, id = `id-${name}`): Preset {
  return {
    id,
    name,
    notes: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    modifiedAt: '2026-10-01T10:00:00.000Z',
    params: { ...defaultWorkingState(), ...params },
  };
}

/** The Preset stored in a file, as the editor would read it back. */
function presetIn(files: Record<string, string>, fileName: string): Preset {
  const result = parsePreset(files[fileName]!);
  if (!result.ok) throw new Error(result.error);
  return result.preset;
}

let virtualPedal: VirtualPedal;
let editor: ReturnType<typeof createEditorStore>;
let library: ReturnType<typeof createLibraryStore>;
let clock = 0;
let ids = 0;
/** Files the editor handed the browser to save, oldest first. */
let downloads: { fileName: string; text: string }[];
/** The browser Library's last backup (or "Later"), as the editor recorded it. */
let backupCheckedAt: string | null;
/** The Library folder the editor remembers for the next launch. */
let remembered: PickedFolder | null;

function deps(folder: PickedFolder | null, browserFolder = memoryFolder().folder): LibraryDeps {
  return {
    pickFolder: async () => folder,
    openBrowserStorage: async () => browserFolder,
    now: () => new Date(clock++ * 60_000 + Date.UTC(2026, 9, 5)).toISOString(),
    newId: () => `new-${++ids}`,
    download: (fileName, text) => downloads.push({ fileName, text }),
    backupLog: {
      load: () => backupCheckedAt,
      save: (at) => {
        backupCheckedAt = at;
      },
    },
    rememberedFolder: {
      load: async () => remembered,
      save: async (picked) => {
        remembered = picked;
      },
      clear: async () => {
        remembered = null;
      },
    },
  };
}

function setup(folder: PickedFolder) {
  library = createLibraryStore(editor, deps(folder));
  return library.getState().pickFolder();
}

const [factoryLeft, factoryRight] = FACTORY_PRESETS as [Preset, Preset];

beforeEach(() => {
  virtualPedal = createVirtualPedal();
  editor = createEditorStore(virtualPedal);
  clock = 0;
  ids = 0;
  downloads = [];
  backupCheckedAt = null;
  remembered = null;
});

describe('picking a Library folder', () => {
  it('lists its Presets by name and reports files it could not read', async () => {
    const { folder } = memoryFolder({
      'zed.cleanpreset.json': serializePreset(preset('Zed')),
      'shimmer-tape.cleanpreset.json': serializePreset(preset('Shimmer Tape')),
      'broken.cleanpreset.json': '{ nope',
      'notes.txt': 'not json',
    });
    await setup(folder);

    const { folderName, presets, problems } = library.getState();
    expect(folderName).toBe('My Presets');
    expect(presets.map((p) => [p.preset.name, p.fileName])).toEqual([
      ['Shimmer Tape', 'shimmer-tape.cleanpreset.json'],
      ['Zed', 'zed.cleanpreset.json'],
    ]);
    expect(problems).toEqual(['broken.cleanpreset.json: Not a Preset file']);
  });

  it('keeps the first of two files with the same id', async () => {
    const { folder } = memoryFolder({
      'a.cleanpreset.json': serializePreset(preset('A', {}, 'same')),
      'b.cleanpreset.json': serializePreset(preset('B', {}, 'same')),
    });
    await setup(folder);

    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['A']);
    expect(library.getState().problems).toEqual(['b.cleanpreset.json: same id as a.cleanpreset.json, skipped']);
  });

  it('stays as it was if the user cancels the picker', async () => {
    library = createLibraryStore(editor, deps(null));
    await library.getState().pickFolder();
    expect(library.getState().folderName).toBeNull();
  });
});

function markInSync() {
  editor.setState((s) => ({ editor: { ...s.editor, sync: 'inSync' } }));
}

/** What the editor shows for the Working State: its name, with "•" when modified. */
function workingLabel() {
  const { source } = library.getState();
  return `${source.name}${isModified(editor.getState().editor.working, source) ? ' •' : ''}`;
}

describe('the remembered Library folder', () => {
  /** A launch: a fresh Library that opens the folder remembered from the last one. */
  async function launch() {
    library = createLibraryStore(editor, deps(null));
    await library.getState().openRememberedFolder();
  }

  it('is the folder last picked', async () => {
    const first = memoryFolder().folder;
    const second = memoryFolder().folder;
    await setup(first);
    expect(remembered).toBe(first);

    library = createLibraryStore(editor, deps(second));
    await library.getState().pickFolder();
    expect(remembered).toBe(second);
  });

  it('leaves the Library as it was when there is none', async () => {
    await launch();
    expect(library.getState()).toMatchObject({ folderName: null, storage: null, remembered: null });
  });

  it('opens silently when the browser still allows it', async () => {
    const { folder, asked } = memoryFolder({ 'zed.cleanpreset.json': serializePreset(preset('Zed')) });
    remembered = folder;

    await launch();

    expect(library.getState()).toMatchObject({ folderName: 'My Presets', storage: 'folder', remembered: null });
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['Zed']);
    expect(asked.count).toBe(0);
  });

  it('shows it is opening while the folder is read', async () => {
    let finishListing!: () => void;
    const { folder } = memoryFolder();
    remembered = { ...folder, list: () => new Promise((resolve) => (finishListing = () => resolve([]))) };
    library = createLibraryStore(editor, deps(null));

    const opening = library.getState().openRememberedFolder();
    await vi.waitUntil(() => finishListing);
    expect(library.getState().remembered).toEqual({ name: 'My Presets', status: 'opening' });
    finishListing();
    await opening;

    expect(library.getState()).toMatchObject({ folderName: 'My Presets', remembered: null });
  });

  it('waits for a click when the browser needs to ask, then opens on Reopen', async () => {
    const { folder, asked } = memoryFolder({ 'zed.cleanpreset.json': serializePreset(preset('Zed')) }, 'prompt', 'granted');
    remembered = folder;

    await launch();
    expect(library.getState()).toMatchObject({
      folderName: null,
      remembered: { name: 'My Presets', status: 'needsPermission' },
    });
    expect(asked.count).toBe(0);

    await library.getState().reopenFolder();

    expect(asked.count).toBe(1);
    expect(library.getState()).toMatchObject({ folderName: 'My Presets', storage: 'folder', remembered: null });
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['Zed']);
  });

  it('is kept, still waiting, when the user refuses', async () => {
    const { folder } = memoryFolder({}, 'prompt', 'denied');
    remembered = folder;
    await launch();

    await library.getState().reopenFolder();

    expect(library.getState()).toMatchObject({
      folderName: null,
      remembered: { name: 'My Presets', status: 'needsPermission' },
    });
    expect(remembered).toBe(folder);
  });

  it('is forgotten when the folder has gone', async () => {
    remembered = goneFolder();

    await launch();

    expect(library.getState()).toMatchObject({ folderName: null, remembered: { name: 'My Presets', status: 'gone' } });
    expect(remembered).toBeNull();
  });

  it('is opened by Save, in the same click, which then carries on', async () => {
    const shimmer = preset('Shimmer Tape');
    const { folder, files, asked } = memoryFolder(
      { 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) },
      'prompt',
      'granted',
    );
    remembered = folder;
    await launch();
    // The last session's Working State, restored before the folder opened.
    library.setState({ source: { presetId: shimmer.id, name: shimmer.name, params: shimmer.params } });
    editor.getState().setParam('envelopeBalance', 100);

    expect(await library.getState().save()).toBe(true);

    expect(asked.count).toBe(1);
    expect(presetIn(files, 'shimmer-tape.cleanpreset.json').params.envelopeBalance).toBe(100);
    expect(library.getState()).toMatchObject({ folderName: 'My Presets', remembered: null });
  });

  it('is opened by Save As and Import too', async () => {
    const { folder, files } = memoryFolder({}, 'prompt', 'granted');
    remembered = folder;
    await launch();

    await library.getState().saveAs('Shimmer Tape');
    expect(Object.keys(files)).toEqual(['shimmer-tape.cleanpreset.json']);

    remembered = memoryFolder({}, 'prompt', 'granted').folder;
    await launch();
    await library.getState().importFiles([importFile('a.cleanpreset.json', serializePreset(preset('A')))]);
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['A']);
  });

  it('says access was refused when a Library action can’t open it', async () => {
    const { folder, files } = memoryFolder({}, 'prompt', 'denied');
    remembered = folder;
    await launch();

    await expect(library.getState().saveAs('Shimmer Tape')).rejects.toThrow(
      'Access to the folder ‘My Presets’ wasn’t allowed',
    );
    expect(files).toEqual({});
    expect(library.getState().remembered).toEqual({ name: 'My Presets', status: 'needsPermission' });
  });

  it('says the folder has gone when a Library action finds it so', async () => {
    remembered = { ...goneFolder(), queryPermission: async () => 'prompt' };
    await launch();

    await expect(library.getState().saveAs('Shimmer Tape')).rejects.toThrow(
      'Couldn’t find the folder ‘My Presets’. Choose it again.',
    );
    expect(library.getState().remembered).toEqual({ name: 'My Presets', status: 'gone' });
    expect(remembered).toBeNull();
  });

  it('gives way to a folder picked while it is still being read', async () => {
    let finishListing!: () => void;
    const old = memoryFolder({ 'old.cleanpreset.json': serializePreset(preset('Old')) }).folder;
    remembered = { ...old, list: () => new Promise((resolve) => (finishListing = () => resolve(['old.cleanpreset.json']))) };
    const picked = memoryFolder({ 'new.cleanpreset.json': serializePreset(preset('New')) }).folder;
    library = createLibraryStore(editor, deps(picked));

    const launching = library.getState().openRememberedFolder();
    await vi.waitUntil(() => finishListing);
    await library.getState().pickFolder();
    finishListing();
    await launching;

    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['New']);
    expect(library.getState().remembered).toBeNull();
    expect(remembered).toBe(picked);
  });
});

describe('Save As', () => {
  it('writes the Working State as a new Preset file, which the Working State then belongs to', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    expect(workingLabel()).toBe('Untitled');
    editor.getState().setParam('attack', 90);
    expect(workingLabel()).toBe('Untitled •');

    await library.getState().saveAs('  Shimmer Tape ');

    expect(Object.keys(files)).toEqual(['shimmer-tape.cleanpreset.json']);
    expect(presetIn(files, 'shimmer-tape.cleanpreset.json')).toEqual({
      id: 'new-1',
      name: 'Shimmer Tape',
      notes: '',
      createdAt: '2026-10-05T00:00:00.000Z',
      modifiedAt: '2026-10-05T00:00:00.000Z',
      params: { ...defaultWorkingState(), attack: 90 },
    });
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['Shimmer Tape']);
    expect(workingLabel()).toBe('Shimmer Tape');
  });

  it('numbers the file name when another file already has it', async () => {
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(preset('Shimmer Tape')) });
    await setup(folder);

    await library.getState().saveAs('Shimmer tape!');
    await library.getState().saveAs('shimmer TAPE');

    expect(Object.keys(files).sort()).toEqual([
      'shimmer-tape-2.cleanpreset.json',
      'shimmer-tape-3.cleanpreset.json',
      'shimmer-tape.cleanpreset.json',
    ]);
  });

  it('refuses a blank name', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    await expect(library.getState().saveAs('   ')).rejects.toThrow('A Preset needs a name');
    expect(files).toEqual({});
  });
});

describe('the modified marker', () => {
  it('shows after an edit and clears when the edit is put back', async () => {
    await setup(memoryFolder().folder);
    await library.getState().saveAs('Shimmer Tape');
    editor.getState().setParam('sensitivity', 100);
    expect(workingLabel()).toBe('Shimmer Tape •');
    editor.getState().setParam('sensitivity', 77);
    expect(workingLabel()).toBe('Shimmer Tape');
  });

  it('ignores Performance Controls', async () => {
    await setup(memoryFolder().folder);
    editor.getState().setParam('dynamicsMax', 127);
    editor.getState().setParam('expression', 20);
    expect(workingLabel()).toBe('Untitled');
  });
});

describe('recalling a Preset', () => {
  it('makes it the Working State and sends it to the pedal', async () => {
    const shimmer = preset('Shimmer Tape', { attack: 90, mode: 1, sidechain: 127, bypass: 0 });
    const { folder } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    editor.getState().setParam('sensitivity', 10);

    await library.getState().recall(shimmer.id);

    expect(editor.getState().editor.working).toEqual(shimmer.params);
    expect(workingLabel()).toBe('Shimmer Tape');
    const pedal = virtualPedal.getSnapshot().state;
    expect(pedal).toMatchObject({ attack: 90, mode: 1, sidechain: 127, bypass: 0, sensitivity: 77 });
    expect(editor.getState().editor.sync).toBe('inSync');
  });

  it('is Possibly Stale until its Send All has finished', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 99 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    markInSync();

    const recalled = library.getState().recall(shimmer.id);
    expect(editor.getState().editor.sync).toBe('possiblyStale');
    await recalled;
    expect(editor.getState().editor.sync).toBe('inSync');
  });

  it('leaves the pedal Possibly Stale when the output is unplugged', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 99 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    editor.setState({ outputId: 'gone' });
    markInSync();

    await library.getState().recall(shimmer.id);

    expect(editor.getState().editor.working.sensitivity).toBe(99);
    expect(editor.getState().editor.sync).toBe('possiblyStale');
  });
});

describe('New', () => {
  it('starts an Untitled Working State from the defaults and sends it', async () => {
    await setup(memoryFolder().folder);
    await library.getState().saveAs('Shimmer Tape');
    editor.getState().setParam('eq', 3);

    await library.getState().newWorkingState();

    expect(editor.getState().editor.working).toEqual(defaultWorkingState());
    expect(workingLabel()).toBe('Untitled');
    expect(virtualPedal.getSnapshot().state.eq).toBe(defaultWorkingState().eq);
  });
});

describe('Save', () => {
  it('writes the Working State back to the Preset it came from, keeping its identity', async () => {
    const shimmer = { ...preset('Shimmer Tape'), notes: 'Big wash' };
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    await library.getState().recall(shimmer.id);
    editor.getState().setParam('envelopeBalance', 100);

    expect(await library.getState().save()).toBe(true);

    expect(Object.keys(files)).toEqual(['shimmer-tape.cleanpreset.json']);
    expect(presetIn(files, 'shimmer-tape.cleanpreset.json')).toEqual({
      ...shimmer,
      modifiedAt: '2026-10-05T00:00:00.000Z',
      params: { ...shimmer.params, envelopeBalance: 100 },
    });
    expect(library.getState().presets[0]!.preset.params.envelopeBalance).toBe(100);
    expect(workingLabel()).toBe('Shimmer Tape');
  });

  it('asks for a name instead when the Working State has no Preset', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    editor.getState().setParam('envelopeBalance', 100);

    expect(await library.getState().save()).toBe(false);
    expect(files).toEqual({});
    expect(workingLabel()).toBe('Untitled •');
  });
});

describe('Rename', () => {
  it('renames the Preset and its file, keeping its id', async () => {
    const shimmer = preset('Shimmer Tape');
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    await library.getState().recall(shimmer.id);

    await library.getState().rename(shimmer.id, 'Glass Choir');

    expect(Object.keys(files)).toEqual(['glass-choir.cleanpreset.json']);
    expect(presetIn(files, 'glass-choir.cleanpreset.json')).toEqual({
      ...shimmer,
      name: 'Glass Choir',
      modifiedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(library.getState().presets.map((p) => [p.preset.name, p.fileName])).toEqual([
      ['Glass Choir', 'glass-choir.cleanpreset.json'],
    ]);
    expect(workingLabel()).toBe('Glass Choir');
  });

  it('keeps the file name when the name still slugs the same', async () => {
    const shimmer = preset('Shimmer Tape');
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);

    await library.getState().rename(shimmer.id, 'Shimmer tape');

    expect(Object.keys(files)).toEqual(['shimmer-tape.cleanpreset.json']);
    expect(presetIn(files, 'shimmer-tape.cleanpreset.json').name).toBe('Shimmer tape');
  });

  it('keeps a file whose name differs only in case, as on a case-insensitive disk it is the same file', async () => {
    const shimmer = preset('Shimmer Tape');
    const { folder, files } = memoryFolder({ 'Shimmer-Tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);

    await library.getState().rename(shimmer.id, 'Shimmer tape');

    expect(Object.keys(files)).toEqual(['Shimmer-Tape.cleanpreset.json']);
    expect(presetIn(files, 'Shimmer-Tape.cleanpreset.json').name).toBe('Shimmer tape');
  });
});

describe('Duplicate', () => {
  it('writes a copy as a new Preset and leaves the Working State alone', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    await library.getState().recall(shimmer.id);

    await library.getState().duplicate(shimmer.id);

    expect(presetIn(files, 'shimmer-tape-copy.cleanpreset.json')).toEqual({
      ...shimmer,
      id: 'new-1',
      name: 'Shimmer Tape copy',
      createdAt: '2026-10-05T00:00:00.000Z',
      modifiedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['Shimmer Tape', 'Shimmer Tape copy']);
    expect(library.getState().source.presetId).toBe(shimmer.id);
  });
});

describe('Delete', () => {
  it('removes the Preset file; a Working State recalled from it keeps going without a Preset', async () => {
    const shimmer = preset('Shimmer Tape');
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    await library.getState().recall(shimmer.id);

    await library.getState().deletePreset(shimmer.id);

    expect(files).toEqual({});
    expect(library.getState().presets).toEqual([]);
    expect(library.getState().source.presetId).toBeNull();
    expect(workingLabel()).toBe('Shimmer Tape');
    expect(await library.getState().save()).toBe(false);
  });
});

describe('Slots', () => {
  it('stores the Working State linked to the Preset it came from', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);

    expect(await library.getState().storeSlot(9)).toBe(true);

    expect(editor.getState().editor.slotMap[9]).toMatchObject({
      presetId: shimmer.id,
      name: 'Shimmer Tape',
      snapshot: shimmer.params,
    });
  });

  it('stores an Untitled Working State with no link', async () => {
    await setup(memoryFolder().folder);

    await library.getState().storeSlot(9);

    expect(editor.getState().editor.slotMap[9]).toMatchObject({ name: 'Untitled' });
    expect(editor.getState().editor.slotMap[9]).not.toHaveProperty('presetId');
  });

  it('recalling a known Slot makes the Working State belong to its Preset, unmodified', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    await library.getState().newWorkingState();

    library.getState().recallSlot(9);

    expect(library.getState().source).toEqual({ presetId: shimmer.id, name: 'Shimmer Tape', params: shimmer.params });
    expect(isModified(editor.getState().editor.working, library.getState().source)).toBe(false);
    expect(editor.getState().editor.sync).toBe('inSync');
  });

  it('recalling a Slot whose Preset has changed since shows the Working State as modified from it', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    editor.getState().setParam('sensitivity', 99);
    await library.getState().save();

    library.getState().recallSlot(9);

    expect(editor.getState().editor.working.sensitivity).toBe(20);
    expect(library.getState().source).toMatchObject({ presetId: shimmer.id, params: { sensitivity: 99 } });
    expect(isModified(editor.getState().editor.working, library.getState().source)).toBe(true);
  });

  it('recalling an unknown Slot leaves the Working State and its Preset alone', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    const source = library.getState().source;

    library.getState().recallSlot(9);

    expect(library.getState().source).toBe(source);
    expect(editor.getState().editor.sync).toBe('unknown');
  });

  it('a stored Slot outlives its Preset, keeping the name it was stored with', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    await library.getState().deletePreset(shimmer.id);
    await library.getState().newWorkingState();

    library.getState().recallSlot(9);

    expect(editor.getState().editor.working.sensitivity).toBe(20);
    expect(editor.getState().editor.sync).toBe('inSync');
    expect(library.getState().source).toMatchObject({ presetId: null, name: 'Shimmer Tape' });
  });

  it('re-stores a Slot whose Preset changed since: the Preset becomes the Working State and the snapshot', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    editor.getState().setParam('sensitivity', 99);
    await library.getState().save();
    await library.getState().newWorkingState();

    expect(await library.getState().reStoreSlot(9)).toBe(true);

    expect(editor.getState().editor.working.sensitivity).toBe(99);
    expect(editor.getState().editor.slotMap[9]?.snapshot.sensitivity).toBe(99);
    expect(library.getState().source).toMatchObject({ presetId: shimmer.id, name: 'Shimmer Tape' });
    expect(virtualPedal.getSnapshot().log.at(-1)?.text).toBe('CC 111 = 9 → stored in Slot 9');
  });

  it('can’t re-store a Slot whose Preset is gone', async () => {
    const shimmer = preset('Shimmer Tape');
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    await library.getState().deletePreset(shimmer.id);

    await expect(library.getState().reStoreSlot(9)).rejects.toThrow('That Preset is no longer in the Library');
  });
});

describe('the browser storage Library', () => {
  it('keeps Presets like a folder, under its own name', async () => {
    const { folder, files } = memoryFolder({ 'zed.cleanpreset.json': serializePreset(preset('Zed')) });
    library = createLibraryStore(editor, deps(null, folder));

    await library.getState().openBrowserStorage();
    await library.getState().saveAs('Shimmer Tape');

    expect(library.getState()).toMatchObject({ storage: 'browser', folderName: 'Browser storage' });
    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['Shimmer Tape', 'Zed']);
    expect(Object.keys(files)).toContain('shimmer-tape.cleanpreset.json');
  });

  it('a folder Library is a folder', async () => {
    await setup(memoryFolder().folder);
    expect(library.getState().storage).toBe('folder');
  });
});

describe('Export', () => {
  it('hands a Preset to the browser to save as its own Preset file', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) }).folder);

    library.getState().exportPreset(shimmer.id);

    expect(downloads).toEqual([{ fileName: 'shimmer-tape.cleanpreset.json', text: serializePreset(shimmer) }]);
  });

  it('hands every Preset to the browser as one Bundle named after the Library, and counts as a backup', async () => {
    const a = preset('A');
    const b = preset('B');
    await setup(
      memoryFolder({ 'b.cleanpreset.json': serializePreset(b), 'a.cleanpreset.json': serializePreset(a) }).folder,
    );

    library.getState().exportBundle();

    expect(downloads).toEqual([
      {
        fileName: 'my-presets-2026-10-05.cleanbundle.json',
        text: serializeBundle('My Presets', [a, b], '2026-10-05T00:00:00.000Z'),
      },
    ]);
    expect(backupCheckedAt).toBe('2026-10-05T00:00:00.000Z');
    expect(library.getState().backupCheckedAt).toBe('2026-10-05T00:00:00.000Z');
  });
});

/** A file the user picked to import. */
const importFile = (name: string, text: string) => ({ name, text });

describe('Import', () => {
  it('adds the Presets from Preset files and Bundles, keeping their ids, and reports what it could not read', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    const bundle = JSON.parse(serializeBundle('Shared', [preset('A'), preset('B')], '2026-10-01T00:00:00.000Z'));
    delete bundle.presets[1].params.sensitivity;

    await library.getState().importFiles([
      importFile('c.cleanpreset.json', serializePreset(preset('C'))),
      importFile('shared.cleanbundle.json', JSON.stringify(bundle)),
      importFile('notes.json', '{}'),
    ]);

    expect(library.getState().presets.map((p) => [p.preset.name, p.preset.id])).toEqual([
      ['A', 'id-A'],
      ['B', 'id-B'],
      ['C', 'id-C'],
    ]);
    expect(presetIn(files, 'a.cleanpreset.json')).toEqual(preset('A'));
    expect(library.getState().importReport).toEqual({
      added: 3,
      replaced: 0,
      keptBoth: 0,
      skipped: 0,
      problems: ['shared.cleanbundle.json: B: sensitivity missing: set to 77', 'notes.json: Not a Preset or Bundle file'],
    });
    expect(library.getState().conflicts).toEqual([]);
  });

  it('skips a Preset identical to one already in the Library, whatever its dates', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    const { folder, files } = memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);

    await library
      .getState()
      .importFiles([importFile('s.cleanpreset.json', serializePreset({ ...shimmer, modifiedAt: '2026-10-06T00:00:00.000Z' }))]);

    expect(Object.keys(files)).toEqual(['s.cleanpreset.json']);
    expect(library.getState().importReport).toMatchObject({ added: 0, skipped: 1 });
    expect(library.getState().conflicts).toEqual([]);
  });

  it('skips a second Preset with the same id in one import', async () => {
    await setup(memoryFolder().folder);

    await library
      .getState()
      .importFiles([importFile('x.cleanbundle.json', serializeBundle('X', [preset('A', {}, 'same'), preset('B', {}, 'same')], ''))]);

    expect(library.getState().presets.map((p) => p.preset.name)).toEqual(['A']);
    expect(library.getState().importReport?.problems).toEqual(['x.cleanbundle.json: B: same id as A, skipped']);
  });

  it('asks about a different Preset with an id already in the Library, writing nothing until answered', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    const { folder, files } = memoryFolder({ 's.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    const incoming = { ...shimmer, name: 'Glass Choir', params: { ...shimmer.params, sensitivity: 99 } };

    await library.getState().importFiles([importFile('g.cleanpreset.json', serializePreset(incoming))]);

    expect(library.getState().conflicts).toEqual([{ incoming, existing: shimmer }]);
    expect(Object.keys(files)).toEqual(['s.cleanpreset.json']);
  });

  it('Replace writes over the Preset, keeping its id so Slot Map links survive', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    const { folder, files } = memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) });
    await setup(folder);
    await library.getState().recall(shimmer.id);
    await library.getState().storeSlot(9);
    const incoming = { ...shimmer, name: 'Glass Choir', params: { ...shimmer.params, sensitivity: 99 } };
    await library.getState().importFiles([importFile('g.cleanpreset.json', serializePreset(incoming))]);

    await library.getState().resolveConflicts('replace', false);

    expect(Object.keys(files)).toEqual(['glass-choir.cleanpreset.json']);
    expect(presetIn(files, 'glass-choir.cleanpreset.json')).toEqual(incoming);
    expect(library.getState().importReport).toMatchObject({ added: 0, replaced: 1 });
    expect(library.getState().conflicts).toEqual([]);
    // The Working State came from the old version: it now shows as modified from the new one.
    expect(workingLabel()).toBe('Glass Choir •');
    expect(library.getState().presets[0]?.preset.id).toBe(editor.getState().editor.slotMap[9]?.presetId);
  });

  it('adds a Preset deleted while the question waited, whatever the answer', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) }).folder);
    const incoming = { ...shimmer, params: { ...shimmer.params, sensitivity: 99 } };
    await library.getState().importFiles([importFile('s.cleanpreset.json', serializePreset(incoming))]);
    await library.getState().deletePreset(shimmer.id);

    await library.getState().resolveConflicts('replace', false);

    expect(library.getState().presets.map((p) => p.preset)).toEqual([incoming]);
    expect(library.getState().importReport).toMatchObject({ added: 1, replaced: 0 });
  });

  it('Keep Both adds the incoming Preset with a new id', async () => {
    const shimmer = preset('Shimmer Tape', { sensitivity: 20 });
    await setup(memoryFolder({ 'shimmer-tape.cleanpreset.json': serializePreset(shimmer) }).folder);
    const incoming = { ...shimmer, params: { ...shimmer.params, sensitivity: 99 } };
    await library.getState().importFiles([importFile('s.cleanpreset.json', serializePreset(incoming))]);

    await library.getState().resolveConflicts('keepBoth', false);

    expect(library.getState().presets.map((p) => [p.preset.id, p.preset.params.sensitivity, p.fileName])).toEqual([
      [shimmer.id, 20, 'shimmer-tape.cleanpreset.json'],
      ['new-1', 99, 'shimmer-tape-2.cleanpreset.json'],
    ]);
    expect(library.getState().importReport).toMatchObject({ keptBoth: 1 });
  });

  it('answers one conflict at a time, or all that are left at once', async () => {
    const [a, b, c] = ['A', 'B', 'C'].map((name) => preset(name, { sensitivity: 20 }));
    await setup(
      memoryFolder(Object.fromEntries([a, b, c].map((p) => [`${p!.name}.cleanpreset.json`, serializePreset(p!)]))).folder,
    );
    const changed = [a, b, c].map((p) => ({ ...p!, params: { ...p!.params, sensitivity: 99 } }));
    await library.getState().importFiles([importFile('x.cleanbundle.json', serializeBundle('X', changed, ''))]);
    expect(library.getState().conflicts.map((x) => x.incoming.name)).toEqual(['A', 'B', 'C']);

    await library.getState().resolveConflicts('keepBoth', false);
    expect(library.getState().conflicts.map((x) => x.incoming.name)).toEqual(['B', 'C']);
    await library.getState().resolveConflicts('replace', true);

    expect(library.getState().conflicts).toEqual([]);
    expect(library.getState().importReport).toMatchObject({ replaced: 2, keptBoth: 1 });
    expect(library.getState().presets.map((p) => [p.preset.name, p.preset.params.sensitivity])).toEqual([
      ['A', 20],
      ['A', 99],
      ['B', 99],
      ['C', 99],
    ]);
  });

  it('round-trips a whole Library through a Bundle', async () => {
    const presets = [preset('A', { sensitivity: 1 }), preset('B', { attack: 90 })];
    await setup(memoryFolder(Object.fromEntries(presets.map((p) => [`${p.name}.json`, serializePreset(p)]))).folder);
    library.getState().exportBundle();

    await setup(memoryFolder().folder);
    await library.getState().importFiles([importFile('b.cleanbundle.json', downloads[0]!.text)]);

    expect(library.getState().presets.map((p) => p.preset)).toEqual(presets);
    const parsed = parseLibraryFile(downloads[0]!.text);
    expect(parsed.ok && parsed.presets).toEqual(presets);
  });
});

describe('the backup reminder', () => {
  const day = 24 * 60 * 60 * 1000;
  const at = (ms: number) => new Date(Date.UTC(2026, 9, 5) + ms).toISOString();

  it('is due for a browser storage Library with Presets that was never backed up, or not for a while', async () => {
    const { folder } = memoryFolder({ 'a.json': serializePreset(preset('A')) });
    library = createLibraryStore(editor, deps(null, folder));
    await library.getState().openBrowserStorage();

    expect(backupDue(library.getState(), at(0))).toBe(true);
    library.getState().exportBundle();
    const backedUp = Date.parse(library.getState().backupCheckedAt!) - Date.UTC(2026, 9, 5);
    expect(backupDue(library.getState(), at(backedUp + (BACKUP_INTERVAL_DAYS * day - 1)))).toBe(false);
    expect(backupDue(library.getState(), at(backedUp + BACKUP_INTERVAL_DAYS * day))).toBe(true);
  });

  it('"Later" puts it off for the same interval', async () => {
    const { folder } = memoryFolder({ 'a.json': serializePreset(preset('A')) });
    library = createLibraryStore(editor, deps(null, folder));
    await library.getState().openBrowserStorage();

    library.getState().snoozeBackup();

    expect(backupCheckedAt).toBe(library.getState().backupCheckedAt);
    expect(backupDue(library.getState(), library.getState().backupCheckedAt!)).toBe(false);
  });

  it('remembers the last backup across launches', async () => {
    backupCheckedAt = at(0);
    const { folder } = memoryFolder({ 'a.json': serializePreset(preset('A')) });
    library = createLibraryStore(editor, deps(null, folder));
    await library.getState().openBrowserStorage();

    expect(backupDue(library.getState(), at(day))).toBe(false);
  });

  it('is never due for an empty Library or a folder on disk', async () => {
    library = createLibraryStore(editor, deps(null));
    await library.getState().openBrowserStorage();
    expect(backupDue(library.getState(), at(0))).toBe(false);

    await setup(memoryFolder({ 'a.json': serializePreset(preset('A')) }).folder);
    expect(backupDue(library.getState(), at(0))).toBe(false);
  });
});

describe('the Factory Presets', () => {
  it('recall like any Preset, even before a Library is open', async () => {
    library = createLibraryStore(editor, deps(null));

    await library.getState().recall(factoryRight.id);

    expect(editor.getState().editor.working).toEqual(factoryRight.params);
    expect(virtualPedal.getSnapshot().state).toMatchObject({ dynamics: 52, wet: 81, mode: 3 });
    expect(workingLabel()).toBe('Factory Right');
  });

  it('are not files in the Library, and not in its Bundle', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    await library.getState().recall(factoryLeft.id);

    library.getState().exportBundle();

    expect(files).toEqual({});
    expect(library.getState().presets).toEqual([]);
    expect(parseLibraryFile(downloads[0]!.text)).toMatchObject({ ok: true, presets: [] });
  });

  it('can’t be saved over, renamed or deleted', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);
    await library.getState().recall(factoryLeft.id);
    editor.getState().setParam('sensitivity', 10);

    expect(await library.getState().save()).toBe(false);
    await expect(library.getState().rename(factoryLeft.id, 'Mine')).rejects.toThrow('Factory Presets can’t be changed');
    await expect(library.getState().deletePreset(factoryLeft.id)).rejects.toThrow('Factory Presets can’t be changed');
    expect(files).toEqual({});
    expect(FACTORY_PRESETS[0]).toBe(factoryLeft);
    expect(factoryLeft.name).toBe('Factory Left');
  });

  it('duplicate into an editable Preset in the Library', async () => {
    const { folder, files } = memoryFolder();
    await setup(folder);

    await library.getState().duplicate(factoryLeft.id);

    expect(presetIn(files, 'factory-left-copy.cleanpreset.json')).toMatchObject({
      id: 'new-1',
      name: 'Factory Left copy',
      params: factoryLeft.params,
    });
  });

  it('export as their own Preset files', async () => {
    library = createLibraryStore(editor, deps(null));

    library.getState().exportPreset(factoryRight.id);

    expect(downloads).toEqual([{ fileName: 'factory-right.cleanpreset.json', text: serializePreset(factoryRight) }]);
  });

  it('stay linked to a Slot stored from them', async () => {
    await setup(memoryFolder().folder);
    await library.getState().recall(factoryLeft.id);
    await library.getState().storeSlot(9);
    await library.getState().newWorkingState();

    library.getState().recallSlot(9);

    expect(library.getState().source).toEqual({ presetId: factoryLeft.id, name: 'Factory Left', params: factoryLeft.params });
  });

  it('on Import, skip an identical copy and add a changed one as a new Preset', async () => {
    const { folder } = memoryFolder();
    await setup(folder);
    const changed = { ...factoryRight, params: { ...factoryRight.params, dry: 90 } };

    await library.getState().importFiles([
      importFile('factory-left.cleanpreset.json', serializePreset(factoryLeft)),
      importFile('tweaked.cleanpreset.json', serializePreset(changed)),
    ]);

    expect(library.getState().importReport).toEqual({ added: 0, replaced: 0, keptBoth: 1, skipped: 1, problems: [] });
    expect(library.getState().presets.map((p) => [p.preset.id, p.preset.params.dry])).toEqual([['new-1', 90]]);
    expect(library.getState().conflicts).toEqual([]);
  });
});

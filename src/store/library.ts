import { create } from 'zustand';
import type { PresetParamId } from '../midi/map';
import {
  BUNDLE_EXTENSION,
  PRESET_EXTENSION,
  parseLibraryFile,
  parsePreset,
  presetName,
  serializeBundle,
  serializePreset,
  type Preset,
} from '../model/schema';
import { isChangedSinceStored, slotName, type SlotMap, type SlotMapEntry } from '../model/slotMap';
import { defaultWorkingState, type WorkingState } from '../model/state';
import { useEditorStore, type createEditorStore } from './editorStore';

// The Library: Presets kept as real files in a folder the user picks, or in browser storage where the browser
// can't open a folder (SPEC.md §5.6). Library file operations are written at once and never undoable (SPEC.md §5.9).

/**
 * A folder of files. The browser's File System Access API in the app, or IndexedDB where there is none; in
 * memory in tests.
 */
export type LibraryFolder = {
  name: string;
  list(): Promise<string[]>;
  read(fileName: string): Promise<string>;
  write(fileName: string, text: string): Promise<void>;
  remove(fileName: string): Promise<void>;
};

/**
 * A folder the user picked, which the browser hands back at a later launch once the user allows it again: a
 * FileSystemDirectoryHandle in the app.
 */
export type PickedFolder = LibraryFolder & {
  /** Whether the browser lets the app use the folder now, without asking. */
  queryPermission(): Promise<PermissionState>;
  /** Asks the user to let the app use the folder. Only works in a click. */
  requestPermission(): Promise<PermissionState>;
};

/**
 * A remembered folder that isn't open: being read at launch, waiting for a click to allow it again, or deleted
 * since it was picked (and so forgotten).
 */
export type RememberedFolder = { name: string; status: 'opening' | 'needsPermission' | 'gone' };

/** A Preset and the file that holds it. */
export type LibraryEntry = { preset: Preset; fileName: string };

/** Where the Library is kept: a folder on disk, or the browser's own storage. */
export type LibraryStorage = 'folder' | 'browser';

export type LibraryDeps = {
  /** Asks the user for a folder; null if they cancel. */
  pickFolder(): Promise<PickedFolder | null>;
  /** The folder last picked, kept across launches. */
  rememberedFolder: {
    load(): Promise<PickedFolder | null>;
    save(folder: PickedFolder): Promise<void>;
    clear(): Promise<void>;
  };
  /** The Library kept in the browser's own storage, for browsers that can't open a folder. */
  openBrowserStorage(): Promise<LibraryFolder>;
  /** The current time as an ISO string. */
  now(): string;
  /** A fresh Preset id (UUID). */
  newId(): string;
  /** Hands a file to the browser to save (Export). */
  download(fileName: string, text: string): void;
  /** When the user last backed up the Library or chose "Later": an ISO string, kept across launches. */
  backupLog: { load(): string | null; save(at: string): void };
};

/** A Preset being imported whose id is already in the Library, with different contents. */
export type ImportConflict = { incoming: Preset; existing: Preset };

/** How Import is going. A Preset whose id is already in the Library with the same contents is skipped. */
export type ImportReport = { added: number; replaced: number; keptBoth: number; skipped: number; problems: string[] };

/** A file the user picked to import. */
export type ImportFile = { name: string; text: string };

/** Replace keeps the Library's id, so Slot Map links survive; Keep Both gives the incoming Preset a new one. */
export type ConflictChoice = 'replace' | 'keepBoth';

/** The browser storage Library's name, where a folder Library shows the folder's. */
export const BROWSER_STORAGE_NAME = 'Browser storage';

/** A browser storage Library asks to be backed up again this many days after its last backup (or "Later"). */
export const BACKUP_INTERVAL_DAYS = 7;

/**
 * Whether to remind the user to back up: only a browser storage Library, which a cleared browser loses, and only
 * one with Presets in it.
 */
export function backupDue(
  library: { storage: LibraryStorage | null; presets: LibraryEntry[]; backupCheckedAt: string | null },
  now: string,
): boolean {
  if (library.storage !== 'browser' || library.presets.length === 0) return false;
  if (!library.backupCheckedAt) return true;
  return Date.parse(now) - Date.parse(library.backupCheckedAt) >= BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
}

const EMPTY_IMPORT_REPORT: ImportReport = { added: 0, replaced: 0, keptBoth: 0, skipped: 0, problems: [] };

/** Same name, notes and params: Import skips it. Dates don't count, so a re-exported Preset is still identical. */
const sameContents = (a: Preset, b: Preset) =>
  a.name === b.name &&
  a.notes === b.notes &&
  (Object.keys(a.params) as PresetParamId[]).every((id) => a.params[id] === b.params[id]);

/**
 * What the Working State was recalled from or last saved as. `presetId` is null for a Working State that
 * has no Preset (at launch, after New, or once its Preset is deleted).
 */
export type WorkingSource = { presetId: string | null; name: string; params: WorkingState };

/** The name a Working State with no Preset shows. */
export const UNTITLED = 'Untitled';

/** Whether the Working State has been edited since it was recalled or saved: shown as "•". */
export function isModified(working: WorkingState, source: WorkingSource): boolean {
  return (Object.keys(source.params) as PresetParamId[]).some((id) => working[id] !== source.params[id]);
}

/** Explains the "•" after the Working State's name. */
export const MODIFIED_HELP = 'Edited since it was recalled or saved';

/** A Working State that belongs to this Preset. */
const sourceOf = (preset: Preset): WorkingSource => ({ presetId: preset.id, name: preset.name, params: preset.params });

type LibraryStore = {
  storage: LibraryStorage | null;
  /** The folder's name, or "Browser storage". */
  folderName: string | null;
  /** The folder picked at an earlier launch, while it isn't open. */
  remembered: RememberedFolder | null;
  /** The folder's Presets, by name. */
  presets: LibraryEntry[];
  /** Files skipped or changed on load, one line each. */
  problems: string[];
  source: WorkingSource;
  /** When the user last backed up the Library or chose "Later". */
  backupCheckedAt: string | null;
  /** The last Import's outcome, until dismissed. */
  importReport: ImportReport | null;
  /** Imported Presets waiting for Replace or Keep Both, oldest first. */
  conflicts: ImportConflict[];
  /** Asks the user for a folder, opens it and remembers it for the next launch. */
  pickFolder(): Promise<void>;
  /** At launch: opens the folder picked at an earlier launch if the browser still allows it, without asking. */
  openRememberedFolder(): Promise<void>;
  /** Asks the user to allow the remembered folder again (in a click), then opens it. */
  reopenFolder(): Promise<void>;
  /** Opens the Library kept in browser storage, for browsers that can't open a folder. */
  openBrowserStorage(): Promise<void>;
  /** Hands a Preset to the browser to save as a Preset file. */
  exportPreset(id: string): void;
  /** Hands every Preset to the browser to save as one Bundle. This is the Library's backup. */
  exportBundle(): void;
  /** Puts off the backup reminder. */
  snoozeBackup(): void;
  /**
   * Adds the Presets in Preset and Bundle files, keeping their ids. One already in the Library is skipped if
   * identical, otherwise it waits in `conflicts` for `resolveConflicts`.
   */
  importFiles(files: ImportFile[]): Promise<void>;
  /** Answers the first waiting conflict, or with `applyToAll` every one left. */
  resolveConflicts(choice: ConflictChoice, applyToAll: boolean): Promise<void>;
  dismissImportReport(): void;
  /** Writes the Working State as a new Preset, which the Working State then belongs to. */
  saveAs(name: string): Promise<void>;
  /** Makes a Preset the Working State and sends it. */
  recall(id: string): Promise<void>;
  /** Starts an Untitled Working State from the defaults and sends it. Nothing is written until it is saved. */
  newWorkingState(): Promise<void>;
  /**
   * Writes the Working State back to its Preset. Resolves false, writing nothing, if it has no Preset yet: Save As instead.
   */
  save(): Promise<boolean>;
  /** Renames a Preset and, where the name slugs differently, its file. Its id is kept. */
  rename(id: string, name: string): Promise<void>;
  /** Writes a copy of a Preset as a new Preset. */
  duplicate(id: string): Promise<void>;
  /**
   * Deletes a Preset's file. The File System Access API has no trash, so this is permanent: the UI confirms
   * first (SPEC.md §5.6).
   */
  deletePreset(id: string): Promise<void>;
  /**
   * Stores the Working State in a Slot (Send All, then CC 111), linked to its Preset if it has one. The UI confirms
   * first. Resolves like the editor's `storeSlot`.
   */
  storeSlot(slot: number): Promise<boolean>;
  /**
   * Recalls a Slot. One the Slot Map knows makes the Working State its snapshot, belonging to its Preset if still
   * here; if that Preset has changed since, the Working State shows as modified from it.
   */
  recallSlot(slot: number): void;
  /**
   * Stores a Slot's linked Preset again, as it is now; the Preset becomes the Working State. One click: the UI
   * confirms only when that would discard unsaved edits.
   */
  reStoreSlot(slot: number): Promise<boolean>;
};

type EditorStoreApi = ReturnType<typeof createEditorStore>;

/**
 * Only JSON files are read, so the scan never opens audio or other large files in the folder; each file's
 * `format` then decides whether it is a Preset.
 */
const isJson = (fileName: string) => fileName.toLowerCase().endsWith('.json');

/** "Shimmer Tape" → `shimmer-tape`. */
const slugOf = (name: string, fallback: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || fallback;

/** `shimmer-tape.b82preset.json` for "Shimmer Tape", then `-2`, `-3`… if a file already has that name. */
function presetFileName(name: string, taken: string[]): string {
  const slug = slugOf(name, 'preset');
  const used = new Set(taken.map((t) => t.toLowerCase()));
  for (let n = 1; ; n++) {
    const fileName = `${slug}${n > 1 ? `-${n}` : ''}${PRESET_EXTENSION}`;
    if (!used.has(fileName)) return fileName;
  }
}

const byName = (a: LibraryEntry, b: LibraryEntry) => a.preset.name.localeCompare(b.preset.name);

async function readFolder(folder: LibraryFolder) {
  const presets: LibraryEntry[] = [];
  const problems: string[] = [];
  for (const fileName of (await folder.list()).filter(isJson).sort()) {
    const result = parsePreset(await folder.read(fileName));
    if (!result.ok) {
      problems.push(`${fileName}: ${result.error}`);
      continue;
    }
    const twin = presets.find((p) => p.preset.id === result.preset.id);
    if (twin) {
      problems.push(`${fileName}: same id as ${twin.fileName}, skipped`);
      continue;
    }
    problems.push(...result.warnings.map((w) => `${fileName}: ${w}`));
    presets.push({ preset: result.preset, fileName });
  }
  return { presets: presets.sort(byName), problems };
}

/** Whether there is a Library to save to, or one a click can reopen. */
export function libraryReachable(library: { folderName: string | null; remembered: RememberedFolder | null }): boolean {
  return library.folderName !== null || (library.remembered !== null && library.remembered.status !== 'gone');
}

/** What the Library shows for a remembered folder that has gone. */
export const goneMessage = (name: string) => `Couldn’t find the folder ‘${name}’. Choose it again.`;

const isNotFound = (e: unknown) => e instanceof DOMException && e.name === 'NotFoundError';

export function createLibraryStore(editor: EditorStoreApi, deps: LibraryDeps) {
  let folder: LibraryFolder | null = null;
  /** The folder picked at an earlier launch, until it opens or is found gone. */
  let unopened: PickedFolder | null = null;
  /** Opening the remembered folder at launch. */
  let launching: Promise<void> | undefined;
  /** Counts opens, so a folder that finishes reading after a later one started doesn't replace it. */
  let opens = 0;
  const validName = (input: string) => {
    const name = presetName(input);
    if (!name) throw new Error('A Preset needs a name');
    return name;
  };

  return create<LibraryStore>((set, get) => {
    /**
     * The open Library, opening a remembered folder first: one that needs the user's permission asks in the same
     * click, so a Library action never fails just because the app was relaunched.
     */
    const openFolder = async () => {
      // A launch that failed has said so already; the remembered folder, if kept, is tried again below.
      await launching?.catch(() => {});
      if (!folder && unopened) {
        const { name } = unopened;
        await openRemembered(unopened, true);
        if (get().remembered?.status === 'gone') throw new Error(goneMessage(name));
        if (!folder) throw new Error(`Access to the folder ‘${name}’ wasn’t allowed`);
      }
      if (!folder) throw new Error('Pick a Library folder first');
      return folder;
    };
    /** Writes a Preset into a new file and adds it to the list. */
    const addFile = async (preset: Preset) => {
      const target = await openFolder();
      const fileName = presetFileName(preset.name, await target.list());
      await target.write(fileName, serializePreset(preset));
      set({ presets: [...get().presets, { preset, fileName }].sort(byName) });
    };

    /** Writes a changed Preset over its file, or into a new one, and updates the list. */
    const rewrite = async (old: LibraryEntry, preset: Preset, fileName = old.fileName) => {
      const target = await openFolder();
      await target.write(fileName, serializePreset(preset));
      if (fileName !== old.fileName) await target.remove(old.fileName);
      set({
        presets: get()
          .presets.map((p) => (p === old ? { preset, fileName } : p))
          .sort(byName),
      });
    };
    /** Writes a Preset over `old`, renaming the file with it as Rename does. */
    const replace = async (old: LibraryEntry, preset: Preset) => {
      let fileName = presetFileName(
        preset.name,
        (await (await openFolder()).list()).filter((f) => f !== old.fileName),
      );
      // On a case-insensitive disk (Windows, macOS) these are one file: writing one, then removing the other, loses it.
      if (fileName === old.fileName.toLowerCase()) fileName = old.fileName;
      await rewrite(old, preset, fileName);
    };
    /** A Preset in the Library folder, to change. */
    const entry = (id: string) => {
      const found = get().presets.find((p) => p.preset.id === id);
      if (!found) throw new Error('That Preset is no longer in the Library');
      return found;
    };
    const open = async (opened: LibraryFolder, storage: LibraryStorage) => {
      const turn = ++opens;
      const contents = await readFolder(opened);
      if (turn !== opens) return;
      folder = opened;
      unopened = null;
      const folderName = storage === 'browser' ? BROWSER_STORAGE_NAME : opened.name;
      set({ storage, folderName, remembered: null, importReport: null, conflicts: [], ...contents });
    };
    /** Opens the remembered folder if the browser allows it, asking the user first if `ask`. */
    const openRemembered = async (picked: PickedFolder, ask: boolean) => {
      const { name } = picked;
      try {
        const permission = await (ask ? picked.requestPermission() : picked.queryPermission());
        // A folder picked meanwhile replaces this one.
        if (unopened !== picked) return;
        if (permission !== 'granted') {
          set({ remembered: { name, status: 'needsPermission' } });
          return;
        }
        set({ remembered: { name, status: 'opening' } });
        await open(picked, 'folder');
      } catch (e) {
        if (!isNotFound(e)) {
          set({ remembered: { name, status: 'needsPermission' } });
          throw e;
        }
        if (unopened !== picked) return;
        unopened = null;
        set({ remembered: { name, status: 'gone' } });
        await deps.rememberedFolder.clear();
      }
    };
    const recordBackupCheck = () => {
      const at = deps.now();
      deps.backupLog.save(at);
      set({ backupCheckedAt: at });
      return at;
    };
    const updateReport = (change: Partial<Record<Exclude<keyof ImportReport, 'problems'>, number>>) => {
      const report = get().importReport ?? EMPTY_IMPORT_REPORT;
      const next = { ...report };
      for (const [key, n] of Object.entries(change) as [keyof typeof change, number][]) next[key] += n;
      set({ importReport: next });
    };
    const resolve = async ({ incoming, existing }: ImportConflict, choice: ConflictChoice) => {
      const old = get().presets.find((p) => p.preset.id === existing.id);
      if (!old) {
        // Deleted while the question waited: nothing left to replace or keep both of.
        await addFile(incoming);
        updateReport({ added: 1 });
        return;
      }
      if (choice === 'keepBoth') {
        await addFile({ ...incoming, id: deps.newId() });
        updateReport({ keptBoth: 1 });
        return;
      }
      await replace(old, incoming);
      // Compared against the Preset as it is now, as after a Slot recall.
      if (get().source.presetId === incoming.id) set({ source: sourceOf(incoming) });
      updateReport({ replaced: 1 });
    };

    return {
      storage: null,
      folderName: null,
      remembered: null,
      presets: [],
      problems: [],
      source: { presetId: null, name: UNTITLED, params: editor.getState().editor.working },
      backupCheckedAt: deps.backupLog.load(),
      importReport: null,
      conflicts: [],
      async pickFolder() {
        const picked = await deps.pickFolder();
        if (!picked) return;
        unopened = null;
        await open(picked, 'folder');
        await deps.rememberedFolder.save(picked);
      },
      openRememberedFolder() {
        launching = (async () => {
          const picked = await deps.rememberedFolder.load();
          if (!picked || folder) return;
          unopened = picked;
          set({ remembered: { name: picked.name, status: 'opening' } });
          await openRemembered(picked, false);
        })();
        return launching;
      },
      async reopenFolder() {
        if (unopened) await openRemembered(unopened, true);
      },
      async openBrowserStorage() {
        await open(await deps.openBrowserStorage(), 'browser');
      },
      exportPreset(id) {
        const preset = entry(id).preset;
        deps.download(presetFileName(preset.name, []), serializePreset(preset));
      },
      exportBundle() {
        const name = get().folderName ?? 'Library';
        const at = recordBackupCheck();
        const presets = get().presets.map((p) => p.preset);
        deps.download(`${slugOf(name, 'library')}-${at.slice(0, 10)}${BUNDLE_EXTENSION}`, serializeBundle(name, presets, at));
      },
      snoozeBackup() {
        recordBackupCheck();
      },
      async importFiles(files) {
        await openFolder();
        set({ importReport: EMPTY_IMPORT_REPORT });
        const problems: string[] = [];
        /** Each Preset read so far in this import, by id. */
        const seen = new Map<string, Preset>();
        const conflicts: ImportConflict[] = [];
        for (const file of files) {
          const result = parseLibraryFile(file.text);
          if (!result.ok) {
            problems.push(`${file.name}: ${result.error}`);
            continue;
          }
          problems.push(...result.problems.map((p) => `${file.name}: ${p}`));
          for (const preset of result.presets) {
            const twin = seen.get(preset.id);
            if (twin) {
              problems.push(`${file.name}: ${preset.name}: same id as ${twin.name}, skipped`);
              continue;
            }
            seen.set(preset.id, preset);
            const existing = get().presets.find((p) => p.preset.id === preset.id)?.preset;
            if (!existing) {
              await addFile(preset);
              updateReport({ added: 1 });
            } else if (sameContents(existing, preset)) updateReport({ skipped: 1 });
            else conflicts.push({ incoming: preset, existing });
          }
        }
        set({ importReport: { ...get().importReport!, problems }, conflicts: [...get().conflicts, ...conflicts] });
      },
      async resolveConflicts(choice, applyToAll) {
        const [first, ...rest] = get().conflicts;
        if (!first) return;
        const answering = applyToAll ? [first, ...rest] : [first];
        set({ conflicts: applyToAll ? [] : rest });
        for (const conflict of answering) await resolve(conflict, choice);
      },
      dismissImportReport() {
        set({ importReport: null });
      },
      async saveAs(input) {
        const name = validName(input);
        const now = deps.now();
        const params = editor.getState().editor.working;
        const preset: Preset = { id: deps.newId(), name, notes: '', createdAt: now, modifiedAt: now, params };
        await addFile(preset);
        set({ source: sourceOf(preset) });
      },
      async recall(id) {
        const preset = entry(id).preset;
        set({ source: sourceOf(preset) });
        await editor.getState().loadWorking(preset.params);
      },
      async newWorkingState() {
        const params = defaultWorkingState();
        set({ source: { presetId: null, name: UNTITLED, params } });
        await editor.getState().loadWorking(params);
      },
      async save() {
        await openFolder();
        const { presetId } = get().source;
        const old = get().presets.find((p) => p.preset.id === presetId);
        if (!old) return false;
        const params = editor.getState().editor.working;
        await rewrite(old, { ...old.preset, params, modifiedAt: deps.now() });
        set({ source: { ...get().source, params } });
        return true;
      },
      async rename(id, input) {
        const name = validName(input);
        const old = entry(id);
        await replace(old, { ...old.preset, name, modifiedAt: deps.now() });
        if (get().source.presetId === id) set({ source: { ...get().source, name } });
      },
      async duplicate(id) {
        const preset = entry(id).preset;
        const now = deps.now();
        const name = presetName(`${preset.name} copy`) ?? preset.name;
        await addFile({ ...preset, id: deps.newId(), name, createdAt: now, modifiedAt: now });
      },
      async deletePreset(id) {
        const old = entry(id);
        await (await openFolder()).remove(old.fileName);
        set({ presets: get().presets.filter((p) => p !== old) });
        if (get().source.presetId === id) set({ source: { ...get().source, presetId: null } });
      },
      storeSlot(slot) {
        const { presetId, name } = get().source;
        return editor.getState().storeSlot(slot, { presetId, name });
      },
      recallSlot(slot) {
        editor.getState().recallSlot(slot);
        const info = slotInfo(editor.getState().editor.slotMap, get().presets, slot);
        if (!info) return;
        // Compared against the Preset as it is now, so Save can't quietly put back the older snapshot.
        const params = info.preset?.params ?? info.entry.snapshot;
        set({ source: { presetId: info.preset?.id ?? null, name: info.name, params } });
      },
      async reStoreSlot(slot) {
        const presetId = editor.getState().editor.slotMap[slot]?.presetId;
        if (!presetId) throw new Error('That Slot has no Preset to re-store');
        const preset = entry(presetId).preset;
        set({ source: sourceOf(preset) });
        return editor.getState().storeSlot(slot, { presetId, name: preset.name }, preset.params);
      },
    };
  });
}

/** The browser lets the user pick a folder (File System Access API: Chrome, Edge). Otherwise the Library is kept in IndexedDB. */
export const folderAccessAvailable = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** The folders the user picked, as the browser keeps them, so they can be remembered. */
const directories = new WeakMap<PickedFolder, FileSystemDirectoryHandle>();

/** A folder on disk, through the File System Access API. */
export function directoryFolder(dir: FileSystemDirectoryHandle): PickedFolder {
  const folder: PickedFolder = {
    name: dir.name,
    queryPermission: () => dir.queryPermission({ mode: 'readwrite' }),
    requestPermission: () => dir.requestPermission({ mode: 'readwrite' }),
    async list() {
      const names: string[] = [];
      for await (const handle of dir.values()) if (handle.kind === 'file') names.push(handle.name);
      return names;
    },
    async read(fileName) {
      return (await (await dir.getFileHandle(fileName)).getFile()).text();
    },
    async write(fileName, text) {
      const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    },
    async remove(fileName) {
      await dir.removeEntry(fileName);
    },
  };
  directories.set(folder, dir);
  return folder;
}

async function pickDirectory(): Promise<PickedFolder | null> {
  try {
    return directoryFolder(await window.showDirectoryPicker({ id: 'brothers-82-library', mode: 'readwrite' }));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

const LIBRARY_DB = 'brothers-82-library';
/** The browser storage Library's Preset files. */
const FILES_STORE = 'files';
/** The remembered Library folder. */
const FOLDER_STORE = 'folder';
const FOLDER_KEY = 'library';

/** Version 2 adds the remembered folder's store. */
function openLibraryDb() {
  const open = indexedDB.open(LIBRARY_DB, 2);
  open.onupgradeneeded = () => {
    for (const store of [FILES_STORE, FOLDER_STORE])
      if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store);
  };
  return settle(open);
}

/** Runs one IndexedDB request in its own transaction. */
async function inStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const tx = db.transaction(storeName, mode);
  const result = await settle(request(tx.objectStore(storeName)));
  // A write only counts once its transaction has committed.
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  return result;
}

function settle<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The Library in the browser's IndexedDB, for browsers without the File System Access API: the same Preset files,
 * keyed by file name, so everything else treats it as a folder. Clearing the browser's site data loses it.
 */
export async function indexedDbFolder(): Promise<LibraryFolder> {
  const db = await openLibraryDb();
  const inFiles = <T>(mode: IDBTransactionMode, request: (files: IDBObjectStore) => IDBRequest<T>) =>
    inStore(db, FILES_STORE, mode, request);
  return {
    name: BROWSER_STORAGE_NAME,
    async list() {
      return (await inFiles('readonly', (files) => files.getAllKeys())).map(String);
    },
    async read(fileName) {
      const text = await inFiles('readonly', (files) => files.get(fileName));
      if (typeof text !== 'string') throw new Error(`${fileName} is no longer in the Library`);
      return text;
    },
    async write(fileName, text) {
      await inFiles('readwrite', (files) => files.put(text, fileName));
    },
    async remove(fileName) {
      await inFiles('readwrite', (files) => files.delete(fileName));
    },
  };
}

/** Saves a file through the browser's usual download. */
function downloadFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked later, as some browsers start the download only after `click` returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The remembered folder's handle in IndexedDB, which the browser can store and hand back. Any failure only means the
 * folder is picked again next launch.
 */
const indexedDbRememberedFolder: LibraryDeps['rememberedFolder'] = {
  async load() {
    const dir = await inFolderStore('readonly', (s) => s.get(FOLDER_KEY));
    return dir instanceof FileSystemDirectoryHandle ? directoryFolder(dir) : null;
  },
  async save(folder) {
    // Only a folder from the picker (or loaded here) has a handle the browser can keep.
    const dir = directories.get(folder);
    if (dir) await inFolderStore('readwrite', (s) => s.put(dir, FOLDER_KEY));
  },
  async clear() {
    await inFolderStore('readwrite', (s) => s.delete(FOLDER_KEY));
  },
};

/** Runs one request on the remembered folder's store; any failure resolves undefined. */
async function inFolderStore(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  try {
    return await inStore(await openLibraryDb(), FOLDER_STORE, mode, request);
  } catch {
    return undefined;
  }
}

const BACKUP_KEY = 'brothers-82-library-backup-checked-at';

/** Kept in localStorage; any failure (a private window, blocked storage) only means the reminder shows again. */
const localBackupLog: LibraryDeps['backupLog'] = {
  load() {
    try {
      return localStorage.getItem(BACKUP_KEY);
    } catch {
      return null;
    }
  },
  save(at) {
    try {
      localStorage.setItem(BACKUP_KEY, at);
    } catch {
      // Nothing to do: see above.
    }
  },
};

export const useLibraryStore = createLibraryStore(useEditorStore, {
  pickFolder: pickDirectory,
  openBrowserStorage: indexedDbFolder,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
  download: downloadFile,
  backupLog: localBackupLog,
  rememberedFolder: indexedDbRememberedFolder,
});

// Without folder access the Library is always the browser's own, so it opens with the app. With it, the folder picked
// at an earlier launch opens alongside the first render, never holding it up.
if (typeof indexedDB !== 'undefined') {
  const library = useLibraryStore.getState();
  (folderAccessAvailable ? library.openRememberedFolder() : library.openBrowserStorage()).catch((e: unknown) =>
    useLibraryStore.setState({
      problems: [`${folderAccessAvailable ? 'Library folder' : BROWSER_STORAGE_NAME}: ${String(e)}`],
    }),
  );
}

/** Whether the app's Working State has been edited since it was recalled or saved. */
export function useWorkingStateModified(): boolean {
  const source = useLibraryStore((s) => s.source);
  return useEditorStore((s) => isModified(s.editor.working, source));
}

/** What the Slot Map says a Slot holds, named and checked against its linked Preset. */
export type SlotInfo = {
  entry: SlotMapEntry;
  name: string;
  /** The linked Preset, while it is still in the Library. */
  preset: Preset | undefined;
  /** The linked Preset's params have changed since the Slot was stored: offer a re-store. */
  changed: boolean;
};

/** The Slot Map entry for `slot` with its Library details; undefined for a Slot the editor knows nothing about. */
export function slotInfo(slotMap: SlotMap, presets: LibraryEntry[], slot: number): SlotInfo | undefined {
  const entry = slotMap[slot];
  if (!entry) return undefined;
  const preset = presets.find((p) => p.preset.id === entry.presetId)?.preset;
  return { entry, name: slotName(entry, preset), preset, changed: isChangedSinceStored(entry, preset) };
}

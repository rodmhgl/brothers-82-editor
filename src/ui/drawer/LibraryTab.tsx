import { useEffect, useRef, useState } from 'react';
import { MAX_NAME_LENGTH } from '../../model/schema';
import { toggleSummary } from '../../model/summary';
import {
  MODIFIED_HELP,
  backupDue,
  folderAccessAvailable,
  goneMessage,
  libraryReachable,
  useLibraryStore,
  useWorkingStateModified,
  type ConflictChoice,
  type ImportFile,
  type LibraryEntry,
} from '../../store/library';
import { useLayoutStore } from '../../store/layoutStore';
import { useArmedConfirm } from '../useArmedConfirm';
import { commandKeys } from '../useShortcuts';

type Editing = { kind: 'saveAs' } | { kind: 'rename'; id: string } | null;

/**
 * The Library (a folder, or browser storage), the Working State's file actions and its Presets (SPEC.md §5.6).
 * Every action here is written at once and can't be undone.
 */
export function LibraryTab() {
  const {
    storage,
    folderName,
    remembered,
    presets,
    problems,
    source,
    pickFolder,
    reopenFolder,
    newWorkingState,
    save,
    saveAs,
    rename,
    duplicate,
    deletePreset,
    recall,
    exportPreset,
    exportBundle,
    importFiles,
  } = useLibraryStore();
  const modified = useWorkingStateModified();
  // A remembered folder still to open counts: the action opens it first.
  const reachable = libraryReachable({ folderName, remembered });
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  /** Runs a file action, showing what went wrong instead of failing silently. Resolves whether it worked. */
  const runFileAction = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  const closeIfDone = (ok: boolean) => ok && setEditing(null);
  const saveWorking = () =>
    runFileAction(async () => {
      if (!(await save())) setEditing({ kind: 'saveAs' });
    });

  // ⌘S that needed the user: a Working State with no Preset yet, or a save that failed.
  const libraryRequest = useLayoutStore((s) => s.libraryRequest);
  useEffect(() => {
    if (!libraryRequest) return;
    useLayoutStore.getState().clearLibraryRequest();
    if (libraryRequest.kind === 'saveAs') setEditing({ kind: 'saveAs' });
    else setError(libraryRequest.message);
  }, [libraryRequest]);
  // A remembered folder is reopened first: the browser only asks for permission in the click itself, not once the
  // file chooser has closed.
  const chooseImportFiles = async () => {
    if (remembered?.status === 'needsPermission' && !(await runFileAction(reopenFolder))) return;
    if (useLibraryStore.getState().remembered?.status === 'needsPermission') return;
    importInput.current?.click();
  };
  const importPicked = (files: FileList | null) => {
    const picked = [...(files ?? [])];
    if (importInput.current) importInput.current.value = '';
    if (picked.length === 0) return;
    void runFileAction(async () => {
      const read: ImportFile[] = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
      await importFiles(read);
    });
  };

  return (
    <div className="library-tab">
      <section className="slot-card" aria-label="Working State">
        <div className="slot-card-reach">Working State</div>
        <div className="slot-card-name">
          {source.name}
          {modified && (
            <span className="modified-marker" title={MODIFIED_HELP}>
              {' '}
              •
            </span>
          )}
        </div>
        <div className="slot-card-actions">
          <button type="button" className="outline-button" onClick={() => runFileAction(newWorkingState)}>
            New
          </button>
          <button
            type="button"
            className="solid-button"
            disabled={!reachable}
            aria-keyshortcuts={commandKeys('S').aria}
            title={`Shortcut: ${commandKeys('S').label}`}
            onClick={saveWorking}
          >
            Save
          </button>
          <button
            type="button"
            className="outline-button"
            disabled={!reachable}
            onClick={() => setEditing({ kind: 'saveAs' })}
          >
            Save As…
          </button>
        </div>
        {editing?.kind === 'saveAs' && (
          <NameForm
            label="Save As"
            initial={source.name}
            onCancel={() => setEditing(null)}
            onSubmit={(name) => runFileAction(() => saveAs(name)).then(closeIfDone)}
          />
        )}
      </section>

      {storage === 'browser' ? (
        <div className="library-folder">
          <span title="Clearing this site’s data in the browser deletes it. Export a Bundle to keep a copy.">
            Browser storage · kept in this browser only
          </span>
        </div>
      ) : remembered?.status === 'opening' ? (
        <div className="library-folder" role="status">
          <span>Opening {remembered.name}…</span>
        </div>
      ) : (
        <div className="library-folder">
          <span>
            {folderName
              ? `Folder · ${folderName}`
              : remembered?.status === 'needsPermission'
                ? `Folder · ${remembered.name}`
                : remembered?.status === 'gone'
                  ? goneMessage(remembered.name)
                  : 'No Library folder yet'}
          </span>
          {remembered?.status === 'needsPermission' && (
            <button
              type="button"
              className="solid-button"
              title="The browser asks again after a restart before the editor can use the folder."
              onClick={() => runFileAction(reopenFolder)}
            >
              Reopen
            </button>
          )}
          {folderAccessAvailable && (
            <button type="button" className="outline-button" onClick={() => runFileAction(pickFolder)}>
              {reachable ? 'Change folder…' : 'Choose folder…'}
            </button>
          )}
        </div>
      )}

      <BackupReminder />

      {reachable && (
        <div className="library-exchange">
          <button type="button" className="outline-button" onClick={chooseImportFiles}>
            Import…
          </button>
          <input
            ref={importInput}
            type="file"
            multiple
            hidden
            aria-label="Import Preset or Bundle files"
            onChange={(e) => importPicked(e.target.files)}
          />
          <button
            type="button"
            className="outline-button"
            disabled={presets.length === 0}
            title="Saves every Preset in the Library as one Bundle file."
            onClick={exportBundle}
          >
            Export Bundle
          </button>
        </div>
      )}

      <ImportConflictPrompt />
      <ImportReportView />

      {error && (
        <p className="library-error" role="alert">
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <details className="library-problems">
          <summary>
            {problems.length} file {problems.length === 1 ? 'problem' : 'problems'}
          </summary>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}

      {folderName && (
        <ul className="preset-list" aria-label="Presets">
          {presets.length === 0 && (
            <li className="preset-empty">No Presets in {storage === 'browser' ? 'this Library' : 'this folder'} yet.</li>
          )}
          {presets.map((entry) => (
            <PresetRow
              key={entry.preset.id}
              entry={entry}
              current={entry.preset.id === source.presetId}
              browser={storage === 'browser'}
              renaming={editing?.kind === 'rename' && editing.id === entry.preset.id}
              onRecall={() => runFileAction(() => recall(entry.preset.id))}
              onRename={() => setEditing({ kind: 'rename', id: entry.preset.id })}
              onRenamed={(name) => runFileAction(() => rename(entry.preset.id, name)).then(closeIfDone)}
              onCancelRename={() => setEditing(null)}
              onDuplicate={() => runFileAction(() => duplicate(entry.preset.id))}
              onExport={() => exportPreset(entry.preset.id)}
              onDelete={() => runFileAction(() => deletePreset(entry.preset.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PresetRow(props: {
  entry: LibraryEntry;
  current: boolean;
  /** Kept in browser storage, which has no file names to show. */
  browser: boolean;
  renaming: boolean;
  onRecall(): void;
  onRename(): void;
  onRenamed(name: string): void;
  onCancelRename(): void;
  onDuplicate(): void;
  onExport(): void;
  onDelete(): void;
}) {
  const { preset, fileName } = props.entry;
  const { browser } = props;
  const { armed, click: clickDelete } = useArmedConfirm(props.onDelete);

  if (props.renaming) {
    return (
      <li className="preset-row">
        <NameForm
          label={`Rename ${preset.name}`}
          initial={preset.name}
          onSubmit={props.onRenamed}
          onCancel={props.onCancelRename}
        />
      </li>
    );
  }

  return (
    <li className={`preset-row${props.current ? ' is-active' : ''}`} aria-current={props.current ? 'true' : undefined}>
      <div className="preset-main">
        <button
          type="button"
          className="preset-name"
          aria-label={`Recall ${preset.name}`}
          title={`Makes ${browser ? preset.name : fileName} the Working State and sends it to the pedal.`}
          onClick={props.onRecall}
        >
          {preset.name}
        </button>
        <div className="preset-summary" aria-label="Toggles">
          {toggleSummary(preset.params)}
        </div>
        {preset.notes && <div className="preset-notes">{preset.notes}</div>}
        <div className="preset-dates">
          Created {formatDate(preset.createdAt)} · Modified {formatDate(preset.modifiedAt)}
        </div>
      </div>
      <button type="button" className="text-button" aria-label={`Rename ${preset.name}`} onClick={props.onRename}>
        Rename
      </button>
      <button type="button" className="text-button" aria-label={`Duplicate ${preset.name}`} onClick={props.onDuplicate}>
        Duplicate
      </button>
      <button
        type="button"
        className="text-button"
        aria-label={`Export ${preset.name}`}
        title="Saves this Preset as a file to share or keep."
        onClick={props.onExport}
      >
        Export
      </button>
      <button
        type="button"
        className={`text-button${armed ? ' is-armed' : ''}`}
        aria-label={armed ? `Delete ${preset.name}? Click again` : `Delete ${preset.name}`}
        title={
          browser
            ? `Deletes ${preset.name} from this browser’s Library. This can’t be undone.`
            : `Deletes ${fileName} from the Library folder. This can’t be undone.`
        }
        onClick={clickDelete}
      >
        {armed ? 'Delete? Click again' : 'Delete'}
      </button>
    </li>
  );
}

/** A date as the user's locale writes it. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/** A browser storage Library is lost with the browser's site data, so it asks every so often to be backed up. */
function BackupReminder() {
  const due = useLibraryStore((s) => backupDue(s, new Date().toISOString()));
  const exportBundle = useLibraryStore((s) => s.exportBundle);
  const snoozeBackup = useLibraryStore((s) => s.snoozeBackup);
  if (!due) return null;
  return (
    <section className="library-reminder" role="status" aria-label="Back up your Library">
      <span>Back up your Library: it lives only in this browser, and clearing site data deletes it.</span>
      <div className="slot-card-actions">
        <button type="button" className="solid-button" onClick={exportBundle}>
          Back up now
        </button>
        <button type="button" className="outline-button" onClick={snoozeBackup}>
          Later
        </button>
      </div>
    </section>
  );
}

/** Asks what to do with an imported Preset whose id is already in the Library with different contents. */
function ImportConflictPrompt() {
  const conflicts = useLibraryStore((s) => s.conflicts);
  const resolveConflicts = useLibraryStore((s) => s.resolveConflicts);
  const [applyToAll, setApplyToAll] = useState(false);
  const [first] = conflicts;
  if (!first) return null;
  const answer = (choice: ConflictChoice) => void resolveConflicts(choice, applyToAll);
  return (
    <section className="library-reminder" role="alertdialog" aria-label="Import conflict">
      <span>
        “{first.incoming.name}” is already in the Library as “{first.existing.name}”, with different settings.
      </span>
      {conflicts.length > 1 && (
        <label className="library-apply-all">
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} /> Apply to all{' '}
          {conflicts.length}
        </label>
      )}
      <div className="slot-card-actions">
        <button
          type="button"
          className="solid-button"
          title="Overwrites the Library’s copy. Slots stored from it stay linked."
          onClick={() => answer('replace')}
        >
          Replace
        </button>
        <button
          type="button"
          className="outline-button"
          title="Adds the imported Preset as a new one."
          onClick={() => answer('keepBoth')}
        >
          Keep Both
        </button>
      </div>
    </section>
  );
}

/** What the last Import did. */
function ImportReportView() {
  const report = useLibraryStore((s) => s.importReport);
  const waiting = useLibraryStore((s) => s.conflicts.length);
  const dismiss = useLibraryStore((s) => s.dismissImportReport);
  if (!report) return null;
  const parts = [
    `${report.added} added`,
    report.replaced && `${report.replaced} replaced`,
    report.keptBoth && `${report.keptBoth} Keep Both`,
    report.skipped && `${report.skipped} already in the Library`,
    waiting && `${waiting} waiting`,
  ].filter(Boolean);
  return (
    <section className="library-import-report" role="status" aria-label="Import">
      <div className="library-folder">
        <span>Import · {parts.join(' · ')}</span>
        <button type="button" className="text-button" onClick={dismiss}>
          Dismiss
        </button>
      </div>
      {report.problems.length > 0 && (
        <details className="library-problems">
          <summary>
            {report.problems.length} import {report.problems.length === 1 ? 'problem' : 'problems'}
          </summary>
          <ul>
            {report.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** A Preset name field: trimmed, non-empty, at most 64 characters (SPEC.md §5.6). */
function NameForm(props: { label: string; initial: string; onSubmit(name: string): void; onCancel(): void }) {
  const [name, setName] = useState(props.initial);
  return (
    <form
      className="name-form"
      aria-label={props.label}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) props.onSubmit(name);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        // Only the form: the drawer stays open.
        e.preventDefault();
        props.onCancel();
      }}
    >
      <input
        aria-label="Preset name"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="solid-button" disabled={!name.trim()}>
        OK
      </button>
      <button type="button" className="outline-button" onClick={props.onCancel}>
        Cancel
      </button>
    </form>
  );
}

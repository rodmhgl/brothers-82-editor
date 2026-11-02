import { useEffect } from 'react';
import { DATA_BUTTON_ID, DATA_DRAWER_ID, drawerTabId } from './domIds';
import { PARAMS, isOn, switchValue } from '../midi/map';
import { useEditorStore } from '../store/editorStore';
import { useLayoutStore } from '../store/layoutStore';
import { libraryReachable, useLibraryStore } from '../store/library';

type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat'>;

type Command = 'save' | 'sendAll';

/** The Channel Bypass footswitches, stored in the Working State. */
type FootswitchId = 'channel1Bypass' | 'channel2Bypass';

export type Shortcut = { type: 'undo' | 'redo' | 'help' | Command | FootswitchId };

/** The key that toggles each footswitch, like tapping it. */
export const FOOTSWITCH_KEYS: Record<FootswitchId, string> = { channel1Bypass: '1', channel2Bypass: '2' };

/** ⌘ (Ctrl elsewhere) + key. */
const COMMANDS: Record<string, Command> = { s: 'save', e: 'sendAll' };

/** A key on its own. */
const KEYS: Record<string, Shortcut['type']> = {
  [FOOTSWITCH_KEYS.channel1Bypass]: 'channel1Bypass',
  [FOOTSWITCH_KEYS.channel2Bypass]: 'channel2Bypass',
  '?': 'help',
};

/** Fields whose own text undo ⌘Z should reach instead. */
const TEXT_EDIT = 'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"]), textarea, [contenteditable]';

/** Fields where ?, 1 and 2 are typed (or pick an option) rather than acting as shortcuts. */
const TEXT_ENTRY = `${TEXT_EDIT}, select`;

/** Where a key belongs to the focused field instead. ⌘S and ⌘E mean nothing to a field, so work everywhere. */
const TEXT_OWNS: Partial<Record<Shortcut['type'], string>> = {
  undo: TEXT_EDIT,
  redo: TEXT_EDIT,
  help: TEXT_ENTRY,
  channel1Bypass: TEXT_ENTRY,
  channel2Bypass: TEXT_ENTRY,
};

/**
 * The editor's keyboard shortcuts (SPEC.md §5.9, §5.11), with ⌘ on a Mac and Ctrl elsewhere. Held keys repeat only
 * undo/redo.
 */
export function shortcutFor(e: KeyLike, mac: boolean): Shortcut | null {
  const key = e.key.toLowerCase();
  const command = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (command) {
    if (e.altKey) return null;
    if (key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    const type = COMMANDS[key];
    return type && !e.shiftKey && !e.repeat ? { type } : null;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null;
  const type = KEYS[key];
  return type ? { type } : null;
}

/** ⌘ (Ctrl elsewhere) + key, as Help and tooltips show it. */
const command = (key: string, mac: boolean, shift = false) =>
  mac ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;

/** Every shortcut and what it does, in the order Help lists them (SPEC.md §5.11). */
export const SHORTCUTS: { keys(mac: boolean): string; action: string }[] = [
  { keys: (mac) => command('S', mac), action: 'Save' },
  { keys: (mac) => command('Z', mac), action: 'Undo' },
  { keys: (mac) => command('Z', mac, true), action: 'Redo' },
  { keys: () => FOOTSWITCH_KEYS.channel1Bypass, action: 'Toggle Channel 1 Bypass' },
  { keys: () => FOOTSWITCH_KEYS.channel2Bypass, action: 'Toggle Channel 2 Bypass' },
  { keys: (mac) => command('E', mac), action: 'Send All' },
  { keys: () => '?', action: 'Help' },
];

/** 1 / 2: flips a Channel Bypass, like tapping it. */
function toggleFootswitch(id: FootswitchId) {
  const editor = useEditorStore.getState();
  editor.setParam(id, switchValue(PARAMS[id], !isOn(editor.editor.working[id])));
}

/** ⌘S: writes the Working State back to its Preset, opening the Library only when that needs the user. */
async function save() {
  const library = useLibraryStore.getState();
  const layout = useLayoutStore.getState();
  if (!libraryReachable(library)) return layout.showTab('library');
  try {
    if (!(await library.save())) layout.requestLibrary({ kind: 'saveAs' });
  } catch (e) {
    layout.requestLibrary({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/** ?: opens Help with focus on its tab, or closes it, handing focus back to the Data button if it was inside. */
function toggleHelp() {
  useLayoutStore.getState().toggleHelp();
  if (useLayoutStore.getState().drawerOpen) {
    // The drawer stays inert until React renders it open.
    requestAnimationFrame(() => document.getElementById(drawerTabId('help'))?.focus());
  } else if (document.activeElement?.closest(`#${DATA_DRAWER_ID}`)) {
    document.getElementById(DATA_BUTTON_ID)?.focus();
  }
}

function run(shortcut: Shortcut) {
  const editor = useEditorStore.getState();
  switch (shortcut.type) {
    case 'undo':
    case 'redo':
      return editor[shortcut.type]();
    case 'save':
      return void save();
    case 'sendAll':
      return void editor.sendAll();
    case 'channel1Bypass':
    case 'channel2Bypass':
      return toggleFootswitch(shortcut.type);
    case 'help':
      return toggleHelp();
  }
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** A ⌘ (Ctrl elsewhere) shortcut, for `aria-keyshortcuts` and to show in a tooltip. */
export function commandKeys(key: string): { aria: string; label: string } {
  const mac = isMac();
  return { aria: `${mac ? 'Meta' : 'Control'}+${key}`, label: command(key, mac) };
}

/** Listens for the editor's shortcuts anywhere but a text field or an open dialog. */
export function useShortcuts() {
  useEffect(() => {
    const mac = isMac();
    const onKeyDown = (e: KeyboardEvent) => {
      const shortcut = shortcutFor(e, mac);
      if (!shortcut) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('dialog[open]')) return;
      const fieldOwns = TEXT_OWNS[shortcut.type];
      if (fieldOwns && target?.closest(fieldOwns)) return;
      e.preventDefault();
      run(shortcut);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutFor } from './useShortcuts';

type Mods = Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat', boolean>>;

const key = (key: string, mods: Mods = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...mods,
});

const MAC = true;
const PC = false;

describe('shortcutFor', () => {
  it('is ⌘Z / ⇧⌘Z on a Mac', () => {
    expect(shortcutFor(key('z', { metaKey: true }), MAC)).toEqual({ type: 'undo' });
    expect(shortcutFor(key('Z', { metaKey: true, shiftKey: true }), MAC)).toEqual({ type: 'redo' });
    expect(shortcutFor(key('z', { ctrlKey: true }), MAC)).toBeNull();
  });

  it('is Ctrl+Z / Ctrl+Shift+Z elsewhere', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }), PC)).toEqual({ type: 'undo' });
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }), PC)).toEqual({ type: 'redo' });
    expect(shortcutFor(key('z', { metaKey: true }), PC)).toBeNull();
  });

  it('repeats undo while held', () => {
    expect(shortcutFor(key('z', { ctrlKey: true, repeat: true }), PC)).toEqual({ type: 'undo' });
  });

  it('maps ⌘S and ⌘E (Ctrl elsewhere)', () => {
    expect(shortcutFor(key('s', { metaKey: true }), MAC)).toEqual({ type: 'save' });
    expect(shortcutFor(key('e', { metaKey: true }), MAC)).toEqual({ type: 'sendAll' });
    expect(shortcutFor(key('r', { metaKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('h', { metaKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('S', { ctrlKey: true }), PC)).toEqual({ type: 'save' });
    expect(shortcutFor(key('e', { ctrlKey: true }), PC)).toEqual({ type: 'sendAll' });
  });

  it('leaves the shifted and repeated forms of the command shortcuts alone', () => {
    expect(shortcutFor(key('S', { metaKey: true, shiftKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('r', { ctrlKey: true, repeat: true }), PC)).toBeNull();
  });

  it('opens Help with ?', () => {
    expect(shortcutFor(key('?', { shiftKey: true }), PC)).toEqual({ type: 'help' });
    expect(shortcutFor(key('?', { ctrlKey: true }), PC)).toBeNull();
  });

  it('toggles Channel 1 Bypass with 1 and Channel 2 Bypass with 2', () => {
    expect(shortcutFor(key('1'), PC)).toEqual({ type: 'channel1Bypass' });
    expect(shortcutFor(key('2'), MAC)).toEqual({ type: 'channel2Bypass' });
  });

  it('leaves 1 and 2 alone with a modifier or while held, and maps no other digit', () => {
    expect(shortcutFor(key('1', { metaKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('2', { ctrlKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('1', { altKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('2', { repeat: true }), PC)).toBeNull();
    expect(shortcutFor(key('3'), PC)).toBeNull();
  });

  it('has no Clean footswitch keys', () => {
    for (const letter of ['b', 'w']) expect(shortcutFor(key(letter), PC)).toBeNull();
  });

  it('lists every shortcut for Help', () => {
    expect(SHORTCUTS.map((s) => s.keys(MAC))).toEqual(['⌘S', '⌘Z', '⇧⌘Z', '1', '2', '⌘E', '?']);
    expect(SHORTCUTS.map((s) => s.keys(PC))).toEqual(['Ctrl+S', 'Ctrl+Z', 'Ctrl+Shift+Z', '1', '2', 'Ctrl+E', '?']);
  });

  it('ignores other keys and modifiers', () => {
    expect(shortcutFor(key('z'), PC)).toBeNull();
    expect(shortcutFor(key('s'), PC)).toBeNull();
    expect(shortcutFor(key('y', { ctrlKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }), PC)).toBeNull();
  });
});

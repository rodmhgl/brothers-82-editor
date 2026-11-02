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

  it('maps ⌘S, ⌘E and ⌘H (Ctrl elsewhere)', () => {
    expect(shortcutFor(key('s', { metaKey: true }), MAC)).toEqual({ type: 'save' });
    expect(shortcutFor(key('e', { metaKey: true }), MAC)).toEqual({ type: 'sendAll' });
    expect(shortcutFor(key('r', { metaKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('h', { metaKey: true }), MAC)).toEqual({ type: 'hiddenOptions' });
    expect(shortcutFor(key('S', { ctrlKey: true }), PC)).toEqual({ type: 'save' });
    expect(shortcutFor(key('e', { ctrlKey: true }), PC)).toEqual({ type: 'sendAll' });
  });

  it('leaves the shifted and repeated forms of the command shortcuts alone', () => {
    expect(shortcutFor(key('S', { metaKey: true, shiftKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('r', { ctrlKey: true, repeat: true }), PC)).toBeNull();
  });

  it('has no number-key shortcuts: Clean has no toggle keys', () => {
    for (const digit of ['1', '3', '6']) expect(shortcutFor(key(digit), PC)).toBeNull();
  });

  it('opens Help with ?', () => {
    expect(shortcutFor(key('?', { shiftKey: true }), PC)).toEqual({ type: 'help' });
    expect(shortcutFor(key('?', { ctrlKey: true }), PC)).toBeNull();
  });

  it('toggles Bypass with B and Swell with W', () => {
    expect(shortcutFor(key('b'), PC)).toEqual({ type: 'bypass' });
    expect(shortcutFor(key('B', { shiftKey: true }), PC)).toEqual({ type: 'bypass' });
    expect(shortcutFor(key('w'), MAC)).toEqual({ type: 'swell' });
  });

  it('leaves B and W alone with a modifier or while held', () => {
    expect(shortcutFor(key('b', { metaKey: true }), MAC)).toBeNull();
    expect(shortcutFor(key('w', { ctrlKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('b', { altKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('w', { repeat: true }), PC)).toBeNull();
  });

  it('lists every shortcut for Help', () => {
    expect(SHORTCUTS.map((s) => s.keys(MAC))).toEqual(['⌘S', '⌘Z', '⇧⌘Z', 'B', 'W', '⌘E', '⌘H', '?']);
    expect(SHORTCUTS.map((s) => s.keys(PC))).toEqual(['Ctrl+S', 'Ctrl+Z', 'Ctrl+Shift+Z', 'B', 'W', 'Ctrl+E', 'Ctrl+H', '?']);
  });

  it('ignores other keys and modifiers', () => {
    expect(shortcutFor(key('z'), PC)).toBeNull();
    expect(shortcutFor(key('s'), PC)).toBeNull();
    expect(shortcutFor(key('y', { ctrlKey: true }), PC)).toBeNull();
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }), PC)).toBeNull();
  });
});

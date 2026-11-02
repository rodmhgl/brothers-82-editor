import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { createVirtualPedal } from '../midi/transport/virtual';
import { defaultWorkingState } from '../model/state';
import { createEditorStore } from './editorStore';
import type { WorkingSource } from './library';
import { keepSession, startSession, type SessionStorage } from './persistence';
import { DEFAULT_SETTINGS, SESSION_VERSION, parseSession, type Session } from './session';
import { createSettingsStore } from './settingsStore';

const NOW = '2026-10-05T12:00:00.000Z';

let stores: {
  editor: ReturnType<typeof createEditorStore>;
  library: ReturnType<typeof createSourceStore>;
  settings: ReturnType<typeof createSettingsStore>;
};

/** The one part of the Library store a session holds. */
function createSourceStore() {
  return create<{ source: WorkingSource }>(() => ({
    source: { presetId: null, name: 'Untitled', params: defaultWorkingState() },
  }));
}

/** Storage in memory; each `save` waits until `flush` while `held`. */
function memoryStorage(initial?: unknown) {
  const saved: Session[] = [];
  let held = false;
  let release: (() => void)[] = [];
  const storage: SessionStorage = {
    load: async () => initial,
    async save(session) {
      if (held) await new Promise<void>((resolve) => release.push(resolve));
      saved.push(session);
    },
  };
  return {
    storage,
    saved,
    hold: () => (held = true),
    flush: async () => {
      held = false;
      release.forEach((r) => r());
      release = [];
      await vi.runAllTimersAsync();
    },
  };
}

const working = { ...defaultWorkingState(), sensitivity: 100 };
const session: Session = {
  version: SESSION_VERSION,
  working,
  source: { presetId: 'p-1', name: 'Shimmer Tape', params: defaultWorkingState() },
  slotMap: { 5: { slot: 5, snapshot: working, presetId: 'p-1', name: 'Shimmer Tape', writtenAt: NOW } },
  midiChannel: 7,
  outputId: 'out-1',
  inputId: null,
  settings: { ...DEFAULT_SETTINGS, uiScale: 150, showCcNumbers: false, autoSendAll: false },
};

beforeEach(() => {
  vi.useFakeTimers();
  stores = {
    editor: createEditorStore(createVirtualPedal(), { now: () => NOW }),
    library: createSourceStore(),
    settings: createSettingsStore(),
  };
});
afterEach(() => vi.useRealTimers());

describe('startSession', () => {
  it('restores the last session into the editor, Library and settings, Possibly Stale', async () => {
    await startSession(memoryStorage(session).storage, stores);

    expect(stores.editor.getState()).toMatchObject({
      editor: { working, slotMap: session.slotMap, global: { midiChannel: 7 }, sync: 'possiblyStale' },
      outputId: 'out-1',
      autoSendAll: false,
    });
    expect(stores.library.getState().source).toEqual(session.source);
    expect(stores.settings.getState()).toMatchObject({ uiScale: 150, showCcNumbers: false });
  });

  it('restores a Working State with no source as Untitled and unmodified', async () => {
    await startSession(memoryStorage({ ...session, source: null }).storage, stores);

    expect(stores.library.getState().source).toEqual({ presetId: null, name: 'Untitled', params: working });
  });

  it('starts from defaults when nothing usable was stored, or storage fails', async () => {
    const before = stores.editor.getState().editor;
    await startSession(memoryStorage('junk').storage, stores);
    await startSession({ load: () => Promise.reject(new Error('blocked')), save: async () => {} }, stores);

    expect(stores.editor.getState().editor).toBe(before);
  });

  it('goes on saving changes after restoring', async () => {
    const memory = memoryStorage(session);
    await startSession(memory.storage, stores);

    stores.editor.getState().setParam('sensitivity', 3);
    await vi.runAllTimersAsync();

    expect(memory.saved.at(-1)?.working.sensitivity).toBe(3);
  });
});

describe('keepSession', () => {
  it('saves every persisted part as it changes, in a form parseSession reads back', async () => {
    const memory = memoryStorage();
    keepSession(memory.storage, stores);

    stores.editor.getState().setParam('sensitivity', 42);
    stores.editor.getState().setMidiChannel(9);
    stores.editor.getState().setInput('in-1');
    stores.editor.getState().setSendThrottleMs(12);
    stores.settings.getState().update({ confirmOverwrite: false });
    stores.library.setState({ source: { presetId: 'p-2', name: 'Drone', params: working } });
    await vi.runAllTimersAsync();

    const last = memory.saved.at(-1)!;
    expect(parseSession(JSON.parse(JSON.stringify(last)))).toEqual(last);
    expect(last).toMatchObject({
      working: { sensitivity: 42 },
      midiChannel: 9,
      inputId: 'in-1',
      source: { presetId: 'p-2', name: 'Drone' },
      settings: { sendThrottleMs: 12, confirmOverwrite: false },
    });
  });

  it('writes nothing for changes it doesn’t keep, like the MIDI Monitor or Performance Controls', async () => {
    const memory = memoryStorage();
    keepSession(memory.storage, stores);

    stores.editor.getState().setParam('expression', 90);
    stores.editor.getState().selectSlot(9);
    await vi.runAllTimersAsync();

    expect(memory.saved).toEqual([]);
  });

  it('writes one save at a time, then only the latest of any changes made meanwhile', async () => {
    const memory = memoryStorage();
    keepSession(memory.storage, stores);
    memory.hold();

    for (const sensitivity of [1, 2, 3, 4]) stores.editor.getState().setParam('sensitivity', sensitivity);
    await memory.flush();

    expect(memory.saved.map((s) => s.working.sensitivity)).toEqual([1, 4]);
  });

  it('keeps going after a save fails', async () => {
    const saved: number[] = [];
    let fail = true;
    keepSession(
      {
        load: async () => undefined,
        async save(s) {
          if (fail) throw new Error('quota');
          saved.push(s.working.sensitivity);
        },
      },
      stores,
    );

    stores.editor.getState().setParam('sensitivity', 1);
    await vi.runAllTimersAsync();
    fail = false;
    stores.editor.getState().setParam('sensitivity', 2);
    await vi.runAllTimersAsync();

    expect(saved).toEqual([2]);
  });
});

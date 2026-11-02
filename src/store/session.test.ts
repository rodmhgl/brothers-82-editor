import { describe, expect, it } from 'vitest';
import { defaultWorkingState } from '../model/state';
import { DEFAULT_SETTINGS, SESSION_VERSION, THEMES, parseSession, type Session } from './session';

const working = { ...defaultWorkingState(), vol2: 100, ampType: 3 };

const saved: Session = {
  version: SESSION_VERSION,
  working,
  source: { presetId: 'p-1', name: 'Shimmer Tape', params: defaultWorkingState() },
  slotMap: {
    5: { slot: 5, snapshot: working, presetId: 'p-1', name: 'Shimmer Tape', writtenAt: '2026-10-05T12:00:00.000Z' },
  },
  midiChannel: 7,
  outputId: 'out-1',
  inputId: 'in-1',
  settings: {
    autoSendAll: false,
    sendThrottleMs: 10,
    knobSensitivity: 2,
    theme: 'light',
    uiScale: 150,
    showCcNumbers: false,
    confirmOverwrite: false,
  },
};

/** What a saved session looks like once it has been through storage. */
const stored = (session: unknown) => JSON.parse(JSON.stringify(session)) as Record<string, unknown>;

describe('parseSession', () => {
  it('reads back a session as it was saved', () => {
    expect(parseSession(stored(saved))).toEqual(saved);
  });

  it('ignores anything that is not a session of this version', () => {
    expect(parseSession(undefined)).toBeNull();
    expect(parseSession('session')).toBeNull();
    expect(parseSession({ ...stored(saved), version: SESSION_VERSION + 1 })).toBeNull();
  });

  it('normalises the Working State as a Preset file would be: defaults for missing params, values clamped', () => {
    const { vol2: _, ...rest } = working;
    const session = parseSession({ ...stored(saved), working: { ...rest, ampType: 9, nonsense: 1 } })!;
    expect(session.working).toEqual({ ...working, vol2: defaultWorkingState().vol2, ampType: 3 });
    expect(session.working).not.toHaveProperty('nonsense');
  });

  it('keeps the Slot Map entries it can read and drops the rest', () => {
    const slotMap = {
      ...stored(saved).slotMap as object,
      // Not a Slot.
      0: { slot: 0, snapshot: working, name: 'x', writtenAt: 'y' },
      200: { slot: 200, snapshot: working, name: 'x', writtenAt: 'y' },
      // Not an entry.
      6: 'junk',
      7: { slot: 7, name: 'No snapshot', writtenAt: 'y' },
      // Stored from no Preset.
      8: { slot: 8, snapshot: { ...working, vol2: 500 }, name: 'Untitled', writtenAt: 'z' },
    };
    expect(parseSession({ ...stored(saved), slotMap })!.slotMap).toEqual({
      5: saved.slotMap[5],
      8: { slot: 8, snapshot: { ...working, vol2: 127 }, name: 'Untitled', writtenAt: 'z' },
    });
  });

  it('falls back to defaults for a MIDI channel, devices or settings it cannot read', () => {
    const session = parseSession({
      ...stored(saved),
      midiChannel: 17,
      outputId: 3,
      inputId: false,
      settings: { autoSendAll: 'yes', sendThrottleMs: 'fast', uiScale: 'big', theme: 'neon' },
    })!;
    expect(session.midiChannel).toBe(2);
    expect(session.outputId).toBe('virtual-pedal');
    expect(session.inputId).toBeNull();
    expect(session.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps every offered theme', () => {
    for (const theme of Object.keys(THEMES)) {
      expect(parseSession({ ...stored(saved), settings: { ...saved.settings, theme } })!.settings.theme).toBe(theme);
    }
  });

  it('keeps numeric settings within their ranges, and knob drag sensitivity to one offered', () => {
    const settings = { ...saved.settings, sendThrottleMs: 900, uiScale: 20, knobSensitivity: 7 };
    expect(parseSession({ ...stored(saved), settings })!.settings).toMatchObject({
      sendThrottleMs: 50,
      uiScale: 75,
      knobSensitivity: 1,
    });
  });

  it('has no source when none was saved, or it cannot be read', () => {
    expect(parseSession({ ...stored(saved), source: null })!.source).toBeNull();
    expect(parseSession({ ...stored(saved), source: { name: 'No params' } })!.source).toBeNull();
  });
});

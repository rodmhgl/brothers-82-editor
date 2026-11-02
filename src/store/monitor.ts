import { decode } from '../midi/decode';
import type { MidiMessage } from '../midi/encode';
import { FACTORY_RESET_CC, LIVE_PROGRAM, SAVE_TO_SLOT_CC, SWELL_ALTERNATE_CC, paramByCc, settingLabel } from '../midi/map';

/** The MIDI Monitor shows about this many of the newest outgoing messages. */
export const MONITOR_ROWS = 15;

export type SentMessage = { id: number; at: number; bytes: MidiMessage };

/**
 * Adds an outgoing message, newest first. A CC repeating the newest row's CC replaces it,
 * so a knob drag reads as one row that follows the knob.
 */
export function logSent(log: SentMessage[], message: SentMessage, max = MONITOR_ROWS): SentMessage[] {
  const [newest, ...rest] = log;
  const repeats = newest && sameCc(newest.bytes, message.bytes);
  return [message, ...(repeats ? rest : log)].slice(0, max);
}

const sameCc = (a: MidiMessage, b: MidiMessage) => a.length === 3 && b.length === 3 && a[0] === b[0] && a[1] === b[1];

export type MonitorRow = { type: 'CC' | 'PC' | '—'; number: string; value: string; label: string };

/** A sent message as the monitor shows it: type, number, value and what it means. */
export function describeSent(bytes: MidiMessage): MonitorRow {
  const msg = decode(bytes);
  if (msg.kind === 'pc') {
    const label = msg.program === LIVE_PROGRAM ? 'Live' : `Recall Slot ${msg.program}`;
    return { type: 'PC', number: String(msg.program), value: '', label };
  }
  if (msg.kind === 'cc') {
    return { type: 'CC', number: String(msg.cc), value: String(msg.value), label: ccLabel(msg.cc, msg.value) };
  }
  return { type: '—', number: '', value: '', label: msg.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') };
}

/** What a CC means: its param and named setting, a Store, AUX hold (SPEC.md §4.4), or '—' outside the MIDI map. */
function ccLabel(cc: number, value: number): string {
  if (cc === SAVE_TO_SLOT_CC) return `Store to Slot ${value}`;
  if (cc === SWELL_ALTERNATE_CC) return 'AUX hold';
  if (cc === FACTORY_RESET_CC) return 'Factory Reset';
  const param = paramByCc(cc);
  if (!param) return '—';
  const named = settingLabel(param, value);
  return named ? `${param.label} · ${named}` : param.label;
}

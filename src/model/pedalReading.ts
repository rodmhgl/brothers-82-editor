import { decode } from '../midi/decode';
import type { MidiMessage } from '../midi/encode';
import { LIVE_PROGRAM, SAVE_TO_SLOT_CC, clampToParam, paramByCc, type ParamId } from '../midi/map';
import { isSlot } from './slots';

// How the pedal reads one incoming message (SPEC.md §4). Shared by the Virtual Pedal, which simulates the pedal,
// and the editor core, which follows what it forwards.

export type PedalReading =
  /** On another MIDI channel: the pedal doesn't listen to it. */
  | { kind: 'ignored'; midiChannel: number }
  /** A CC in the MIDI map, its value as the pedal decodes it (toggles 1–3, switches 0/127, clamped). */
  | { kind: 'param'; id: ParamId; value: number }
  /** A CC the MIDI map doesn't have. */
  | { kind: 'unmapped'; cc: number; value: number }
  /** PC 0. */
  | { kind: 'live' }
  /** PC n. */
  | { kind: 'recall'; slot: number }
  /** Save to Slot, CC 111 = n. */
  | { kind: 'store'; slot: number }
  /** A PC or Save to Slot (`via`) whose number is no Slot: nothing happens. */
  | { kind: 'noSuchSlot'; via: 'recall' | 'store'; slot: number }
  | { kind: 'unknown' };

/** What the pedal, listening on `midiChannel`, makes of `bytes`. */
export function readMessage(bytes: MidiMessage, midiChannel: number): PedalReading {
  const msg = decode(bytes);
  if (msg.kind === 'unknown') return { kind: 'unknown' };
  if (msg.midiChannel !== midiChannel) return { kind: 'ignored', midiChannel: msg.midiChannel };
  if (msg.kind === 'pc') {
    if (msg.program === LIVE_PROGRAM) return { kind: 'live' };
    return isSlot(msg.program) ? { kind: 'recall', slot: msg.program } : { kind: 'noSuchSlot', via: 'recall', slot: msg.program };
  }
  if (msg.cc === SAVE_TO_SLOT_CC) {
    return isSlot(msg.value) ? { kind: 'store', slot: msg.value } : { kind: 'noSuchSlot', via: 'store', slot: msg.value };
  }
  const param = paramByCc(msg.cc);
  if (!param) return { kind: 'unmapped', cc: msg.cc, value: msg.value };
  return { kind: 'param', id: param.id as ParamId, value: clampToParam(param, msg.value) };
}

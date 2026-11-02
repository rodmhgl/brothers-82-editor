import { decode } from '../midi/decode';
import type { MidiMessage } from '../midi/encode';
import {
  FACTORY_RESET_CC,
  LIVE_PROGRAM,
  SAVE_TO_SLOT_CC,
  SWELL_ALTERNATE_CC,
  clampToParam,
  isOn,
  paramByCc,
  type ParamId,
} from '../midi/map';
import { isSlot } from './slots';

// How the pedal reads one incoming message (SPEC.md §4). Shared by the Virtual Pedal, which simulates the pedal,
// and the editor core, which follows what it forwards.

export type PedalReading =
  /** On another MIDI channel: the pedal doesn't listen to it. */
  | { kind: 'ignored'; midiChannel: number }
  /** A CC in the MIDI map, its value as the pedal decodes it (toggles 1–3, switches 0/127, clamped). */
  | { kind: 'param'; id: ParamId; value: number }
  /**
   * CC 105, the second Swell CC: holding the AUX footswitch. Momentary, so it changes no stored state, and the editor
   * never sends it (SPEC.md §4.4).
   */
  | { kind: 'auxHold'; on: boolean }
  /** A CC the MIDI map doesn't have. */
  | { kind: 'unmapped'; cc: number; value: number }
  /** PC 0. */
  | { kind: 'live' }
  /** PC n. */
  | { kind: 'recall'; slot: number }
  /** Save to Slot, CC 111 = n. */
  | { kind: 'store'; slot: number }
  /** Factory Reset, CC 56 = any value. */
  | { kind: 'factoryReset' }
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
  if (msg.cc === SWELL_ALTERNATE_CC) return { kind: 'auxHold', on: isOn(msg.value) };
  if (msg.cc === FACTORY_RESET_CC) return { kind: 'factoryReset' };
  const param = paramByCc(msg.cc);
  if (!param) return { kind: 'unmapped', cc: msg.cc, value: msg.value };
  return { kind: 'param', id: param.id as ParamId, value: clampToParam(param, msg.value) };
}

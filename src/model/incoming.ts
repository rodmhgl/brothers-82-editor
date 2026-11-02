import { midiChannelOf } from '../midi/decode';
import type { MidiMessage } from '../midi/encode';

// Incoming MIDI is routed by MIDI channel, so only the pedal's MIDI channel reaches Pass-through (SPEC.md §5.8).

export type IncomingRoute =
  /** Forwarded to the pedal unchanged, and followed by the editor. */
  | 'passThrough'
  /** On another MIDI channel: ignored, never forwarded (MIDI Learn was dropped, #17). */
  | 'learn'
  /** Neither: SysEx, MIDI clock, Active Sensing and the like. */
  | 'drop';

/** Where a message from the MIDI input goes, for a pedal listening on `midiChannel`. */
export function routeIncoming(bytes: MidiMessage, midiChannel: number): IncomingRoute {
  const sentOn = midiChannelOf(bytes);
  if (sentOn === null) return 'drop';
  return sentOn === midiChannel ? 'passThrough' : 'learn';
}

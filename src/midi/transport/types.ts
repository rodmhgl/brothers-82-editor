import type { MidiMessage } from '../encode';

export type MidiPort = { id: string; name: string };

/** Everything the editor needs from a MIDI backend (Web MIDI, Virtual Pedal). */
export interface MidiTransport {
  listOutputs(): MidiPort[];
  listInputs(): MidiPort[];
  send(bytes: MidiMessage): void;
  /** Returns an unsubscribe function. */
  onMessage(cb: (bytes: MidiMessage) => void): () => void;
}

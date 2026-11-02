import type { MidiMessage } from '../encode';
import type { MidiPort, MidiTransport } from './types';

/** A Web MIDI transport that sends to one selected output and hears one selected input (SPEC.md §5.1). */
export interface WebMidi extends MidiTransport {
  /** Which output `send` goes to; null sends nowhere. */
  selectOutput(id: string | null): void;
  /** Which input `onMessage` hears; null hears nothing. */
  selectInput(id: string | null): void;
  isConnected(id: string): boolean;
  /** Fires when a port is plugged in, unplugged, opened or closed. Returns an unsubscribe function. */
  onPortsChange(cb: () => void): () => void;
}

function toPort(port: MIDIPort): MidiPort {
  return { id: port.id, name: port.name ?? port.id };
}

function connected(ports: MIDIOutputMap | MIDIInputMap): MidiPort[] {
  return [...ports.values()].filter((p) => p.state === 'connected').map(toPort);
}

/** Asks the browser for MIDI access; resolves null when Web MIDI is missing or the user refuses it. */
export async function requestWebMidi(): Promise<WebMidi | null> {
  if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) return null;
  try {
    return createWebMidi(await navigator.requestMIDIAccess({ sysex: false }));
  } catch {
    return null;
  }
}

export function createWebMidi(access: MIDIAccess): WebMidi {
  let selectedOutput: string | null = null;
  let selectedInput: string | null = null;
  const portListeners = new Set<() => void>();
  const messageListeners = new Set<(bytes: MidiMessage) => void>();

  function listen(input: MIDIInput) {
    input.onmidimessage = (e) => {
      if (e.data && input.id === selectedInput) messageListeners.forEach((cb) => cb([...e.data!]));
    };
  }

  access.inputs.forEach(listen);
  access.onstatechange = (e) => {
    const port = (e as MIDIConnectionEvent).port;
    if (port?.type === 'input') listen(port as MIDIInput);
    portListeners.forEach((cb) => cb());
  };

  return {
    listOutputs: () => connected(access.outputs),
    listInputs: () => connected(access.inputs),
    send(bytes) {
      const output = selectedOutput ? access.outputs.get(selectedOutput) : undefined;
      if (output?.state === 'connected') output.send(bytes);
    },
    onMessage(cb) {
      messageListeners.add(cb);
      return () => messageListeners.delete(cb);
    },
    selectOutput(id) {
      selectedOutput = id;
    },
    selectInput(id) {
      selectedInput = id;
    },
    isConnected: (id) => access.outputs.get(id)?.state === 'connected',
    onPortsChange(cb) {
      portListeners.add(cb);
      return () => portListeners.delete(cb);
    },
  };
}

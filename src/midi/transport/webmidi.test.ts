import { describe, expect, it, vi } from 'vitest';
import { createWebMidi } from './webmidi';

type FakePort = { id: string; name: string; type: 'input' | 'output'; state: string; send?: (b: number[]) => void };

function fakeAccess(outputs: FakePort[], inputs: FakePort[] = []) {
  const access = {
    outputs: new Map(outputs.map((p) => [p.id, p])),
    inputs: new Map(inputs.map((p) => [p.id, p])),
    onstatechange: null as ((e: { port: FakePort }) => void) | null,
  };
  return access;
}

const output = (id: string, state = 'connected'): FakePort => ({ id, name: `${id} name`, type: 'output', state, send: vi.fn() });

describe('Web MIDI transport', () => {
  it('lists only connected outputs', () => {
    const access = fakeAccess([output('a'), output('b', 'disconnected')]);
    const midi = createWebMidi(access as unknown as MIDIAccess);

    expect(midi.listOutputs()).toEqual([{ id: 'a', name: 'a name' }]);
  });

  it('sends only to the selected, connected output', () => {
    const a = output('a');
    const b = output('b');
    const midi = createWebMidi(fakeAccess([a, b]) as unknown as MIDIAccess);

    midi.send([0xb1, 15, 1]);
    midi.selectOutput('b');
    midi.send([0xb1, 15, 2]);

    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalledExactlyOnceWith([0xb1, 15, 2]);
  });

  it('reports hot-plug changes and connection state', () => {
    const a = output('a');
    const access = fakeAccess([a]);
    const midi = createWebMidi(access as unknown as MIDIAccess);
    const changed = vi.fn();
    midi.onPortsChange(changed);

    a.state = 'disconnected';
    access.onstatechange!({ port: a });

    expect(changed).toHaveBeenCalledOnce();
    expect(midi.isConnected('a')).toBe(false);
    expect(midi.listOutputs()).toEqual([]);
  });

  it('delivers incoming messages from the selected input only', () => {
    type FakeInput = FakePort & { onmidimessage?: (e: { data: Uint8Array }) => void };
    const input = (id: string): FakeInput => ({ id, name: id, type: 'input', state: 'connected' });
    const a = input('a');
    const b = input('b');
    const midi = createWebMidi(fakeAccess([], [a, b]) as unknown as MIDIAccess);
    const received = vi.fn();
    midi.onMessage(received);

    a.onmidimessage!({ data: new Uint8Array([0xb1, 15, 1]) });
    midi.selectInput('b');
    a.onmidimessage!({ data: new Uint8Array([0xb1, 15, 2]) });
    b.onmidimessage!({ data: new Uint8Array([0xb1, 15, 3]) });
    midi.selectInput(null);
    b.onmidimessage!({ data: new Uint8Array([0xb1, 15, 4]) });

    expect(received).toHaveBeenCalledExactlyOnceWith([0xb1, 15, 3]);
  });

  it('lists only connected inputs', () => {
    const access = fakeAccess([], [{ id: 'in', name: 'in name', type: 'input', state: 'connected' }, { id: 'x', name: 'x', type: 'input', state: 'disconnected' }]);

    expect(createWebMidi(access as unknown as MIDIAccess).listInputs()).toEqual([{ id: 'in', name: 'in name' }]);
  });
});

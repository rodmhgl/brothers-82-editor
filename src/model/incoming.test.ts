import { describe, expect, it } from 'vitest';
import { routeIncoming } from './incoming';

describe('routeIncoming', () => {
  it.each([
    ['a CC', [0xb1, 15, 3]],
    ['a PC', [0xc1, 9]],
    ['a note', [0x91, 60, 100]],
    ['pitch bend', [0xe1, 0, 64]],
  ])('passes %s on the pedal’s MIDI channel through', (_, bytes) => {
    expect(routeIncoming(bytes, 2)).toBe('passThrough');
  });

  it.each([
    ['a CC', [0xb4, 15, 3]],
    ['a PC', [0xc0, 9]],
    ['a note', [0x9f, 60, 100]],
  ])('ignores %s on another MIDI channel', (_, bytes) => {
    expect(routeIncoming(bytes, 2)).toBe('learn');
  });

  it('follows the pedal’s MIDI channel', () => {
    expect(routeIncoming([0xb4, 15, 3], 5)).toBe('passThrough');
    expect(routeIncoming([0xb1, 15, 3], 5)).toBe('learn');
  });

  it.each([
    ['SysEx', [0xf0, 0x7e, 0x7f, 0xf7]],
    ['MIDI clock', [0xf8]],
    ['MIDI Start', [0xfa]],
    ['MIDI Continue', [0xfb]],
    ['MIDI Stop', [0xfc]],
    ['Active Sensing', [0xfe]],
    ['Reset', [0xff]],
    ['an empty message', []],
  ])('drops %s', (_, bytes) => {
    expect(routeIncoming(bytes, 2)).toBe('drop');
  });
});

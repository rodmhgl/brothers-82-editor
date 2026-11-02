import { describe, expect, it } from 'vitest';
import { readMessage } from './pedalReading';

describe('readMessage', () => {
  it('ignores messages on a MIDI channel other than the pedal’s', () => {
    expect(readMessage([0xb0, 15, 1], 2)).toEqual({ kind: 'ignored', midiChannel: 1 });
    expect(readMessage([0xc4, 5], 2)).toEqual({ kind: 'ignored', midiChannel: 5 });
  });

  it('reads a CC in the MIDI map as that param', () => {
    expect(readMessage([0xb1, 15, 100], 2)).toEqual({ kind: 'param', id: 'vol2', value: 100 });
    expect(readMessage([0xb1, 100, 127], 2)).toEqual({ kind: 'param', id: 'expression', value: 127 });
  });

  it('reads toggles the way the pedal does: 0/1 → position 1, ≥3 → position 3', () => {
    expect(readMessage([0xb1, 21, 0], 2)).toMatchObject({ id: 'ampType', value: 1 });
    expect(readMessage([0xb1, 21, 2], 2)).toMatchObject({ id: 'ampType', value: 2 });
    expect(readMessage([0xb1, 21, 100], 2)).toMatchObject({ id: 'ampType', value: 3 });
  });

  it('reads any non-zero switch value as on (127)', () => {
    expect(readMessage([0xb1, 74, 1], 2)).toMatchObject({ id: 'motoByp2', value: 127 });
    expect(readMessage([0xb1, 102, 0], 2)).toMatchObject({ id: 'channel1Bypass', value: 0 });
    expect(readMessage([0xb1, 103, 40], 2)).toMatchObject({ id: 'channel2Bypass', value: 127 });
  });

  it('reads CC 111 = n as storing into Slot n, and any value that is no Slot as reaching none', () => {
    expect(readMessage([0xb1, 111, 9], 2)).toEqual({ kind: 'store', slot: 9 });
    expect(readMessage([0xb1, 111, 0], 2)).toEqual({ kind: 'noSuchSlot', via: 'store', slot: 0 });
    expect(readMessage([0xb1, 111, 123], 2)).toEqual({ kind: 'noSuchSlot', via: 'store', slot: 123 });
  });

  it('reads a CC outside the MIDI map as unmapped', () => {
    expect(readMessage([0xb1, 1, 7], 2)).toEqual({ kind: 'unmapped', cc: 1, value: 7 });
    expect(readMessage([0xb1, 56, 0], 2)).toEqual({ kind: 'unmapped', cc: 56, value: 0 });
    expect(readMessage([0xb1, 105, 127], 2)).toEqual({ kind: 'unmapped', cc: 105, value: 127 });
  });

  it('reads PC 0 as Live, PC n as a Slot recall and PC 123–127 as reaching no Slot', () => {
    expect(readMessage([0xc1, 0], 2)).toEqual({ kind: 'live' });
    expect(readMessage([0xc1, 5], 2)).toEqual({ kind: 'recall', slot: 5 });
    expect(readMessage([0xc1, 122], 2)).toEqual({ kind: 'recall', slot: 122 });
    expect(readMessage([0xc1, 123], 2)).toEqual({ kind: 'noSuchSlot', via: 'recall', slot: 123 });
  });

  it('reads anything else as unknown, whatever its MIDI channel', () => {
    expect(readMessage([0xfe], 2)).toEqual({ kind: 'unknown' });
    expect(readMessage([0xf8], 2)).toEqual({ kind: 'unknown' });
    expect(readMessage([0x90, 60, 100], 2)).toEqual({ kind: 'unknown' });
    expect(readMessage([0xb1, 15], 2)).toEqual({ kind: 'unknown' });
  });
});

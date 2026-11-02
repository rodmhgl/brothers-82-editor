import { describe, expect, it } from 'vitest';
import { describeSent, logSent, type SentMessage } from './monitor';

const sent = (id: number, bytes: number[]): SentMessage => ({ id, at: id, bytes });

describe('MIDI Monitor log', () => {
  it('keeps the newest message first', () => {
    const log = logSent(logSent([], sent(1, [0xb1, 15, 1])), sent(2, [0xb1, 14, 1]));

    expect(log.map((m) => m.id)).toEqual([2, 1]);
  });

  it('updates the newest row when the same CC is sent again', () => {
    let log = logSent([], sent(1, [0xb1, 15, 1]));
    log = logSent(log, sent(2, [0xb1, 14, 1]));
    log = logSent(log, sent(3, [0xb1, 14, 2]));

    expect(log.map((m) => [m.id, m.bytes[2]])).toEqual([
      [3, 2],
      [1, 1],
    ]);
  });

  it('treats the same CC on another MIDI channel as a new row', () => {
    const log = logSent(logSent([], sent(1, [0xb1, 15, 1])), sent(2, [0xb4, 15, 1]));

    expect(log).toHaveLength(2);
  });

  it('is capped', () => {
    const log = [1, 2, 3, 4].reduce<SentMessage[]>((l, i) => logSent(l, sent(i, [0xb1, i, 0]), 3), []);

    expect(log.map((m) => m.id)).toEqual([4, 3, 2]);
  });
});

describe('describeSent', () => {
  it.each([
    [[0xb1, 15, 90], { type: 'CC', number: '15', value: '90', label: 'Vol 2' }],
    [[0xb1, 22, 2], { type: 'CC', number: '22', value: '2', label: 'Effect Order · 2+1' }],
    [[0xb1, 74, 127], { type: 'CC', number: '74', value: '127', label: 'MotoByp 2 · On' }],
    [[0xb1, 67, 127], { type: 'CC', number: '67', value: '127', label: 'Sweep · T' }],
    [[0xb1, 111, 5], { type: 'CC', number: '111', value: '5', label: 'Store to Slot 5' }],
    [[0xb1, 56, 127], { type: 'CC', number: '56', value: '127', label: '—' }],
    [[0xb1, 9, 1], { type: 'CC', number: '9', value: '1', label: '—' }],
    [[0xc1, 0], { type: 'PC', number: '0', value: '', label: 'Live' }],
    [[0xc1, 7], { type: 'PC', number: '7', value: '', label: 'Recall Slot 7' }],
    [[0xf8], { type: '—', number: '', value: '', label: 'F8' }],
  ])('describes %j', (bytes, row) => {
    expect(describeSent(bytes)).toEqual(row);
  });
});

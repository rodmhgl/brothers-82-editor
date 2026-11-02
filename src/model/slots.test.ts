import { describe, expect, it } from 'vitest';
import { SLOTS, isSlot, isToggleSlot, slotNumber, slotReach } from './slots';

describe('Slots', () => {
  it('has 122 Slots, of which 1–2 are Toggle Slots: Clean has no Bank dip', () => {
    expect(SLOTS).toHaveLength(122);
    expect(SLOTS.filter(isToggleSlot)).toEqual([1, 2]);
  });

  it('names the Toggle Slots by toggle side', () => {
    expect([1, 2, 3].map(slotReach)).toEqual(['Toggle Right', 'Toggle Left', 'MIDI only']);
  });

  it('numbers Slots 1–122 only', () => {
    expect([0, 1, 122, 123].map(isSlot)).toEqual([false, true, true, false]);
  });

  it('pads Slot numbers to two digits', () => {
    expect([1, 12, 122].map(slotNumber)).toEqual(['01', '12', '122']);
  });
});

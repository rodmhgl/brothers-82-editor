import { describe, expect, it } from 'vitest';
import { SLOTS, TOGGLE_SLOT_COUNT, isSlot, isToggleSlot, slotNumber, slotReach, slotReachShort } from './slots';

describe('Slots', () => {
  it('has 122 Slots, of which 1–4 are Toggle Slots', () => {
    expect(SLOTS).toHaveLength(122);
    expect(SLOTS.filter(isToggleSlot)).toEqual([1, 2, 3, 4]);
    expect(TOGGLE_SLOT_COUNT).toBe(4);
  });

  it('names the Toggle Slots by toggle side, with Slots 3 and 4 behind the Bank dip', () => {
    expect([1, 2, 3, 4, 5].map(slotReach)).toEqual([
      'Toggle Right',
      'Toggle Left',
      'Bank · Toggle Left',
      'Bank · Toggle Right',
      'MIDI only',
    ]);
  });

  it('shortens the Toggle Slot names for the rail tiles', () => {
    expect([1, 2, 3, 4].map(slotReachShort)).toEqual(['Toggle R', 'Toggle L', 'Bank · L', 'Bank · R']);
  });

  it('numbers Slots 1–122 only', () => {
    expect([0, 1, 122, 123].map(isSlot)).toEqual([false, true, true, false]);
  });

  it('pads Slot numbers to two digits', () => {
    expect([1, 12, 122].map(slotNumber)).toEqual(['01', '12', '122']);
  });
});

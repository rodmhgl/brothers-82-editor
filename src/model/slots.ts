import { SLOT_COUNT } from '../midi/map';

// Slot naming (SPEC.md §3.7, §5.7). Never "Preset 1/2": the pedal's printed labels are reversed relative to Slots.
// With the physical Bank dip on, the preset toggle reaches Slots 3 and 4 instead of 1 and 2.

const TOGGLE_SLOTS: Record<number, { name: string; short: string }> = {
  1: { name: 'Toggle Right', short: 'Toggle R' },
  2: { name: 'Toggle Left', short: 'Toggle L' },
  3: { name: 'Bank · Toggle Left', short: 'Bank · L' },
  4: { name: 'Bank · Toggle Right', short: 'Bank · R' },
};

export const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

/** The Toggle Slots are Slots 1 to this; every Slot after them is reached by MIDI only. */
export const TOGGLE_SLOT_COUNT = Object.keys(TOGGLE_SLOTS).length;

/** Whether `n` numbers a Slot (1–122): PC 0 is Live, and higher values reach no Slot. */
export function isSlot(n: number): boolean {
  return n >= 1 && n <= SLOT_COUNT;
}

export function isToggleSlot(slot: number): boolean {
  return slot in TOGGLE_SLOTS;
}

/** Where a Slot is reached from: its toggle position (and the Bank dip), or MIDI only. */
export function slotReach(slot: number): string {
  return TOGGLE_SLOTS[slot]?.name ?? 'MIDI only';
}

/** The short form for the Toggle Slot tiles, e.g. "Toggle R" or "Bank · L". */
export function slotReachShort(slot: number): string {
  return TOGGLE_SLOTS[slot]?.short ?? 'MIDI only';
}

/** Two-digit Slot number, e.g. "05". */
export function slotNumber(slot: number): string {
  return String(slot).padStart(2, '0');
}

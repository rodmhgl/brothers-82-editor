import { describe, expect, it } from 'vitest';
import type { Preset } from './schema';
import { EMPTY_SLOT_MAP, forgetSlot, isChangedSinceStored, recordStore, slotName, type SlotMapEntry } from './slotMap';
import { defaultWorkingState } from './state';

const snapshot = { ...defaultWorkingState(), vol2: 90 };

const entry = (over: Partial<SlotMapEntry> = {}): SlotMapEntry => ({
  slot: 5,
  snapshot,
  presetId: 'shimmer',
  name: 'Shimmer Tape',
  writtenAt: '2026-10-05T10:00:00.000Z',
  ...over,
});

const preset = (over: Partial<Preset> = {}): Preset => ({
  id: 'shimmer',
  name: 'Shimmer Tape',
  notes: '',
  createdAt: '2026-10-01T10:00:00.000Z',
  modifiedAt: '2026-10-01T10:00:00.000Z',
  params: snapshot,
  ...over,
});

describe('Slot Map', () => {
  it('starts knowing no Slot', () => {
    expect(EMPTY_SLOT_MAP).toEqual({});
  });

  it('records a store, replacing what the Slot held and leaving other Slots alone', () => {
    const other = entry({ slot: 6 });
    const map = recordStore(recordStore({ 6: other }, entry({ name: 'Old' })), entry());
    expect(map).toEqual({ 5: entry(), 6: other });
  });

  it('forgets a Slot, leaving the others', () => {
    const other = entry({ slot: 6 });
    expect(forgetSlot({ 5: entry(), 6: other }, 5)).toEqual({ 6: other });
  });
});

describe('changed since stored', () => {
  it('is false while the linked Preset still has the snapshot’s params', () => {
    expect(isChangedSinceStored(entry(), preset())).toBe(false);
  });

  it('is true once the linked Preset’s params differ', () => {
    expect(isChangedSinceStored(entry(), preset({ params: { ...snapshot, vol2: 10 } }))).toBe(true);
  });

  it('ignores a rename or notes edit', () => {
    expect(isChangedSinceStored(entry(), preset({ name: 'Renamed', notes: 'Big wash' }))).toBe(false);
  });

  it('is false with no linked Preset, or once it has been deleted', () => {
    expect(isChangedSinceStored(entry({ presetId: undefined }), undefined)).toBe(false);
    expect(isChangedSinceStored(entry(), undefined)).toBe(false);
  });
});

describe('Slot name', () => {
  it('follows the linked Preset’s current name', () => {
    expect(slotName(entry(), preset({ name: 'Renamed' }))).toBe('Renamed');
  });

  it('keeps the name it was stored with once the Preset has been deleted', () => {
    expect(slotName(entry(), undefined)).toBe('Shimmer Tape');
  });
});

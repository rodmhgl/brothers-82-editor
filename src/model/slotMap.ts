import type { PresetParamId } from '../midi/map';
import type { Preset } from './schema';
import type { WorkingState } from './state';

// The Slot Map: the editor's belief about what each Slot holds (SPEC.md §5.7). The pedal never confirms it.

/**
 * What the editor last stored in a Slot. `presetId` links the Preset it came from, if any; `name` is that
 * Preset's name when stored (or "Untitled"), kept so the Slot still has a name once the Preset is deleted.
 */
export type SlotMapEntry = { slot: number; snapshot: WorkingState; presetId?: string; name: string; writtenAt: string };

/** Where a stored Working State came from: its Preset, if any, and its name (or "Untitled"). */
export type SlotOrigin = { presetId: string | null; name: string };

/** Slot number → entry. A Slot with no entry is one the editor knows nothing about. */
export type SlotMap = Partial<Record<number, SlotMapEntry>>;

export const EMPTY_SLOT_MAP: SlotMap = {};

/** The Slot Map after storing `entry` in its Slot. */
export function recordStore(map: SlotMap, entry: SlotMapEntry): SlotMap {
  return { ...map, [entry.slot]: entry };
}

/** The Slot Map once the editor no longer knows what `slot` holds. */
export function forgetSlot(map: SlotMap, slot: number): SlotMap {
  const { [slot]: _, ...rest } = map;
  return rest;
}

/**
 * Whether the linked Preset's params have moved on since the Slot was stored: the Slot then offers a re-store.
 * A rename or notes edit doesn't count. `preset` is the linked Preset, or undefined if there is none (or it was deleted).
 */
export function isChangedSinceStored(entry: SlotMapEntry, preset: Preset | undefined): boolean {
  if (!preset) return false;
  return (Object.keys(entry.snapshot) as PresetParamId[]).some((id) => preset.params[id] !== entry.snapshot[id]);
}

/** The linked Preset's current name, or the name the Slot was stored with. */
export function slotName(entry: SlotMapEntry, preset: Preset | undefined): string {
  return preset?.name ?? entry.name;
}

import type { SlotInfo } from '../store/library';

// How a Slot the Slot Map knows is named and marked, wherever Slots are listed.

export const CHANGED_SINCE_STORED = 'changed since stored';

/** What screen readers hear after a Slot's number and reach: its name, and whether it has changed since stored. */
export function slotLabelSuffix(info: SlotInfo | undefined): string {
  if (!info) return '';
  return ` · ${info.name}${info.changed ? `, ${CHANGED_SINCE_STORED}` : ''}`;
}

/** Shown after a Slot's name when its Preset has changed since it was stored. */
export function ChangedMarker() {
  return (
    <span className="changed-marker" title={`Its Preset has ${CHANGED_SINCE_STORED}: re-store it from the Slots tab`}>
      {' '}
      ↻
    </span>
  );
}

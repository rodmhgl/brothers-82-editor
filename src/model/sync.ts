// How far the editor trusts that the Working State matches the pedal (SPEC.md §5.2).
// The pedal sends no MIDI, so these rules are all the editor has.

export type SyncStatus = 'inSync' | 'possiblyStale' | 'unknown';

/** What can move the Sync Status. */
export type SyncEvent =
  | 'sendAll'
  /** The editor has started, from defaults or the last session. */
  | 'launch'
  | 'reconnect'
  | 'live'
  | 'edit'
  /** A Slot recalled whose Slot Map entry the Working State now is. */
  | 'recallKnown'
  /** A Slot recalled that the Slot Map has no entry for. */
  | 'recallUnknown'
  /** A whole new Working State (a recalled Preset, or New): the pedal lags behind it until Send All finishes. */
  | 'loaded';

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  inSync: 'In Sync',
  possiblyStale: 'Possibly Stale',
  unknown: 'Unknown',
};

/** On launch the pedal may hold anything. */
export const INITIAL_SYNC_STATUS: SyncStatus = 'possiblyStale';

export function nextSyncStatus(status: SyncStatus, event: SyncEvent): SyncStatus {
  switch (event) {
    case 'sendAll':
    // The Slot holds what the editor last stored there, and the Working State is now that snapshot.
    case 'recallKnown':
      return 'inSync';
    case 'launch':
    case 'reconnect':
    // Live follows the physical knobs, and a newly loaded Working State hasn't reached the pedal yet: neither is the
    // Working State.
    case 'live':
    case 'loaded':
      return 'possiblyStale';
    case 'edit':
      // A single edit only fixes one control, so it can never earn trust it didn't have.
      return status;
    case 'recallUnknown':
      return 'unknown';
  }
}

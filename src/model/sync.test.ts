import { describe, expect, it } from 'vitest';
import { INITIAL_SYNC_STATUS, nextSyncStatus, type SyncStatus } from './sync';

const ALL: SyncStatus[] = ['inSync', 'possiblyStale', 'unknown'];

describe('Sync Status', () => {
  it('is Possibly Stale on launch', () => {
    expect(INITIAL_SYNC_STATUS).toBe('possiblyStale');
  });

  it.each(ALL)('becomes Possibly Stale on launch from the last session’s %s', (status) => {
    expect(nextSyncStatus(status, 'launch')).toBe('possiblyStale');
  });

  it.each(ALL)('becomes In Sync after Send All from %s', (status) => {
    expect(nextSyncStatus(status, 'sendAll')).toBe('inSync');
  });

  it.each(ALL)('becomes Possibly Stale on reconnect from %s', (status) => {
    expect(nextSyncStatus(status, 'reconnect')).toBe('possiblyStale');
  });

  it.each(ALL)('becomes Possibly Stale after going Live from %s', (status) => {
    expect(nextSyncStatus(status, 'live')).toBe('possiblyStale');
  });

  it.each(ALL)('becomes Possibly Stale when a whole Working State is loaded, until it is sent, from %s', (status) => {
    expect(nextSyncStatus(status, 'loaded')).toBe('possiblyStale');
  });

  it.each(ALL)('stays %s after a single edit', (status) => {
    expect(nextSyncStatus(status, 'edit')).toBe(status);
  });

  it.each(ALL)('becomes In Sync after recalling a Slot the Slot Map knows from %s', (status) => {
    expect(nextSyncStatus(status, 'recallKnown')).toBe('inSync');
  });

  it.each(ALL)('becomes Unknown after recalling a Slot the Slot Map doesn’t know from %s', (status) => {
    expect(nextSyncStatus(status, 'recallUnknown')).toBe('unknown');
  });
});

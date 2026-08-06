import { get, set } from 'idb-keyval';

export interface SyncStateItem {
  lastModified: number;
  size: number;
  md5Hash: string;
  driveId: string;
}

// Map of filePath (relative to root) to its SyncStateItem
export type SyncStateMap = Record<string, SyncStateItem>;

const SYNC_STATE_KEY = 'omnisync_local_state';

/** Retrieves the local sync state from IndexedDB */
export async function getSyncState(): Promise<SyncStateMap> {
  try {
    const state = await get<SyncStateMap>(SYNC_STATE_KEY);
    return state || {};
  } catch (err) {
    console.warn('Failed to load sync state', err);
    return {};
  }
}

/** Saves the local sync state to IndexedDB */
export async function saveSyncState(state: SyncStateMap): Promise<void> {
  try {
    await set(SYNC_STATE_KEY, state);
  } catch (err) {
    console.warn('Failed to save sync state', err);
  }
}

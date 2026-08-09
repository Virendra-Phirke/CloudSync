import { get, set, del, keys } from 'idb-keyval';

export interface SyncStateItem {
  lastModified: number;
  size: number;
  md5Hash: string;
  driveId: string;
}

// Map of filePath (relative to root) to its SyncStateItem
export type SyncStateMap = Record<string, SyncStateItem>;

// ─── Chunked storage ────────────────────────────────────────────────────────
// State is sharded by first path segment so individual writes are small.
// Key format: `omnisync_state_chunk:<segment>`
// A path like "photos/vacation/img.jpg" maps to chunk key "photos".
// Top-level files use chunk key "__root__".

const CHUNK_PREFIX = 'omnisync_state_chunk:';
const ROOT_CHUNK = '__root__';

// Legacy key for migration
const LEGACY_KEY = 'omnisync_local_state';

function chunkKeyForPath(filePath: string): string {
  const firstSlash = filePath.indexOf('/');
  const segment = firstSlash > 0 ? filePath.substring(0, firstSlash) : ROOT_CHUNK;
  return CHUNK_PREFIX + segment;
}

// ─── Migration ──────────────────────────────────────────────────────────────

async function migrateLegacyState(): Promise<void> {
  try {
    const legacy: SyncStateMap | undefined = await get(LEGACY_KEY);
    if (!legacy || Object.keys(legacy).length === 0) return;

    // Group by chunk key
    const chunks = new Map<string, SyncStateMap>();
    for (const [path, item] of Object.entries(legacy)) {
      const key = chunkKeyForPath(path);
      if (!chunks.has(key)) chunks.set(key, {});
      chunks.get(key)![path] = item;
    }

    // Write all chunks
    for (const [key, data] of chunks.entries()) {
      await set(key, data);
    }

    // Remove legacy blob
    await del(LEGACY_KEY);
    console.log(`[SyncState] Migrated ${Object.keys(legacy).length} entries into ${chunks.size} chunks`);
  } catch {
    // Migration failed silently
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Retrieves the full sync state by merging all chunks. Auto-migrates legacy data. */
export async function getSyncState(): Promise<SyncStateMap> {
  try {
    // Check for legacy data first
    await migrateLegacyState();

    const allKeys = await keys();
    const chunkKeys = (allKeys as string[]).filter(k => typeof k === 'string' && k.startsWith(CHUNK_PREFIX));

    if (chunkKeys.length === 0) return {};

    const merged: SyncStateMap = {};
    const chunks = await Promise.all(chunkKeys.map(k => get<SyncStateMap>(k)));

    for (const chunk of chunks) {
      if (chunk) Object.assign(merged, chunk);
    }

    return merged;
  } catch (err) {
    console.warn('Failed to load sync state', err);
    return {};
  }
}

/** Saves the entire sync state (re-shards into chunks). Use for bulk operations. */
export async function saveSyncState(state: SyncStateMap): Promise<void> {
  try {
    // Group by chunk key
    const chunks = new Map<string, SyncStateMap>();
    for (const [path, item] of Object.entries(state)) {
      const key = chunkKeyForPath(path);
      if (!chunks.has(key)) chunks.set(key, {});
      chunks.get(key)![path] = item;
    }

    // Write all chunks in parallel
    await Promise.all(
      Array.from(chunks.entries()).map(([key, data]) => set(key, data))
    );
  } catch (err) {
    console.warn('Failed to save sync state', err);
  }
}

/**
 * Saves a single entry efficiently — only touches the affected chunk.
 * Much faster than saveSyncState() for incremental updates.
 */
export async function saveSyncStateEntry(filePath: string, item: SyncStateItem): Promise<void> {
  try {
    const key = chunkKeyForPath(filePath);
    const chunk: SyncStateMap = (await get<SyncStateMap>(key)) || {};
    chunk[filePath] = item;
    await set(key, chunk);
  } catch (err) {
    console.warn('Failed to save sync state entry', err);
  }
}

/**
 * Saves a batch of entries efficiently — groups by chunk and writes each affected chunk once.
 */
export async function saveSyncStateBatch(entries: Record<string, SyncStateItem>): Promise<void> {
  try {
    // Group entries by chunk key
    const affectedChunks = new Map<string, Record<string, SyncStateItem>>();
    for (const [path, item] of Object.entries(entries)) {
      const key = chunkKeyForPath(path);
      if (!affectedChunks.has(key)) affectedChunks.set(key, {});
      affectedChunks.get(key)![path] = item;
    }

    // Read, merge, and write each chunk
    await Promise.all(
      Array.from(affectedChunks.entries()).map(async ([key, newEntries]) => {
        const existing: SyncStateMap = (await get<SyncStateMap>(key)) || {};
        Object.assign(existing, newEntries);
        await set(key, existing);
      })
    );
  } catch (err) {
    console.warn('Failed to save sync state batch', err);
  }
}

/** Removes a specific file from the sync state — only touches the affected chunk. */
export async function removeSyncState(filePath: string): Promise<void> {
  try {
    const key = chunkKeyForPath(filePath);
    const chunk: SyncStateMap = (await get<SyncStateMap>(key)) || {};
    if (chunk[filePath]) {
      delete chunk[filePath];
      if (Object.keys(chunk).length === 0) {
        await del(key);
      } else {
        await set(key, chunk);
      }
    }
  } catch (err) {
    console.warn('Failed to remove sync state entry', err);
  }
}

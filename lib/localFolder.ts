'use client';
import { get, set, del } from 'idb-keyval';
import ignore, { Ignore } from 'ignore';

// Legacy keys (for migration)
const LEGACY_HANDLE_KEY = 'local_sync_folder_handle';
const LEGACY_INFO_KEY   = 'local_sync_folder_info';

// New multi-folder key
const FOLDERS_KEY = 'local_sync_folders';

export interface FolderInfo {
  name: string;
  savedAt: number;
}

export interface SyncFolder {
  id: string;
  name: string;
  savedAt: number;
}

export interface SyncFolderEntry {
  id: string;
  handle: FileSystemDirectoryHandle;
  info: SyncFolder;
}

export interface LocalFile {
  /** Unique key within the folder (relative path) */
  id: string;
  name: string;
  path: string;      // relative path from root of selected folder
  size: number;      // bytes; 0 for directories
  lastModified: number;
  mimeType: string;
  isDirectory: boolean;
  /** The native file system handle, used to retrieve the actual File object later */
  handle?: any; // FileSystemFileHandle | FileSystemDirectoryHandle
}

export interface FolderStats {
  fileCount: number;
  dirCount: number;
  totalSize: number; // bytes
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Calculates the MD5 hash of a local file by reading it in chunks.
 * This matches Google Drive's md5Checksum format (hex).
 */
export async function calculateFileHash(file: File): Promise<string> {
  // Dynamic import so spark-md5 isn't loaded unless needed
  const SparkMD5 = (await import('spark-md5')).default;
  
  return new Promise((resolve, reject) => {
    const chunkSize = 2097152; // 2MB
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      if (e.target?.result) {
        spark.append(e.target.result as ArrayBuffer);
      }
      currentChunk++;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error('Failed to read file for hashing'));
    };

    function loadNext() {
      const start = currentChunk * chunkSize;
      const end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
      fileReader.readAsArrayBuffer(file.slice(start, end));
    }

    loadNext();
  });
}

// ─── Migration ────────────────────────────────────────────────────────────────

/** Migrate legacy single-folder data to new multi-folder format */
async function migrateLegacyFolder(): Promise<void> {
  try {
    const legacyHandle: FileSystemDirectoryHandle | undefined = await get(LEGACY_HANDLE_KEY);
    const legacyInfo: FolderInfo | undefined = await get(LEGACY_INFO_KEY);
    
    if (legacyHandle && legacyInfo) {
      const entry: SyncFolderEntry = {
        id: `folder-${Date.now()}`,
        handle: legacyHandle,
        info: {
          id: `folder-${Date.now()}`,
          name: legacyInfo.name,
          savedAt: legacyInfo.savedAt,
        },
      };
      entry.info.id = entry.id;
      await set(FOLDERS_KEY, [entry]);
      // Clean up legacy keys
      await del(LEGACY_HANDLE_KEY);
      await del(LEGACY_INFO_KEY);
    }
  } catch {
    // Migration failed silently — no legacy data or corrupted
  }
}

// ─── Multi-Folder CRUD ───────────────────────────────────────────────────────

/** Get all stored folder entries. Auto-migrates legacy data on first call. */
export async function getLocalFolders(): Promise<SyncFolderEntry[]> {
  try {
    let folders: SyncFolderEntry[] | undefined = await get(FOLDERS_KEY);
    
    // Try migration if no folders found
    if (!folders || folders.length === 0) {
      await migrateLegacyFolder();
      folders = await get(FOLDERS_KEY);
    }
    
    return folders || [];
  } catch {
    return [];
  }
}

/** Get folder infos without requiring permission (lightweight, for UI). */
export async function getLocalFolderInfos(): Promise<SyncFolder[]> {
  const folders = await getLocalFolders();
  return folders.map(f => f.info);
}

/** Get a specific folder entry by ID, re-requesting permission if needed. */
export async function getLocalFolderById(id: string): Promise<SyncFolderEntry | null> {
  const folders = await getLocalFolders();
  const entry = folders.find(f => f.id === id);
  if (!entry) return null;

  try {
    let perm = await (entry.handle as any).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? entry : null;
  } catch {
    return null;
  }
}

/** Prompts user to pick a directory and adds it to the folder list. */
export async function addLocalFolder(): Promise<SyncFolderEntry | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'Your browser does not support the File System Access API. Please use Chrome or Edge.'
    );
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: SyncFolderEntry = {
      id,
      handle,
      info: { id, name: handle.name, savedAt: Date.now() },
    };
    
    const existing = await getLocalFolders();
    // Check if folder already exists (by name — handles can't be compared)
    const alreadyExists = existing.some(f => f.info.name === handle.name);
    if (alreadyExists) {
      throw new Error(`Folder "${handle.name}" is already added.`);
    }
    
    existing.push(entry);
    await set(FOLDERS_KEY, existing);
    return entry;
  } catch (err: any) {
    if (err.name === 'AbortError') return null; // user cancelled
    throw err;
  }
}

/** Remove a folder from the list by ID. */
export async function removeLocalFolder(id: string): Promise<void> {
  const existing = await getLocalFolders();
  const filtered = existing.filter(f => f.id !== id);
  await set(FOLDERS_KEY, filtered);
}

/** Clear all folder entries. */
export async function clearAllLocalFolders(): Promise<void> {
  await del(FOLDERS_KEY);
  // Also clean legacy keys if they exist
  await del(LEGACY_HANDLE_KEY);
  await del(LEGACY_INFO_KEY);
}

// ─── Backward Compat (single-folder access for simpler consumers) ────────────

/** Returns the first folder's handle, for backward compatibility. */
export async function getLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  const folders = await getLocalFolders();
  if (folders.length === 0) return null;
  
  const entry = folders[0];
  try {
    let perm = await (entry.handle as any).queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await (entry.handle as any).requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? entry.handle : null;
  } catch {
    return null;
  }
}

/** Returns info for the first folder (backward compat). */
export async function getLocalFolderInfo(): Promise<FolderInfo | null> {
  const folders = await getLocalFolders();
  if (folders.length === 0) return null;
  return { name: folders[0].info.name, savedAt: folders[0].info.savedAt };
}

/** Legacy: prompts user and sets as the ONLY folder. Use addLocalFolder() instead. */
export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  const entry = await addLocalFolder();
  return entry ? entry.handle : null;
}

/** Legacy: clears all folders. */
export async function clearLocalFolder(): Promise<void> {
  await clearAllLocalFolders();
}

// ─── File Reading ─────────────────────────────────────────────────────────────

const MAX_DEPTH = 5;

/**
 * Reads children of a directory handle recursively up to MAX_DEPTH.
 * Returns both files and sub-directories as LocalFile entries.
 */

export async function readFolderFiles(
  handle: FileSystemDirectoryHandle,
  prefix = '',
  depth = 0,
  ig?: Ignore
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];
  if (depth > MAX_DEPTH) return results;

  // At root, check for .syncignore
  let currentIg = ig;
  if (depth === 0) {
    currentIg = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']); // default ignores
    try {
      const ignoreHandle = await handle.getFileHandle('.syncignore');
      const ignoreFile = await ignoreHandle.getFile();
      const text = await ignoreFile.text();
      currentIg.add(text);
    } catch {
      // no .syncignore file, that's fine
    }
  }

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    
    if (currentIg && currentIg.ignores(path)) {
      continue; // Skip ignored files/folders
    }

    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        results.push({
          id: path,
          name,
          path,
          size: file.size,
          lastModified: file.lastModified,
          mimeType: file.type || 'application/octet-stream',
          isDirectory: false,
          handle: entry,
        });
      } catch {
        // Skip unreadable files
      }
    } else if (entry.kind === 'directory') {
      results.push({
        id: path,
        name,
        path,
        size: 0,
        lastModified: Date.now(),
        mimeType: 'application/vnd.google-apps.folder',
        isDirectory: true,
        handle: entry,
      });
      // Recursively read subdirectories
      try {
        const subFiles = await readFolderFiles(entry as FileSystemDirectoryHandle, path, depth + 1, currentIg);
        results.push(...subFiles);
      } catch {
        // Skip unreadable directories
      }
    }
  }

  // Sort: folders first, then files alphabetically
  if (depth === 0) {
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }

  return results;
}

/**
 * Computes aggregate stats for the folder recursively.
 */
export async function getFolderStats(
  handle: FileSystemDirectoryHandle,
  depth = 0,
  prefix = '',
  ig?: Ignore
): Promise<FolderStats> {
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;

  if (depth > MAX_DEPTH) return { fileCount, dirCount, totalSize };

  let currentIg = ig;
  if (depth === 0) {
    currentIg = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']);
    try {
      const ignoreHandle = await handle.getFileHandle('.syncignore');
      const ignoreFile = await ignoreHandle.getFile();
      const text = await ignoreFile.text();
      currentIg.add(text);
    } catch {}
  }

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    
    if (currentIg && currentIg.ignores(path)) {
      continue;
    }

    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        fileCount++;
        totalSize += file.size;
      } catch {}
    } else if (entry.kind === 'directory') {
      dirCount++;
      try {
        const subStats = await getFolderStats(entry as FileSystemDirectoryHandle, depth + 1, path, currentIg);
        fileCount += subStats.fileCount;
        dirCount += subStats.dirCount;
        totalSize += subStats.totalSize;
      } catch {}
    }
  }

  return { fileCount, dirCount, totalSize };
}

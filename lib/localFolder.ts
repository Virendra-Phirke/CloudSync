'use client';
import { get, set, del } from 'idb-keyval';

const HANDLE_KEY = 'local_sync_folder_handle';
const INFO_KEY   = 'local_sync_folder_info';

export interface FolderInfo {
  name: string;
  savedAt: number;
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

/** Prompts the user to pick a local directory; persists the handle to idb-keyval. */
export async function pickLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error(
      'Your browser does not support the File System Access API. Please use Chrome or Edge.'
    );
  }
  try {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await set(HANDLE_KEY, handle);
    const info: FolderInfo = { name: handle.name, savedAt: Date.now() };
    await set(INFO_KEY, info);
    return handle;
  } catch (err: any) {
    if (err.name === 'AbortError') return null; // user cancelled
    throw err;
  }
}

/** Returns the persisted directory handle (re-requesting permission if needed). */
export async function getLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle: FileSystemDirectoryHandle | undefined = await get(HANDLE_KEY);
    if (!handle) return null;

    // Check / request read permission
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

/** Returns the saved folder metadata (name + timestamp) WITHOUT requiring permission. */
export async function getLocalFolderInfo(): Promise<FolderInfo | null> {
  try {
    return (await get(INFO_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Clears the persisted folder handle and info. */
export async function clearLocalFolder(): Promise<void> {
  await del(HANDLE_KEY);
  await del(INFO_KEY);
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
  depth = 0
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];
  if (depth > MAX_DEPTH) return results;

  for await (const [name, entry] of (handle as any).entries()) {
    const path = prefix ? `${prefix}/${name}` : name;

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
        const subFiles = await readFolderFiles(entry as FileSystemDirectoryHandle, path, depth + 1);
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
  depth = 0
): Promise<FolderStats> {
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;

  if (depth > MAX_DEPTH) return { fileCount, dirCount, totalSize };

  for await (const [, entry] of (handle as any).entries()) {
    if (entry.kind === 'file') {
      try {
        const file: File = await entry.getFile();
        fileCount++;
        totalSize += file.size;
      } catch {}
    } else if (entry.kind === 'directory') {
      dirCount++;
      try {
        const subStats = await getFolderStats(entry as FileSystemDirectoryHandle, depth + 1);
        fileCount += subStats.fileCount;
        dirCount += subStats.dirCount;
        totalSize += subStats.totalSize;
      } catch {}
    }
  }

  return { fileCount, dirCount, totalSize };
}

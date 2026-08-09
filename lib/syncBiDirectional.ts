import { LocalFile, readFolderFiles, calculateFileHash } from './localFolder';
import { findOrCreateDriveFolder, uploadFileToDrive, getDriveFileByName, updateDriveFile, fetchDriveFilesByParent, getDriveFileBlob, DriveFile } from './drive';
import { getSyncState, saveSyncStateBatch, SyncStateMap, SyncStateItem } from './syncState';
import ignore from 'ignore';

export interface ConflictItem {
  path: string;
  localLastModified: number;
  driveLastModified: number;
}

// ─── Concurrency pool ───────────────────────────────────────────────────────

const CONCURRENCY = 6;
const BATCH_SAVE_INTERVAL = 50; // Save state every N processed files

/**
 * Runs async tasks with a bounded concurrency limit.
 * Returns after ALL tasks have settled.
 */
async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  let idx = 0;
  let completed = 0;
  const total = tasks.length;
  const errors: Error[] = [];

  async function runNext(): Promise<void> {
    while (idx < total) {
      const currentIdx = idx++;
      try {
        await tasks[currentIdx]();
      } catch (err: any) {
        errors.push(err);
        console.error(`[SyncPool] Task ${currentIdx} failed:`, err.message);
      }
      completed++;
      onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runNext());
  await Promise.all(workers);

  if (errors.length > 0) {
    console.warn(`[SyncPool] ${errors.length}/${total} tasks failed`);
  }
}

// ─── Sync Engine ────────────────────────────────────────────────────────────

export async function syncBiDirectional(
  localRootHandle: FileSystemDirectoryHandle,
  onProgress?: (msg: string) => void,
  onConflict?: (conflicts: ConflictItem[]) => Promise<'local' | 'drive' | 'skip'>
) {
  onProgress?.('Loading local sync state...');
  const syncState: SyncStateMap = await getSyncState();

  onProgress?.(`Ensuring root folder "${localRootHandle.name}" exists in Drive...`);
  const rootResult = await findOrCreateDriveFolder(localRootHandle.name, 'root');
  
  // Pending state entries to flush in batches
  let pendingState: Record<string, SyncStateItem> = {};
  let pendingCount = 0;

  async function flushState() {
    if (Object.keys(pendingState).length === 0) return;
    await saveSyncStateBatch(pendingState);
    // Merge into local copy so subsequent lookups see updated data
    Object.assign(syncState, pendingState);
    pendingState = {};
  }

  function queueStateUpdate(path: string, item: SyncStateItem) {
    pendingState[path] = item;
    syncState[path] = item; // update local copy immediately
    pendingCount++;
    // Auto-flush every BATCH_SAVE_INTERVAL entries
    if (pendingCount % BATCH_SAVE_INTERVAL === 0) {
      flushState(); // fire-and-forget — we await at end
    }
  }
  
  // Setup ignore rules
  const ig = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']);
  try {
    const ignoreHandle = await localRootHandle.getFileHandle('.syncignore');
    const ignoreFile = await ignoreHandle.getFile();
    ig.add(await ignoreFile.text());
  } catch {}

  let totalFilesProcessed = 0;

  async function syncDirectory(
    localDirHandle: FileSystemDirectoryHandle,
    driveDirId: string,
    currentPath: string
  ) {
    onProgress?.(`Scanning folder: ${currentPath || 'Root'}`);

    // 1. Get local files & folders in this directory ONLY (depth 0)
    const localEntries: Map<string, any> = new Map();
    for await (const [name, handle] of (localDirHandle as any).entries()) {
      const fullPath = currentPath ? `${currentPath}/${name}` : name;
      if (ig.ignores(fullPath)) continue;
      localEntries.set(name, { handle, name, fullPath, isDir: handle.kind === 'directory' });
    }

    // 2. Get Drive files & folders
    const driveEntries = await fetchDriveFilesByParent(driveDirId);
    const driveMap = new Map<string, DriveFile & { md5Checksum?: string }>();
    for (const d of driveEntries) {
      driveMap.set(d.name, d);
    }

    // 3. Collect file sync tasks (non-directory entries)
    const fileTasks: (() => Promise<void>)[] = [];
    const dirTasks: { name: string; localInfo: any; driveId: string }[] = [];

    for (const [name, localInfo] of localEntries.entries()) {
      if (localInfo.isDir) {
        // Find or create drive folder — do this sequentially to avoid races
        let nextDriveId = driveMap.get(name)?.id;
        if (!nextDriveId) {
          onProgress?.(`Creating Drive folder: ${localInfo.fullPath}`);
          const res = await findOrCreateDriveFolder(name, driveDirId);
          nextDriveId = res.id;
        }
        dirTasks.push({ name, localInfo, driveId: nextDriveId });
      } else {
        const driveFile = driveMap.get(name);
        const cachedState = syncState[localInfo.fullPath];

        fileTasks.push(async () => {
          totalFilesProcessed++;
          const fileHandle = localInfo.handle;
          const file = await fileHandle.getFile();

          if (!driveFile) {
            // Local Only -> Upload
            onProgress?.(`[${totalFilesProcessed}] Uploading: ${localInfo.fullPath}`);
            const localHash = await calculateFileHash(file);
            const uploaded = await uploadFileToDrive(file, driveDirId);
            queueStateUpdate(localInfo.fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: uploaded.id });
          } else {
            // Exists in both -> Compare
            const localTime = file.lastModified;
            const driveTime = new Date(driveFile.modifiedTime).getTime();
            
            if (cachedState) {
              const localChanged = localTime > cachedState.lastModified;
              const driveChanged = driveTime > cachedState.lastModified;

              if (localChanged && !driveChanged) {
                onProgress?.(`[${totalFilesProcessed}] Updating Drive: ${localInfo.fullPath}`);
                const localHash = await calculateFileHash(file);
                const updated = await updateDriveFile(driveFile.id, file);
                queueStateUpdate(localInfo.fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id });
              } else if (driveChanged && !localChanged) {
                onProgress?.(`[${totalFilesProcessed}] Downloading: ${localInfo.fullPath}`);
                const blob = await getDriveFileBlob(driveFile.id);
                const writable = await (fileHandle as any).createWritable();
                await writable.write(blob);
                await writable.close();
                const newFile = await fileHandle.getFile();
                queueStateUpdate(localInfo.fullPath, { lastModified: newFile.lastModified, size: newFile.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id });
              } else if (localChanged && driveChanged) {
                // CONFLICT
                if (onConflict) {
                  const resolution = await onConflict([{ path: localInfo.fullPath, localLastModified: localTime, driveLastModified: driveTime }]);
                  if (resolution === 'local') {
                    const localHash = await calculateFileHash(file);
                    const updated = await updateDriveFile(driveFile.id, file);
                    queueStateUpdate(localInfo.fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id });
                  } else if (resolution === 'drive') {
                    const blob = await getDriveFileBlob(driveFile.id);
                    const writable = await (fileHandle as any).createWritable();
                    await writable.write(blob);
                    await writable.close();
                    const newFile = await fileHandle.getFile();
                    queueStateUpdate(localInfo.fullPath, { lastModified: newFile.lastModified, size: newFile.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id });
                  }
                }
              }
              // else: neither changed — skip
            } else {
              // No cache — compare hashes
              const localHash = await calculateFileHash(file);
              if (localHash !== driveFile.md5Checksum) {
                onProgress?.(`[${totalFilesProcessed}] Updating Drive: ${localInfo.fullPath}`);
                const updated = await updateDriveFile(driveFile.id, file);
                queueStateUpdate(localInfo.fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id });
              } else {
                queueStateUpdate(localInfo.fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: driveFile.id });
              }
            }
          }
        });
      }
    }

    // 4. Process Drive-only entries (files/folders that exist on Drive but not locally)
    for (const [name, driveFile] of driveMap.entries()) {
      if (!localEntries.has(name)) {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;
        if (ig.ignores(fullPath)) continue;

        if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
          // Download Folder — add to dirTasks
          onProgress?.(`Creating local folder: ${fullPath}`);
          const newLocalDir = await localDirHandle.getDirectoryHandle(name, { create: true });
          dirTasks.push({ name, localInfo: { handle: newLocalDir, fullPath, isDir: true }, driveId: driveFile.id });
        } else {
          // Download File
          fileTasks.push(async () => {
            totalFilesProcessed++;
            onProgress?.(`[${totalFilesProcessed}] Downloading: ${fullPath}`);
            const blob = await getDriveFileBlob(driveFile.id);
            const newFileHandle = await localDirHandle.getFileHandle(name, { create: true });
            const writable = await (newFileHandle as any).createWritable();
            await writable.write(blob);
            await writable.close();
            const file = await (newFileHandle as any).getFile();
            queueStateUpdate(fullPath, { lastModified: file.lastModified, size: file.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id });
          });
        }
      }
    }

    // 5. Run file tasks concurrently
    if (fileTasks.length > 0) {
      onProgress?.(`Syncing ${fileTasks.length} file(s) in ${currentPath || 'Root'}...`);
      await runPool(fileTasks, CONCURRENCY, (done, total) => {
        if (done % 10 === 0 || done === total) {
          onProgress?.(`[${currentPath || 'Root'}] ${done}/${total} files processed`);
        }
      });
    }

    // 6. Recurse into subdirectories (sequential to avoid overwhelming the API)
    for (const dir of dirTasks) {
      await syncDirectory(dir.localInfo.handle, dir.driveId, dir.localInfo.fullPath);
    }
  }

  await syncDirectory(localRootHandle, rootResult.id, '');

  // Final flush of any remaining pending state
  await flushState();

  onProgress?.('Sync complete!');
}

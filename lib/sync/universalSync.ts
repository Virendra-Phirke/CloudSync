/**
 * Universal Multi-Cloud Sync Engine
 * Fully decoupled from specific cloud APIs; operates through CloudProvider interface.
 */

import { CloudProvider, CloudItem } from '../providers/types';
import { SyncEndpoint, SyncJobOptions, ConflictItem, ConflictResolution } from './syncTypes';
import { getSyncState, saveSyncStateBatch, SyncStateItem, SyncStateMap } from '../syncState';
import { calculateFileHash } from '../localFolder';
import ignore from 'ignore';

const CONCURRENCY = 6;
const BATCH_SAVE_INTERVAL = 50;

async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  let idx = 0;
  let completed = 0;
  const total = tasks.length;
  const errors: Error[] = [];

  async function runNext(): Promise<void> {
    while (idx < total) {
      if (abortSignal?.aborted) return;
      const currentIdx = idx++;
      try {
        await tasks[currentIdx]();
      } catch (err: any) {
        errors.push(err);
        console.error(`[UniversalSyncPool] Task ${currentIdx} failed:`, err?.message);
      }
      completed++;
      onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runNext());
  await Promise.all(workers);

  if (errors.length > 0) {
    console.warn(`[UniversalSyncPool] ${errors.length}/${total} tasks failed`);
  }
}

/**
 * Syncs between any combination of Local and Cloud endpoints.
 */
export async function executeUniversalSync(options: SyncJobOptions): Promise<void> {
  const { source, destination, onProgress, onConflict, abortSignal } = options;
  abortSignal?.throwIfAborted();

  // 1. Local <-> Cloud
  if (source.type === 'local' && destination.type === 'cloud') {
    return syncLocalToCloud(source.handle, destination.provider, destination.folderIdOrPath, onProgress, onConflict, abortSignal);
  }

  if (source.type === 'cloud' && destination.type === 'local') {
    return syncCloudToLocal(source.provider, destination.handle, source.folderIdOrPath, onProgress, onConflict, abortSignal);
  }

  // 2. Cloud <-> Cloud
  if (source.type === 'cloud' && destination.type === 'cloud') {
    return syncCloudToCloud(source.provider, destination.provider, source.folderIdOrPath, destination.folderIdOrPath, onProgress, abortSignal);
  }

  throw new Error('Local-to-Local sync is not supported');
}

/**
 * Syncs a local folder to a cloud provider
 */
async function syncLocalToCloud(
  localRootHandle: any,
  cloudProvider: CloudProvider,
  destinationFolderIdOrPath = 'root',
  onProgress?: (msg: string) => void,
  onConflict?: (conflicts: ConflictItem[]) => Promise<ConflictResolution>,
  abortSignal?: AbortSignal
) {
  onProgress?.(`Loading sync state for ${cloudProvider.name}...`);
  const syncState: SyncStateMap = await getSyncState();

  onProgress?.(`Ensuring root folder "${localRootHandle.name}" exists in ${cloudProvider.name}...`);
  const rootResult = await cloudProvider.createFolder(localRootHandle.name, destinationFolderIdOrPath);

  let pendingState: Record<string, SyncStateItem> = {};
  let pendingCount = 0;

  async function flushState() {
    if (Object.keys(pendingState).length === 0) return;
    await saveSyncStateBatch(pendingState);
    Object.assign(syncState, pendingState);
    pendingState = {};
  }

  function queueStateUpdate(path: string, item: SyncStateItem) {
    const enriched = {
      ...item,
      driveId: item.remoteId || item.driveId,
      provider: cloudProvider.id,
    };
    pendingState[path] = enriched;
    syncState[path] = enriched;
    pendingCount++;
    if (pendingCount % BATCH_SAVE_INTERVAL === 0) {
      flushState();
    }
  }

  // Parse .syncignore if available
  const ig = ignore().add(['.syncignore']);
  try {
    const ignoreHandle = await localRootHandle.getFileHandle('.syncignore');
    const ignoreFile = await ignoreHandle.getFile();
    ig.add(await ignoreFile.text());
  } catch {}

  let totalFilesProcessed = 0;

  async function syncDir(
    localDirHandle: any,
    cloudParentIdOrPath: string,
    currentPath: string
  ) {
    abortSignal?.throwIfAborted();
    onProgress?.(`Scanning folder: ${currentPath || 'Root'}`);

    // Read local children
    const localEntries = new Map<string, any>();
    for await (const [name, handle] of (localDirHandle as any).entries()) {
      const fullPath = currentPath ? `${currentPath}/${name}` : name;
      if (ig.ignores(fullPath)) continue;
      localEntries.set(name, { handle, name, fullPath, isDir: handle.kind === 'directory' });
    }

    // Read remote children
    const remoteList = await cloudProvider.listFiles({
      folderIdOrPath: cloudParentIdOrPath,
      pageSize: 200,
    });
    const remoteMap = new Map<string, CloudItem>();
    for (const item of remoteList.items) {
      remoteMap.set(item.name, item);
    }

    const fileTasks: (() => Promise<void>)[] = [];
    const dirTasks: { name: string; localInfo: any; cloudId: string }[] = [];

    for (const [name, localInfo] of localEntries.entries()) {
      if (localInfo.isDir) {
        let nextCloudId = remoteMap.get(name)?.id;
        if (!nextCloudId) {
          onProgress?.(`Creating folder: ${localInfo.fullPath}`);
          const res = await cloudProvider.createFolder(name, cloudParentIdOrPath);
          nextCloudId = res.id;
        }
        dirTasks.push({ name, localInfo, cloudId: nextCloudId });
      } else {
        const remoteItem = remoteMap.get(name);
        const cachedState = syncState[localInfo.fullPath];

        fileTasks.push(async () => {
          abortSignal?.throwIfAborted();
          totalFilesProcessed++;
          const fileHandle = localInfo.handle;
          const file: File = await fileHandle.getFile();

          if (cachedState?.provider && cachedState.provider !== cloudProvider.id) {
            // Belongs to another cloud provider, do not sync to this provider!
            return;
          }

          if (!remoteItem) {
            onProgress?.(`[${totalFilesProcessed}] Uploading to ${cloudProvider.name}: ${localInfo.fullPath}`);
            const localHash = await calculateFileHash(file);
            const uploaded = await cloudProvider.uploadFile(file, cloudParentIdOrPath, file.name);
            queueStateUpdate(localInfo.fullPath, {
              lastModified: file.lastModified,
              size: file.size,
              md5Hash: localHash,
              remoteHash: uploaded.contentHash,
              remoteId: uploaded.id,
              driveId: uploaded.id,
              provider: cloudProvider.id,
            });
          } else {
            const localTime = file.lastModified;
            const remoteTime = remoteItem.modifiedTime;

            if (cachedState) {
              const localChanged = localTime > cachedState.lastModified;
              const remoteChanged = remoteTime > cachedState.lastModified;

              if (localChanged && !remoteChanged) {
                onProgress?.(`[${totalFilesProcessed}] Updating ${cloudProvider.name}: ${localInfo.fullPath}`);
                const localHash = await calculateFileHash(file);
                const updated = await cloudProvider.uploadFile(file, cloudParentIdOrPath, file.name);
                queueStateUpdate(localInfo.fullPath, {
                  lastModified: file.lastModified,
                  size: file.size,
                  md5Hash: localHash,
                  remoteHash: updated.contentHash,
                  remoteId: updated.id,
                  driveId: updated.id,
                  provider: cloudProvider.id,
                });
              } else if (remoteChanged && !localChanged) {
                onProgress?.(`[${totalFilesProcessed}] Downloading from ${cloudProvider.name}: ${localInfo.fullPath}`);
                const blob = await cloudProvider.downloadFile(remoteItem.id);
                const writable = await (fileHandle as any).createWritable();
                await writable.write(blob);
                await writable.close();
                const newFile = await fileHandle.getFile();
                queueStateUpdate(localInfo.fullPath, {
                  lastModified: newFile.lastModified,
                  size: newFile.size,
                  md5Hash: remoteItem.contentHash,
                  remoteHash: remoteItem.contentHash,
                  remoteId: remoteItem.id,
                  driveId: remoteItem.id,
                  provider: cloudProvider.id,
                });
              } else if (localChanged && remoteChanged) {
                // Conflict
                if (onConflict) {
                  const resolution = await onConflict([
                    {
                      path: localInfo.fullPath,
                      sourceLastModified: localTime,
                      destinationLastModified: remoteTime,
                      sourceFile: file,
                      destinationId: remoteItem.id,
                      sourceSize: file.size,
                      destinationSize: remoteItem.size,
                      mimeType: remoteItem.mimeType,
                    },
                  ]);

                  if (resolution === 'source') {
                    const localHash = await calculateFileHash(file);
                    const updated = await cloudProvider.uploadFile(file, cloudParentIdOrPath, file.name);
                    queueStateUpdate(localInfo.fullPath, {
                      lastModified: file.lastModified,
                      size: file.size,
                      md5Hash: localHash,
                      remoteHash: updated.contentHash,
                      remoteId: updated.id,
                      driveId: updated.id,
                    });
                  } else if (resolution === 'destination') {
                    const blob = await cloudProvider.downloadFile(remoteItem.id);
                    const writable = await (fileHandle as any).createWritable();
                    await writable.write(blob);
                    await writable.close();
                    const newFile = await fileHandle.getFile();
                    queueStateUpdate(localInfo.fullPath, {
                      lastModified: newFile.lastModified,
                      size: newFile.size,
                      md5Hash: remoteItem.contentHash,
                      remoteHash: remoteItem.contentHash,
                      remoteId: remoteItem.id,
                      driveId: remoteItem.id,
                    });
                  }
                }
              }
            } else {
              // No cached state: Compare file size or content hash
              const localHash = await calculateFileHash(file);
              const hashesMatch = remoteItem.contentHash && remoteItem.contentHash === localHash;
              if (!hashesMatch && remoteItem.size !== file.size) {
                onProgress?.(`[${totalFilesProcessed}] Updating ${cloudProvider.name}: ${localInfo.fullPath}`);
                const updated = await cloudProvider.uploadFile(file, cloudParentIdOrPath, file.name);
                queueStateUpdate(localInfo.fullPath, {
                  lastModified: file.lastModified,
                  size: file.size,
                  md5Hash: localHash,
                  remoteHash: updated.contentHash,
                  remoteId: updated.id,
                  driveId: updated.id,
                });
              } else {
                queueStateUpdate(localInfo.fullPath, {
                  lastModified: file.lastModified,
                  size: file.size,
                  md5Hash: localHash,
                  remoteHash: remoteItem.contentHash,
                  remoteId: remoteItem.id,
                  driveId: remoteItem.id,
                });
              }
            }
          }
        });
      }
    }

    // Process remote-only items
    for (const [name, remoteItem] of remoteMap.entries()) {
      if (!localEntries.has(name)) {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;
        if (ig.ignores(fullPath)) continue;

        if (remoteItem.isDirectory) {
          onProgress?.(`Creating local folder: ${fullPath}`);
          const newLocalDir = await localDirHandle.getDirectoryHandle(name, { create: true });
          dirTasks.push({ name, localInfo: { handle: newLocalDir, fullPath, isDir: true }, cloudId: remoteItem.id });
        } else {
          fileTasks.push(async () => {
            totalFilesProcessed++;
            onProgress?.(`[${totalFilesProcessed}] Downloading: ${fullPath}`);
            const blob = await cloudProvider.downloadFile(remoteItem.id);
            const newFileHandle = await localDirHandle.getFileHandle(name, { create: true });
            const writable = await (newFileHandle as any).createWritable();
            await writable.write(blob);
            await writable.close();
            const file = await (newFileHandle as any).getFile();
            queueStateUpdate(fullPath, {
              lastModified: file.lastModified,
              size: file.size,
              md5Hash: remoteItem.contentHash,
              remoteHash: remoteItem.contentHash,
              remoteId: remoteItem.id,
              driveId: remoteItem.id,
            });
          });
        }
      }
    }

    // Run file tasks concurrently
    if (fileTasks.length > 0) {
      await runPool(fileTasks, CONCURRENCY, (done, total) => {
        if (done % 10 === 0 || done === total) {
          onProgress?.(`[${currentPath || 'Root'}] ${done}/${total} files processed`);
        }
      }, abortSignal);
    }

    // Recurse into subdirectories
    for (const dir of dirTasks) {
      await syncDir(dir.localInfo.handle, dir.cloudId, dir.localInfo.fullPath);
    }
  }

  await syncDir(localRootHandle, rootResult.id, '');
  await flushState();
  onProgress?.('Sync complete!');
}

/**
 * Syncs a cloud provider down to a local directory handle
 */
async function syncCloudToLocal(
  cloudProvider: CloudProvider,
  localRootHandle: any,
  cloudParentIdOrPath = 'root',
  onProgress?: (msg: string) => void,
  onConflict?: (conflicts: ConflictItem[]) => Promise<ConflictResolution>,
  abortSignal?: AbortSignal
) {
  // Bi-directional engine synchronizes both ways; we reuse syncLocalToCloud with destination
  return syncLocalToCloud(localRootHandle, cloudProvider, cloudParentIdOrPath, onProgress, onConflict, abortSignal);
}

/**
 * Syncs between two cloud providers directly
 */
async function syncCloudToCloud(
  sourceProvider: CloudProvider,
  destProvider: CloudProvider,
  sourceParent = 'root',
  destParent = 'root',
  onProgress?: (msg: string) => void,
  abortSignal?: AbortSignal
) {
  onProgress?.(`Syncing from ${sourceProvider.name} to ${destProvider.name}...`);
  abortSignal?.throwIfAborted();

  const sourceItems = await sourceProvider.listFiles({ folderIdOrPath: sourceParent, recursive: true });
  const total = sourceItems.items.length;
  let count = 0;

  for (const item of sourceItems.items) {
    abortSignal?.throwIfAborted();
    count++;
    if (item.isDirectory) {
      onProgress?.(`[${count}/${total}] Creating folder on ${destProvider.name}: ${item.name}`);
      await destProvider.createFolder(item.name, destParent);
    } else {
      onProgress?.(`[${count}/${total}] Transferring file: ${item.name} (${formatBytes(item.size)})`);
      const blob = await sourceProvider.downloadFile(item.id, abortSignal);
      await destProvider.uploadFile(blob, destParent, item.name, { abortSignal });
    }
  }

  onProgress?.(`Cloud-to-cloud transfer complete! Transferred ${count} items.`);
}

function formatBytes(bytes: number): string {
  if (!+bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

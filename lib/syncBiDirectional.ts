import { LocalFile, readFolderFiles, calculateFileHash } from './localFolder';
import { findOrCreateDriveFolder, uploadFileToDrive, getDriveFileByName, updateDriveFile, fetchDriveFilesByParent, getDriveFileBlob, DriveFile } from './drive';
import { getSyncState, saveSyncState, SyncStateMap } from './syncState';
import ignore from 'ignore';

export interface ConflictItem {
  path: string;
  localLastModified: number;
  driveLastModified: number;
}

export async function syncBiDirectional(
  localRootHandle: FileSystemDirectoryHandle,
  onProgress?: (msg: string) => void,
  onConflict?: (conflicts: ConflictItem[]) => Promise<'local' | 'drive' | 'skip'>
) {
  onProgress?.('Loading local sync state...');
  const syncState: SyncStateMap = await getSyncState();

  onProgress?.(`Ensuring root folder "${localRootHandle.name}" exists in Drive...`);
  const rootResult = await findOrCreateDriveFolder(localRootHandle.name, 'root');
  
  let stateChanged = false;
  
  // Setup ignore rules
  const ig = ignore().add(['.syncignore', '.git', 'node_modules', '.DS_Store']);
  try {
    const ignoreHandle = await localRootHandle.getFileHandle('.syncignore');
    const ignoreFile = await ignoreHandle.getFile();
    ig.add(await ignoreFile.text());
  } catch {}

  async function syncDirectory(
    localDirHandle: FileSystemDirectoryHandle,
    driveDirId: string,
    currentPath: string
  ) {
    onProgress?.(`Syncing folder: ${currentPath || 'Root'}`);

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

    // 3. Process Local Entries (Upload or Update or Recurse)
    for (const [name, localInfo] of localEntries.entries()) {
      if (localInfo.isDir) {
        // Find or create drive folder
        let nextDriveId = driveMap.get(name)?.id;
        if (!nextDriveId) {
          onProgress?.(`Creating Drive folder: ${localInfo.fullPath}`);
          const res = await findOrCreateDriveFolder(name, driveDirId);
          nextDriveId = res.id;
        }
        await syncDirectory(localInfo.handle, nextDriveId, localInfo.fullPath);
      } else {
        const fileHandle = localInfo.handle;
        const file = await fileHandle.getFile();
        const driveFile = driveMap.get(name);
        const cachedState = syncState[localInfo.fullPath];

        if (!driveFile) {
          // Local Only -> Upload
          onProgress?.(`Uploading new file: ${localInfo.fullPath}`);
          const localHash = await calculateFileHash(file);
          const uploaded = await uploadFileToDrive(file, driveDirId);
          syncState[localInfo.fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: uploaded.id };
          stateChanged = true;
        } else {
          // Exists in both -> Compare
          const localTime = file.lastModified;
          const driveTime = new Date(driveFile.modifiedTime).getTime();
          
          if (cachedState) {
            const localChanged = localTime > cachedState.lastModified;
            const driveChanged = driveTime > cachedState.lastModified;

            if (localChanged && !driveChanged) {
              onProgress?.(`Updating Drive file: ${localInfo.fullPath}`);
              const localHash = await calculateFileHash(file);
              const updated = await updateDriveFile(driveFile.id, file);
              syncState[localInfo.fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id };
              stateChanged = true;
            } else if (driveChanged && !localChanged) {
              onProgress?.(`Downloading Drive file: ${localInfo.fullPath}`);
              const blob = await getDriveFileBlob(driveFile.id);
              const writable = await (fileHandle as any).createWritable();
              await writable.write(blob);
              await writable.close();
              const newFile = await fileHandle.getFile();
              syncState[localInfo.fullPath] = { lastModified: newFile.lastModified, size: newFile.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id };
              stateChanged = true;
            } else if (localChanged && driveChanged) {
              // CONFLICT
              if (onConflict) {
                const resolution = await onConflict([{ path: localInfo.fullPath, localLastModified: localTime, driveLastModified: driveTime }]);
                if (resolution === 'local') {
                  const localHash = await calculateFileHash(file);
                  const updated = await updateDriveFile(driveFile.id, file);
                  syncState[localInfo.fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id };
                  stateChanged = true;
                } else if (resolution === 'drive') {
                  const blob = await getDriveFileBlob(driveFile.id);
                  const writable = await (fileHandle as any).createWritable();
                  await writable.write(blob);
                  await writable.close();
                  const newFile = await fileHandle.getFile();
                  syncState[localInfo.fullPath] = { lastModified: newFile.lastModified, size: newFile.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id };
                  stateChanged = true;
                }
              }
            } else {
              // Neither changed, do nothing
            }
          } else {
            // No cache? Just upload local (assuming local is truth if unmapped)
            // Wait, if it exists on drive and local, but no cache, compare hashes
            const localHash = await calculateFileHash(file);
            if (localHash !== driveFile.md5Checksum) {
               // Update drive
               const updated = await updateDriveFile(driveFile.id, file);
               syncState[localInfo.fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: updated.id };
               stateChanged = true;
            } else {
               syncState[localInfo.fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: localHash, driveId: driveFile.id };
               stateChanged = true;
            }
          }
        }
      }
    }

    // 4. Process Drive Entries (Download Drive-only files)
    for (const [name, driveFile] of driveMap.entries()) {
      if (!localEntries.has(name)) {
        const fullPath = currentPath ? `${currentPath}/${name}` : name;
        if (ig.ignores(fullPath)) continue;

        if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
          // Download Folder
          onProgress?.(`Creating local folder: ${fullPath}`);
          const newLocalDir = await localDirHandle.getDirectoryHandle(name, { create: true });
          await syncDirectory(newLocalDir, driveFile.id, fullPath);
        } else {
          // Download File
          onProgress?.(`Downloading new file from Drive: ${fullPath}`);
          const blob = await getDriveFileBlob(driveFile.id);
          const newFileHandle = await localDirHandle.getFileHandle(name, { create: true });
          const writable = await (newFileHandle as any).createWritable();
          await writable.write(blob);
          await writable.close();
          const file = await (newFileHandle as any).getFile();
          syncState[fullPath] = { lastModified: file.lastModified, size: file.size, md5Hash: driveFile.md5Checksum || '', driveId: driveFile.id };
          stateChanged = true;
        }
      }
    }
  }

  await syncDirectory(localRootHandle, rootResult.id, '');

  if (stateChanged) {
    onProgress?.('Saving sync state...');
    await saveSyncState(syncState);
  }

  onProgress?.('Sync complete!');
}

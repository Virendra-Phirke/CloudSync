import { LocalFile, readFolderFiles, calculateFileHash } from './localFolder';
import { findOrCreateDriveFolder, uploadFileToDrive, getDriveFileByName, updateDriveFile } from './drive';
import { getSyncState, saveSyncState, SyncStateMap } from './syncState';

export async function syncLocalFolderToDrive(
  localHandle: FileSystemDirectoryHandle,
  onProgress?: (msg: string) => void
) {
  onProgress?.('Reading local folder structure...');
  const localFiles = await readFolderFiles(localHandle);
  
  onProgress?.('Loading local sync state...');
  const syncState: SyncStateMap = await getSyncState();

  onProgress?.(`Ensuring root folder "${localHandle.name}" exists in Drive...`);
  // Put the root folder in the user's Drive root
  const rootDriveId = await findOrCreateDriveFolder(localHandle.name, 'root');

  // Map to keep track of created/found folder IDs
  // Key: relative path (e.g. "src" or "src/components")
  // Value: Google Drive Folder ID
  const folderIdMap = new Map<string, string>();
  folderIdMap.set('', rootDriveId);

  let processed = 0;
  const total = localFiles.length;
  let stateChanged = false;

  for (const item of localFiles) {
    processed++;
    
    // Find the parent folder's path
    const parts = item.path.split('/');
    parts.pop(); // remove the item's own name
    const parentPath = parts.join('/');
    
    // Default to root if for some reason the parent wasn't mapped
    const parentId = folderIdMap.get(parentPath) || rootDriveId;

    if (item.isDirectory) {
      onProgress?.(`[${processed}/${total}] Creating folder: ${item.path}...`);
      try {
        const driveId = await findOrCreateDriveFolder(item.name, parentId);
        folderIdMap.set(item.path, driveId);
      } catch (err: any) {
        console.error(`Failed to create folder ${item.path}`, err);
        onProgress?.(`Error creating folder ${item.name}`);
      }
    } else {
      if (item.handle) {
        try {
          const file = await (item.handle as any).getFile();
          
          const cachedState = syncState[item.path];
          let localHash = cachedState?.md5Hash;
          
          // Fast-path: Check if file is unmodified locally
          const isUnmodifiedLocally = cachedState && 
                                      cachedState.lastModified === file.lastModified && 
                                      cachedState.size === file.size;

          if (isUnmodifiedLocally && cachedState.driveId) {
            onProgress?.(`[${processed}/${total}] Skipping unchanged file: ${item.name}`);
            // We assume it's still in Drive and hasn't changed.
            continue;
          }
          
          if (!isUnmodifiedLocally) {
            onProgress?.(`[${processed}/${total}] Hashing file: ${item.name}...`);
            localHash = await calculateFileHash(file);
          }
          
          if (!localHash) {
            throw new Error('Failed to compute hash');
          }

          // If we have a cached driveId, we could update it directly, 
          // but let's be safe and check if it still exists in Drive by name.
          onProgress?.(`[${processed}/${total}] Checking Drive for: ${item.name}...`);
          const existingFile = await getDriveFileByName(item.name, parentId);
          
          if (existingFile) {
            if (existingFile.md5Checksum === localHash) {
              onProgress?.(`[${processed}/${total}] Skipping identical file: ${item.name}`);
              // Update state just in case we didn't have it
              syncState[item.path] = {
                lastModified: file.lastModified,
                size: file.size,
                md5Hash: localHash,
                driveId: existingFile.id,
              };
              stateChanged = true;
            } else {
              onProgress?.(`[${processed}/${total}] Updating file: ${item.name}...`);
              const updated = await updateDriveFile(existingFile.id, file);
              syncState[item.path] = {
                lastModified: file.lastModified,
                size: file.size,
                md5Hash: localHash,
                driveId: updated.id,
              };
              stateChanged = true;
            }
          } else {
            onProgress?.(`[${processed}/${total}] Uploading new file: ${item.name}...`);
            const uploaded = await uploadFileToDrive(file, parentId);
            syncState[item.path] = {
              lastModified: file.lastModified,
              size: file.size,
              md5Hash: localHash,
              driveId: uploaded.id,
            };
            stateChanged = true;
          }
        } catch (err: any) {
          console.error(`Failed to sync ${item.path}`, err);
          onProgress?.(`Error syncing ${item.name}`);
        }
      }
    }
  }

  if (stateChanged) {
    onProgress?.('Saving local sync state...');
    await saveSyncState(syncState);
  }

  onProgress?.('Sync complete!');
}

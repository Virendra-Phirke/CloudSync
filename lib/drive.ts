import { getAccessToken } from './oauth';
import { get, set } from 'idb-keyval';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  thumbnailLink?: string;
  iconLink?: string;
}

export async function fetchDriveFiles(): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) {
    const cachedFiles = await get('drive_files_cache');
    return cachedFiles || [];
  }

  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink)&pageSize=50', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to fetch files');
    const data = await response.json();
    const files = data.files || [];
    await set('drive_files_cache', files);
    return files;
  } catch (err) {
    console.warn('Network error, falling back to cache for files', err);
    const cachedFiles = await get('drive_files_cache');
    return cachedFiles || [];
  }
}

export async function fetchDriveFolders(): Promise<DriveFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100&orderBy=name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error('Failed to fetch folders');
    const data = await response.json();
    return data.files || [];
  } catch (err) {
    console.warn('Failed to fetch Drive folders', err);
    return [];
  }
}


export interface DriveQuota {
  limit: string;
  usage: string;
  usageInDrive: string;
  usageInDriveTrash: string;
}

export async function fetchDriveQuota(): Promise<DriveQuota | null> {
  const token = await getAccessToken();
  if (!token) {
    const cachedQuota = await get('drive_quota_cache');
    return cachedQuota || null;
  }

  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch quota');
    }

    const data = await response.json();
    const quota = data.storageQuota;
    
    await set('drive_quota_cache', quota);
    
    return quota;
  } catch (err) {
    console.warn('Network error, falling back to cache for quota', err);
    const cachedQuota = await get('drive_quota_cache');
    return cachedQuota || null;
  }
}

export async function findOrCreateDriveFolder(name: string, parentId?: string): Promise<{ id: string; isNew: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const escapeName = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${escapeName}' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }

  // 1. Check if it exists
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to query folder');
  const data = await res.json();
  
  if (data.files && data.files.length > 0) {
    return { id: data.files[0].id, isNew: false };
  }

  // 2. Create if not found
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) throw new Error('Failed to create folder');
  const createData = await createRes.json();
  return { id: createData.id, isNew: true };
}

export async function getDriveFileByName(name: string, parentId: string): Promise<(DriveFile & { md5Checksum?: string }) | null> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const escapeName = name.replace(/'/g, "\\'");
  const q = `name='${escapeName}' and '${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,md5Checksum,thumbnailLink,iconLink)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to query file');
  const data = await res.json();
  
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return null;
}

export async function updateDriveFile(fileId: string, file: File): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated to upload');

  const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to update file');
  }

  return response.json();
}

export async function uploadFileToDrive(file: File, parentId?: string): Promise<DriveFile> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated to upload');
  }

  const metadata: any = {
    name: file.name,
    mimeType: file.type,
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to upload file');
  }

  return response.json();
}

export async function queueOfflineUpload(file: File) {
  const queue: File[] = await get('offline_upload_queue') || [];
  queue.push(file);
  await set('offline_upload_queue', queue);
}

export async function processOfflineUploads(onSuccess: (file: DriveFile) => void, onError: (file: File, err: any) => void) {
  const queue: File[] = await get('offline_upload_queue') || [];
  if (queue.length === 0) return;
  
  const newQueue: File[] = [];
  
  for (const file of queue) {
    try {
      const result = await uploadFileToDrive(file);
      onSuccess(result);
    } catch (err: any) {
      console.error('Failed to upload queued file:', file.name, err);
      newQueue.push(file);
      onError(file, err);
    }
  }
  
  await set('offline_upload_queue', newQueue);
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated to delete');

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errMsg = 'Failed to delete file';
    try {
      const err = await response.json();
      if (err.error?.message) errMsg = err.error.message;
    } catch {
      // Ignored
    }
    throw new Error(errMsg);
  }
}

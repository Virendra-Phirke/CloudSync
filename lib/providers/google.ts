/**
 * Google Drive Provider Implementation
 * Adheres to CloudProvider interface and preserves backward compatibility with lib/drive.ts
 */

import {
  CloudProvider,
  CloudItem,
  CloudQuota,
  CloudUser,
  ChangeList,
  ListFilesOptions,
  ListFilesResult,
  UploadOptions,
} from './types';
import { fetchWithProviderRetry, ProviderError } from './base';
import { getAccessToken, getUserInfo as getGoogleUserInfo, logout as googleLogout } from '../oauth';

export class GoogleDriveProvider implements CloudProvider {
  public readonly id = 'google' as const;
  public readonly name = 'Google Drive';

  private async getToken(): Promise<string> {
    const token = await getAccessToken();
    if (!token) {
      throw new ProviderError('Not authenticated with Google Drive', this.id, 401);
    }
    return token;
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      const token = await getAccessToken();
      return Boolean(token);
    } catch {
      return false;
    }
  }

  public async getUserInfo(): Promise<CloudUser | null> {
    const u = getGoogleUserInfo();
    if (!u) return null;
    return {
      email: u.email,
      name: u.name,
      picture: u.picture,
      provider: 'google',
    };
  }

  public async disconnect(): Promise<void> {
    await googleLogout();
  }

  public async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    const token = await this.getToken();
    const pageSize = options.pageSize || 100;
    const pageToken = options.pageToken || '';

    let q = 'trashed = false';
    if (options.folderIdOrPath && options.folderIdOrPath !== '/' && options.folderIdOrPath !== 'root') {
      q += ` and '${options.folderIdOrPath}' in parents`;
    } else if (!options.recursive) {
      q += ` and 'root' in parents`;
    }

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', q);
    url.searchParams.set('pageSize', pageSize.toString());
    url.searchParams.set(
      'fields',
      'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, iconLink, parents, md5Checksum)'
    );
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await fetchWithProviderRetry(this.id, url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to list files', this.id, res.status);
    }

    const data = await res.json();
    const items: CloudItem[] = (data.files || []).map((f: any) => this.mapDriveFileToCloudItem(f));

    return {
      items,
      nextPageToken: data.nextPageToken,
      hasMore: Boolean(data.nextPageToken),
    };
  }

  public async getMetadata(fileIdOrPath: string): Promise<CloudItem | null> {
    const token = await this.getToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileIdOrPath
    )}?fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,parents,md5Checksum,trashed`;

    const res = await fetchWithProviderRetry(this.id, url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to get metadata', this.id, res.status);
    }

    const data = await res.json();
    if (data.trashed) return null;
    return this.mapDriveFileToCloudItem(data);
  }

  public async uploadFile(
    file: File | Blob,
    parentIdOrPath = 'root',
    fileName?: string,
    options: UploadOptions = {}
  ): Promise<CloudItem> {
    const token = await this.getToken();
    const resolvedName = fileName || (file instanceof File ? file.name : 'uploaded_file');
    const mimeType = options.mimeType || (file instanceof File ? file.type : 'application/octet-stream') || 'application/octet-stream';

    const parentId = !parentIdOrPath || parentIdOrPath === '/' ? 'root' : parentIdOrPath;

    // Small files multipart upload (< 5MB)
    const metadata = {
      name: resolvedName,
      mimeType,
      parents: [parentId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file, resolvedName);

    const res = await fetchWithProviderRetry(
      this.id,
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,parents,md5Checksum',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: options.abortSignal,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to upload file', this.id, res.status);
    }

    const created = await res.json();
    return this.mapDriveFileToCloudItem(created);
  }

  public async downloadFile(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<Blob> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileIdOrPath)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortSignal,
      }
    );

    if (!res.ok) {
      throw new ProviderError('Failed to download file', this.id, res.status);
    }

    return res.blob();
  }

  public async downloadFileAsText(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<string> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileIdOrPath)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortSignal,
      }
    );

    if (!res.ok) {
      throw new ProviderError('Failed to download file text', this.id, res.status);
    }

    return res.text();
  }

  public async createFolder(
    name: string,
    parentIdOrPath = 'root'
  ): Promise<{ id: string; name: string; path: string; isNew: boolean }> {
    const token = await this.getToken();
    const parentId = !parentIdOrPath || parentIdOrPath === '/' ? 'root' : parentIdOrPath;

    // Check if exists
    const escapeName = name.replace(/'/g, "\\'");
    const q = `mimeType='application/vnd.google-apps.folder' and name='${escapeName}' and '${parentId}' in parents and trashed=false`;
    const checkRes = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (checkRes.ok) {
      const data = await checkRes.json();
      if (data.files && data.files.length > 0) {
        return {
          id: data.files[0].id,
          name: data.files[0].name,
          path: `/${name}`,
          isNew: false,
        };
      }
    }

    // Create
    const res = await fetchWithProviderRetry(
      this.id,
      'https://www.googleapis.com/drive/v3/files?fields=id,name',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to create folder', this.id, res.status);
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      path: `/${name}`,
      isNew: true,
    };
  }

  public async deleteFile(fileIdOrPath: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileIdOrPath)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to delete file', this.id, res.status);
    }
  }

  public async moveFile(
    fileIdOrPath: string,
    newParentIdOrPath: string,
    newName?: string
  ): Promise<CloudItem> {
    const token = await this.getToken();

    // First fetch current parents
    const getRes = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileIdOrPath)}?fields=parents,name`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!getRes.ok) throw new ProviderError('Failed to fetch file parents', this.id, getRes.status);
    const curr = await getRes.json();
    const prevParents = (curr.parents || []).join(',');

    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileIdOrPath)}`);
    url.searchParams.set('addParents', newParentIdOrPath);
    if (prevParents) {
      url.searchParams.set('removeParents', prevParents);
    }
    url.searchParams.set(
      'fields',
      'id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,parents,md5Checksum'
    );

    const body: Record<string, string> = {};
    if (newName) body.name = newName;

    const res = await fetchWithProviderRetry(this.id, url.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to move file', this.id, res.status);
    }

    return this.mapDriveFileToCloudItem(await res.json());
  }

  public async renameFile(fileIdOrPath: string, newName: string): Promise<CloudItem> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileIdOrPath
      )}?fields=id,name,mimeType,size,modifiedTime,thumbnailLink,iconLink,parents,md5Checksum`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to rename file', this.id, res.status);
    }

    return this.mapDriveFileToCloudItem(await res.json());
  }

  public async getChanges(cursor?: string): Promise<ChangeList> {
    const token = await this.getToken();

    let pageToken = cursor;
    if (!pageToken) {
      // Get initial start page token
      const startRes = await fetchWithProviderRetry(
        this.id,
        'https://www.googleapis.com/drive/v3/changes/startPageToken',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!startRes.ok) {
        throw new ProviderError('Failed to fetch changes start token', this.id, startRes.status);
      }
      const data = await startRes.json();
      pageToken = data.startPageToken;
    }

    const url = new URL('https://www.googleapis.com/drive/v3/changes');
    url.searchParams.set('pageToken', pageToken!);
    url.searchParams.set(
      'fields',
      'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,parents,md5Checksum,trashed))'
    );

    const res = await fetchWithProviderRetry(this.id, url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new ProviderError('Failed to fetch incremental changes', this.id, res.status);
    }

    const data = await res.json();
    const items: CloudItem[] = [];
    const deletedIds: string[] = [];

    for (const change of data.changes || []) {
      if (change.removed || change.file?.trashed) {
        deletedIds.push(change.fileId);
      } else if (change.file) {
        items.push(this.mapDriveFileToCloudItem(change.file));
      }
    }

    return {
      items,
      deletedIds,
      cursor: data.nextPageToken || data.newStartPageToken || pageToken!,
      hasMore: Boolean(data.nextPageToken),
    };
  }

  public async getQuota(): Promise<CloudQuota | null> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const q = data.storageQuota;
    if (!q) return null;

    const total = parseInt(q.limit || '0', 10);
    const used = parseInt(q.usage || '0', 10);
    return {
      totalBytes: total,
      usedBytes: used,
      freeBytes: total > 0 ? Math.max(0, total - used) : undefined,
    };
  }

  private mapDriveFileToCloudItem(f: any): CloudItem {
    const isDir = f.mimeType === 'application/vnd.google-apps.folder';
    return {
      id: f.id,
      name: f.name || 'Untitled',
      path: `/${f.name || f.id}`,
      isDirectory: isDir,
      size: isDir ? 0 : parseInt(f.size || '0', 10),
      modifiedTime: f.modifiedTime ? new Date(f.modifiedTime).getTime() : Date.now(),
      mimeType: f.mimeType,
      contentHash: f.md5Checksum,
      thumbnailUrl: f.thumbnailLink,
      parentId: f.parents && f.parents.length > 0 ? f.parents[0] : undefined,
      provider: 'google',
    };
  }
}

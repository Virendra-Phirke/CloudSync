/**
 * Microsoft OneDrive Provider Implementation
 * Uses Microsoft Graph API v1.0 with OAuth, chunked upload sessions, Delta API, pagination, and rate limit backoff.
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
import { fetchWithProviderRetry, ProviderError, normalizeCloudPath } from './base';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
// Microsoft Graph upload session chunk size must be a multiple of 320 KiB (327,680 bytes)
const GRAPH_CHUNK_SIZE = 320 * 1024 * 10; // 3.2 MB
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MB

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export class OneDriveProvider implements CloudProvider {
  public readonly id = 'onedrive' as const;
  public readonly name = 'Microsoft OneDrive';

  private async getToken(): Promise<string> {
    // 1. Check in-memory/cookie token
    let token = getCookie('one_access_token');
    if (token) return token;

    // 2. Try refresh
    try {
      const res = await fetch('/api/auth/token?provider=onedrive', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) return data.accessToken;
      }
    } catch {
      // Refresh failed
    }

    throw new ProviderError('Not authenticated with Microsoft OneDrive', this.id, 401);
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getToken();
      return Boolean(token);
    } catch {
      return false;
    }
  }

  public async getUserInfo(): Promise<CloudUser | null> {
    const raw = getCookie('one_user');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...parsed, provider: 'onedrive' };
      } catch {}
    }

    try {
      const token = await this.getToken();
      const res = await fetchWithProviderRetry(this.id, `${GRAPH_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return {
        id: data.id,
        email: data.mail || data.userPrincipalName,
        name: data.displayName || data.mail || 'OneDrive User',
        provider: 'onedrive',
      };
    } catch {
      return null;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await fetch('/api/auth/logout?provider=onedrive', { method: 'POST' });
    } catch {}

    if (typeof document !== 'undefined') {
      document.cookie = 'one_access_token=; path=/; max-age=0';
      document.cookie = 'one_user=; path=/; max-age=0';
    }
  }

  public async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    const token = await this.getToken();

    let url: string;
    if (options.pageToken) {
      // Direct pagination link provided by Graph API
      url = options.pageToken;
    } else {
      const parent = options.folderIdOrPath && options.folderIdOrPath !== '/' ? options.folderIdOrPath : 'root';
      const isId = parent === 'root' || !parent.startsWith('/');

      if (isId) {
        url = `${GRAPH_BASE}/me/drive/items/${parent}/children`;
      } else {
        const cleanPath = normalizeCloudPath(parent);
        url = `${GRAPH_BASE}/me/drive/root:${cleanPath}:/children`;
      }

      const params = new URLSearchParams();
      params.set('$top', (options.pageSize || 100).toString());
      params.set(
        '$select',
        'id,name,size,lastModifiedDateTime,file,folder,parentReference,thumbnails'
      );
      url += `?${params.toString()}`;
    }

    const res = await fetchWithProviderRetry(this.id, url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to list OneDrive files', this.id, res.status);
    }

    const data = await res.json();
    const items: CloudItem[] = (data.value || []).map((e: any) => this.mapGraphItemToCloudItem(e));

    return {
      items,
      nextPageToken: data['@odata.nextLink'],
      hasMore: Boolean(data['@odata.nextLink']),
    };
  }

  public async getMetadata(fileIdOrPath: string): Promise<CloudItem | null> {
    const token = await this.getToken();
    const isId = fileIdOrPath === 'root' || !fileIdOrPath.startsWith('/');

    let url: string;
    if (isId) {
      url = `${GRAPH_BASE}/me/drive/items/${fileIdOrPath}?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference,deleted`;
    } else {
      const cleanPath = normalizeCloudPath(fileIdOrPath);
      url = `${GRAPH_BASE}/me/drive/root:${cleanPath}?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference,deleted`;
    }

    const res = await fetchWithProviderRetry(this.id, url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to get metadata', this.id, res.status);
    }

    const data = await res.json();
    if (data.deleted) return null;
    return this.mapGraphItemToCloudItem(data);
  }

  public async uploadFile(
    file: File | Blob,
    parentIdOrPath = 'root',
    fileName?: string,
    options: UploadOptions = {}
  ): Promise<CloudItem> {
    const token = await this.getToken();
    const resolvedName = fileName || (file instanceof File ? file.name : 'uploaded_file');
    const parent = !parentIdOrPath || parentIdOrPath === '/' ? 'root' : parentIdOrPath;
    const isId = parent === 'root' || !parent.startsWith('/');

    const fileSize = file.size;

    // Small file upload (<= 4MB)
    if (fileSize <= SIMPLE_UPLOAD_LIMIT) {
      let uploadUrl: string;
      if (isId) {
        uploadUrl = `${GRAPH_BASE}/me/drive/items/${parent}:/${encodeURIComponent(resolvedName)}:/content`;
      } else {
        const folder = normalizeCloudPath(parent);
        uploadUrl = `${GRAPH_BASE}/me/drive/root:${folder}/${encodeURIComponent(resolvedName)}:/content`;
      }

      const res = await fetchWithProviderRetry(this.id, uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: file,
        signal: options.abortSignal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new ProviderError(err.error?.message || 'Failed to upload file to OneDrive', this.id, res.status);
      }

      const data = await res.json();
      return this.mapGraphItemToCloudItem(data);
    }

    // Large file upload session (> 4MB)
    return this.uploadSession(token, file, parent, resolvedName, isId, options);
  }

  private async uploadSession(
    token: string,
    file: File | Blob,
    parent: string,
    fileName: string,
    isId: boolean,
    options: UploadOptions = {}
  ): Promise<CloudItem> {
    const totalBytes = file.size;

    let sessionUrl: string;
    if (isId) {
      sessionUrl = `${GRAPH_BASE}/me/drive/items/${parent}:/${encodeURIComponent(fileName)}:/createUploadSession`;
    } else {
      const folder = normalizeCloudPath(parent);
      sessionUrl = `${GRAPH_BASE}/me/drive/root:${folder}/${encodeURIComponent(fileName)}:/createUploadSession`;
    }

    const initRes = await fetchWithProviderRetry(this.id, sessionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
          name: fileName,
        },
      }),
      signal: options.abortSignal,
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to create OneDrive upload session', this.id, initRes.status);
    }

    const sessionData = await initRes.json();
    const uploadUrl = sessionData.uploadUrl;

    let offset = 0;
    let finalResult: any = null;

    while (offset < totalBytes) {
      options.abortSignal?.throwIfAborted();
      const end = Math.min(offset + GRAPH_CHUNK_SIZE, totalBytes);
      const chunk = file.slice(offset, end);
      const chunkLength = end - offset;

      const chunkRes = await fetchWithProviderRetry(this.id, uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunkLength.toString(),
          'Content-Range': `bytes ${offset}-${end - 1}/${totalBytes}`,
        },
        body: chunk,
        signal: options.abortSignal,
      });

      if (!chunkRes.ok && chunkRes.status !== 200 && chunkRes.status !== 201 && chunkRes.status !== 202) {
        throw new ProviderError(`Upload session failed at range ${offset}-${end - 1}`, this.id, chunkRes.status);
      }

      if (chunkRes.status === 200 || chunkRes.status === 201) {
        finalResult = await chunkRes.json();
      }

      offset = end;
      options.onProgress?.(offset, totalBytes);
    }

    if (!finalResult) {
      throw new ProviderError('Upload completed without server confirmation', this.id);
    }

    return this.mapGraphItemToCloudItem(finalResult);
  }

  public async downloadFile(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<Blob> {
    const token = await this.getToken();
    const isId = !fileIdOrPath.startsWith('/');

    let url: string;
    if (isId) {
      url = `${GRAPH_BASE}/me/drive/items/${fileIdOrPath}/content`;
    } else {
      const cleanPath = normalizeCloudPath(fileIdOrPath);
      url = `${GRAPH_BASE}/me/drive/root:${cleanPath}:/content`;
    }

    const res = await fetchWithProviderRetry(this.id, url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abortSignal,
    });

    if (!res.ok) {
      throw new ProviderError('Failed to download file from OneDrive', this.id, res.status);
    }

    return res.blob();
  }

  public async downloadFileAsText(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<string> {
    const blob = await this.downloadFile(fileIdOrPath, abortSignal);
    return blob.text();
  }

  public async createFolder(
    name: string,
    parentIdOrPath = 'root'
  ): Promise<{ id: string; name: string; path: string; isNew: boolean }> {
    const token = await this.getToken();
    const parent = !parentIdOrPath || parentIdOrPath === '/' ? 'root' : parentIdOrPath;
    const isId = parent === 'root' || !parent.startsWith('/');

    // Check existing
    const checkPath = isId ? `${parent}/${name}` : `${parent}/${name}`;
    const existing = await this.getMetadata(checkPath).catch(() => null);
    if (existing && existing.isDirectory) {
      return {
        id: existing.id,
        name: existing.name,
        path: existing.path,
        isNew: false,
      };
    }

    let createUrl: string;
    if (isId) {
      createUrl = `${GRAPH_BASE}/me/drive/items/${parent}/children`;
    } else {
      const folder = normalizeCloudPath(parent);
      createUrl = `${GRAPH_BASE}/me/drive/root:${folder}:/children`;
    }

    const res = await fetchWithProviderRetry(this.id, createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to create folder in OneDrive', this.id, res.status);
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
    const isId = !fileIdOrPath.startsWith('/');

    let url: string;
    if (isId) {
      url = `${GRAPH_BASE}/me/drive/items/${fileIdOrPath}`;
    } else {
      const cleanPath = normalizeCloudPath(fileIdOrPath);
      url = `${GRAPH_BASE}/me/drive/root:${cleanPath}`;
    }

    const res = await fetchWithProviderRetry(this.id, url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to delete OneDrive file', this.id, res.status);
    }
  }

  public async moveFile(
    fileIdOrPath: string,
    newParentIdOrPath: string,
    newName?: string
  ): Promise<CloudItem> {
    const token = await this.getToken();
    const isId = !fileIdOrPath.startsWith('/');

    let url: string;
    if (isId) {
      url = `${GRAPH_BASE}/me/drive/items/${fileIdOrPath}`;
    } else {
      const cleanPath = normalizeCloudPath(fileIdOrPath);
      url = `${GRAPH_BASE}/me/drive/root:${cleanPath}`;
    }

    const newParent = !newParentIdOrPath || newParentIdOrPath === '/' ? 'root' : newParentIdOrPath;
    const body: Record<string, unknown> = {
      parentReference: { id: newParent },
    };
    if (newName) body.name = newName;

    const res = await fetchWithProviderRetry(this.id, url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to move OneDrive file', this.id, res.status);
    }

    const data = await res.json();
    return this.mapGraphItemToCloudItem(data);
  }

  public async renameFile(fileIdOrPath: string, newName: string): Promise<CloudItem> {
    const token = await this.getToken();
    const isId = !fileIdOrPath.startsWith('/');

    let url: string;
    if (isId) {
      url = `${GRAPH_BASE}/me/drive/items/${fileIdOrPath}`;
    } else {
      const cleanPath = normalizeCloudPath(fileIdOrPath);
      url = `${GRAPH_BASE}/me/drive/root:${cleanPath}`;
    }

    const res = await fetchWithProviderRetry(this.id, url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error?.message || 'Failed to rename OneDrive file', this.id, res.status);
    }

    const data = await res.json();
    return this.mapGraphItemToCloudItem(data);
  }

  public async getChanges(cursor?: string): Promise<ChangeList> {
    const token = await this.getToken();

    const url = cursor || `${GRAPH_BASE}/me/drive/root/delta`;

    const res = await fetchWithProviderRetry(this.id, url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new ProviderError('Failed to fetch OneDrive delta changes', this.id, res.status);
    }

    const data = await res.json();
    const items: CloudItem[] = [];
    const deletedIds: string[] = [];

    for (const item of data.value || []) {
      if (item.deleted) {
        deletedIds.push(item.id);
      } else {
        items.push(this.mapGraphItemToCloudItem(item));
      }
    }

    return {
      items,
      deletedIds,
      cursor: data['@odata.deltaLink'] || data['@odata.nextLink'] || url,
      hasMore: Boolean(data['@odata.nextLink']),
    };
  }

  public async getQuota(): Promise<CloudQuota | null> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(this.id, `${GRAPH_BASE}/me/drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const quota = data.quota;
    if (!quota) return null;

    return {
      totalBytes: quota.total || 0,
      usedBytes: quota.used || 0,
      freeBytes: quota.remaining,
    };
  }

  private mapGraphItemToCloudItem(item: any): CloudItem {
    const isDir = Boolean(item.folder);
    const path = item.parentReference?.path
      ? `${item.parentReference.path.replace(/^\/drive\/root:/, '')}/${item.name}`
      : `/${item.name}`;

    return {
      id: item.id,
      name: item.name,
      path,
      isDirectory: isDir,
      size: item.size || 0,
      modifiedTime: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : Date.now(),
      mimeType: item.file?.mimeType,
      contentHash: item.file?.hashes?.quickXorHash || item.file?.hashes?.sha256Hash || item.file?.hashes?.sha1Hash,
      thumbnailUrl: item.thumbnails?.[0]?.medium?.url,
      parentId: item.parentReference?.id,
      provider: 'onedrive',
    };
  }
}

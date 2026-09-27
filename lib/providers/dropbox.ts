/**
 * Dropbox Provider Implementation
 * Uses official Dropbox API v2 with OAuth, chunked uploads, cursors, pagination, and rate limit backoff.
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

// Chunk size for large file upload sessions (4MB - Dropbox recommended block size)
const CHUNK_SIZE = 4 * 1024 * 1024;
// Threshold above which chunked session upload is used
const CHUNK_UPLOAD_THRESHOLD = 8 * 1024 * 1024;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export class DropboxProvider implements CloudProvider {
  public readonly id = 'dropbox' as const;
  public readonly name = 'Dropbox';

  private formatDropboxFolderPath(rawPath?: string): string {
    if (!rawPath) return '';
    const trimmed = rawPath.trim();
    if (trimmed === '' || trimmed === '/' || trimmed === 'root' || trimmed === '/root') {
      return '';
    }
    const cleaned = trimmed.replace(/\/+$/, '');
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  }

  private async refreshToken(): Promise<string | null> {
    try {
      const res = await fetch('/api/auth/token?provider=dropbox', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) {
          if (typeof document !== 'undefined') {
            document.cookie = `dbx_access_token=${data.accessToken}; path=/; max-age=${data.expiresIn || 14400}; SameSite=Lax`;
          }
          return data.accessToken;
        }
      }
    } catch {}
    return null;
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const token = getCookie('dbx_access_token');
      if (token) return token;
    }

    // Try refresh
    const refreshed = await this.refreshToken();
    if (refreshed) return refreshed;

    throw new ProviderError('Not authenticated with Dropbox', this.id, 401);
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
    const raw = getCookie('dbx_user');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...parsed, provider: 'dropbox' };
      } catch {}
    }

    try {
      const token = await this.getToken();
      const res = await fetchWithProviderRetry(
        this.id,
        'https://api.dropboxapi.com/2/users/get_current_account',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) return null;
      const data = await res.json();
      return {
        id: data.account_id,
        email: data.email,
        name: data.name?.display_name || data.email,
        picture: data.profile_photo_url,
        provider: 'dropbox',
      };
    } catch {
      return null;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await fetch('/api/auth/logout?provider=dropbox', { method: 'POST' });
    } catch {}

    if (typeof document !== 'undefined') {
      document.cookie = 'dbx_access_token=; path=/; max-age=0';
      document.cookie = 'dbx_user=; path=/; max-age=0';
    }
  }

  public async listFiles(options: ListFilesOptions = {}): Promise<ListFilesResult> {
    let token = await this.getToken();

    if (options.pageToken) {
      let res = await fetchWithProviderRetry(
        this.id,
        'https://api.dropboxapi.com/2/files/list_folder/continue',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cursor: options.pageToken }),
        }
      );

      if (res.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          token = refreshed;
          res = await fetchWithProviderRetry(
            this.id,
            'https://api.dropboxapi.com/2/files/list_folder/continue',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ cursor: options.pageToken }),
            }
          );
        }
      }

      if (!res.ok) {
        let errSummary = '';
        try {
          const text = await res.text();
          try {
            const parsed = JSON.parse(text);
            errSummary = parsed.error_summary || parsed.error?.['.tag'] || text;
          } catch {
            errSummary = text;
          }
        } catch {}

        if (res.status === 401) {
          if (typeof document !== 'undefined') {
            document.cookie = 'dbx_access_token=; path=/; max-age=0';
            document.cookie = 'dbx_user=; path=/; max-age=0';
          }
          throw new ProviderError('Dropbox session expired. Please reconnect your account.', this.id, 401);
        }

        throw new ProviderError(errSummary || 'Failed to continue listing files', this.id, res.status);
      }

      const data = await res.json();
      const items: CloudItem[] = (data.entries || []).map((e: any) => this.mapDropboxEntryToCloudItem(e));
      return {
        items,
        nextPageToken: data.has_more ? data.cursor : undefined,
        hasMore: data.has_more,
      };
    }

    const folderPath = this.formatDropboxFolderPath(options.folderIdOrPath);
    const body: Record<string, unknown> = {
      path: folderPath,
      recursive: Boolean(options.recursive),
      include_media_info: false,
      include_deleted: false,
      limit: options.pageSize || 100,
    };

    let res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/list_folder',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (res.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        token = refreshed;
        res = await fetchWithProviderRetry(
          this.id,
          'https://api.dropboxapi.com/2/files/list_folder',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }
        );
      }
    }

      if (!res.ok) {
        let errSummary = '';
        try {
          const text = await res.text();
          try {
            const parsed = JSON.parse(text);
            errSummary = parsed.error_summary || parsed.error?.['.tag'] || text;
          } catch {
            errSummary = text;
          }
        } catch {}

        if (res.status === 401) {
          if (typeof document !== 'undefined') {
            document.cookie = 'dbx_access_token=; path=/; max-age=0';
            document.cookie = 'dbx_user=; path=/; max-age=0';
          }
          throw new ProviderError('Dropbox session expired. Please reconnect your account.', this.id, 401);
        }

        if (errSummary.includes('not permitted to access this endpoint') || errSummary.includes('required scope')) {
          throw new ProviderError(
            `Dropbox permissions missing. Please enable 'files.metadata.read', 'files.metadata.write', 'files.content.read', 'files.content.write' in the Dropbox App Console > Permissions tab and reconnect.`,
            this.id,
            403
          );
        }

        throw new ProviderError(errSummary || 'Failed to list Dropbox folder', this.id, res.status);
      }

    const data = await res.json();
    const items: CloudItem[] = (data.entries || []).map((e: any) => this.mapDropboxEntryToCloudItem(e));

    return {
      items,
      nextPageToken: data.has_more ? data.cursor : undefined,
      hasMore: data.has_more,
    };
  }

  public async getMetadata(fileIdOrPath: string): Promise<CloudItem | null> {
    const token = await this.getToken();
    const cleanPath = fileIdOrPath.startsWith('id:')
      ? fileIdOrPath
      : normalizeCloudPath(fileIdOrPath);

    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/get_metadata',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: cleanPath }),
      }
    );

    if (res.status === 409 || res.status === 404) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error_summary || 'Failed to get metadata', this.id, res.status);
    }

    const data = await res.json();
    if (data['.tag'] === 'deleted') return null;
    return this.mapDropboxEntryToCloudItem(data);
  }

  public async uploadFile(
    file: File | Blob,
    parentIdOrPath = '',
    fileName?: string,
    options: UploadOptions = {}
  ): Promise<CloudItem> {
    const token = await this.getToken();
    const resolvedName = fileName || (file instanceof File ? file.name : 'uploaded_file');
    const folder = parentIdOrPath && parentIdOrPath !== '/' ? normalizeCloudPath(parentIdOrPath) : '';
    const targetPath = `${folder}/${resolvedName}`.replace(/\/+/g, '/');

    const fileSize = file.size;

    // Use small file upload if file size is below threshold
    if (fileSize < CHUNK_UPLOAD_THRESHOLD) {
      const apiArg = JSON.stringify({
        path: targetPath,
        mode: 'overwrite',
        autorename: true,
        mute: false,
      });

      const res = await fetchWithProviderRetry(
        this.id,
        'https://content.dropboxapi.com/2/files/upload',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': apiArg,
            'Content-Type': 'application/octet-stream',
          },
          body: file,
          signal: options.abortSignal,
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new ProviderError(err.error_summary || 'Failed to upload file to Dropbox', this.id, res.status);
      }

      const data = await res.json();
      return this.mapDropboxEntryToCloudItem(data);
    }

    // Large-file chunked upload session
    return this.uploadChunked(token, file, targetPath, options);
  }

  private async uploadChunked(
    token: string,
    file: File | Blob,
    targetPath: string,
    options: UploadOptions = {}
  ): Promise<CloudItem> {
    const totalBytes = file.size;
    let offset = 0;

    // 1. Start upload session with first chunk
    const firstChunk = file.slice(0, Math.min(CHUNK_SIZE, totalBytes));
    const startRes = await fetchWithProviderRetry(
      this.id,
      'https://content.dropboxapi.com/2/files/upload_session/start',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ close: false }),
          'Content-Type': 'application/octet-stream',
        },
        body: firstChunk,
        signal: options.abortSignal,
      }
    );

    if (!startRes.ok) {
      throw new ProviderError('Failed to initiate chunked upload session', this.id, startRes.status);
    }

    const { session_id } = await startRes.json();
    offset += firstChunk.size;
    options.onProgress?.(offset, totalBytes);

    // 2. Append intermediate chunks
    while (offset < totalBytes - CHUNK_SIZE) {
      options.abortSignal?.throwIfAborted();
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const appendRes = await fetchWithProviderRetry(
        this.id,
        'https://content.dropboxapi.com/2/files/upload_session/append_v2',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Dropbox-API-Arg': JSON.stringify({
              cursor: { session_id, offset },
              close: false,
            }),
            'Content-Type': 'application/octet-stream',
          },
          body: chunk,
          signal: options.abortSignal,
        }
      );

      if (!appendRes.ok) {
        throw new ProviderError(`Failed to append chunk at offset ${offset}`, this.id, appendRes.status);
      }

      offset += chunk.size;
      options.onProgress?.(offset, totalBytes);
    }

    // 3. Finish session with final chunk
    const finalChunk = file.slice(offset, totalBytes);
    const finishRes = await fetchWithProviderRetry(
      this.id,
      'https://content.dropboxapi.com/2/files/upload_session/finish',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({
            cursor: { session_id, offset },
            commit: {
              path: targetPath,
              mode: 'overwrite',
              autorename: true,
              mute: false,
            },
          }),
          'Content-Type': 'application/octet-stream',
        },
        body: finalChunk,
        signal: options.abortSignal,
      }
    );

    if (!finishRes.ok) {
      throw new ProviderError('Failed to finish chunked upload session', this.id, finishRes.status);
    }

    options.onProgress?.(totalBytes, totalBytes);
    const data = await finishRes.json();
    return this.mapDropboxEntryToCloudItem(data);
  }

  public async downloadFile(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<Blob> {
    const token = await this.getToken();
    const cleanPath = fileIdOrPath.startsWith('id:')
      ? fileIdOrPath
      : normalizeCloudPath(fileIdOrPath);

    const res = await fetchWithProviderRetry(
      this.id,
      'https://content.dropboxapi.com/2/files/download',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: cleanPath }),
        },
        signal: abortSignal,
      }
    );

    if (!res.ok) {
      throw new ProviderError('Failed to download file from Dropbox', this.id, res.status);
    }

    return res.blob();
  }

  public async downloadFileAsText(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<string> {
    const blob = await this.downloadFile(fileIdOrPath, abortSignal);
    return blob.text();
  }

  public async createFolder(
    name: string,
    parentIdOrPath = ''
  ): Promise<{ id: string; name: string; path: string; isNew: boolean }> {
    const token = await this.getToken();
    const folder = parentIdOrPath && parentIdOrPath !== '/' ? normalizeCloudPath(parentIdOrPath) : '';
    const fullPath = `${folder}/${name}`.replace(/\/+/g, '/');

    // First check if folder already exists
    const existing = await this.getMetadata(fullPath);
    if (existing && existing.isDirectory) {
      return {
        id: existing.id,
        name: existing.name,
        path: existing.path,
        isNew: false,
      };
    }

    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/create_folder_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: fullPath,
          autorename: false,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error_summary || 'Failed to create folder in Dropbox', this.id, res.status);
    }

    const data = await res.json();
    const metadata = data.metadata;
    return {
      id: metadata.id,
      name: metadata.name,
      path: metadata.path_display || fullPath,
      isNew: true,
    };
  }

  public async deleteFile(fileIdOrPath: string): Promise<void> {
    const token = await this.getToken();
    const cleanPath = fileIdOrPath.startsWith('id:')
      ? fileIdOrPath
      : normalizeCloudPath(fileIdOrPath);

    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/delete_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: cleanPath }),
      }
    );

    if (!res.ok && res.status !== 409 && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error_summary || 'Failed to delete Dropbox file', this.id, res.status);
    }
  }

  public async moveFile(
    fileIdOrPath: string,
    newParentIdOrPath: string,
    newName?: string
  ): Promise<CloudItem> {
    const token = await this.getToken();
    const fromPath = fileIdOrPath.startsWith('id:')
      ? fileIdOrPath
      : normalizeCloudPath(fileIdOrPath);

    const currentName = fromPath.split('/').pop() || 'item';
    const targetName = newName || currentName;
    const toFolder = newParentIdOrPath && newParentIdOrPath !== '/' ? normalizeCloudPath(newParentIdOrPath) : '';
    const toPath = `${toFolder}/${targetName}`.replace(/\/+/g, '/');

    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/move_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from_path: fromPath,
          to_path: toPath,
          autorename: false,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ProviderError(err.error_summary || 'Failed to move Dropbox file', this.id, res.status);
    }

    const data = await res.json();
    return this.mapDropboxEntryToCloudItem(data.metadata);
  }

  public async renameFile(fileIdOrPath: string, newName: string): Promise<CloudItem> {
    const fromPath = fileIdOrPath.startsWith('id:')
      ? fileIdOrPath
      : normalizeCloudPath(fileIdOrPath);
    const parentFolder = fromPath.substring(0, fromPath.lastIndexOf('/')) || '';
    return this.moveFile(fileIdOrPath, parentFolder, newName);
  }

  public async getChanges(cursor?: string): Promise<ChangeList> {
    const token = await this.getToken();

    let cur = cursor;
    if (!cur) {
      // Get initial cursor
      const initialRes = await fetchWithProviderRetry(
        this.id,
        'https://api.dropboxapi.com/2/files/list_folder/get_latest_cursor',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: '',
            recursive: true,
            include_media_info: false,
            include_deleted: true,
          }),
        }
      );

      if (!initialRes.ok) {
        throw new ProviderError('Failed to get initial Dropbox cursor', this.id, initialRes.status);
      }
      const data = await initialRes.json();
      cur = data.cursor;
    }

    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/files/list_folder/continue',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cursor: cur }),
      }
    );

    if (!res.ok) {
      throw new ProviderError('Failed to fetch Dropbox changes', this.id, res.status);
    }

    const data = await res.json();
    const items: CloudItem[] = [];
    const deletedIds: string[] = [];

    for (const entry of data.entries || []) {
      if (entry['.tag'] === 'deleted') {
        deletedIds.push(entry.path_lower || entry.path_display || entry.id);
      } else {
        items.push(this.mapDropboxEntryToCloudItem(entry));
      }
    }

    return {
      items,
      deletedIds,
      cursor: data.cursor,
      hasMore: data.has_more,
    };
  }

  public async getQuota(): Promise<CloudQuota | null> {
    const token = await this.getToken();
    const res = await fetchWithProviderRetry(
      this.id,
      'https://api.dropboxapi.com/2/users/get_space_usage',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const used = data.used || 0;
    const allocated = data.allocation?.allocated || 0;

    return {
      totalBytes: allocated,
      usedBytes: used,
      freeBytes: allocated > 0 ? Math.max(0, allocated - used) : undefined,
    };
  }

  private mapDropboxEntryToCloudItem(entry: any): CloudItem {
    const isDir = entry['.tag'] === 'folder';
    const path = entry.path_display || entry.path_lower || `/${entry.name}`;
    const modifiedTime = entry.server_modified || entry.client_modified
      ? new Date(entry.server_modified || entry.client_modified).getTime()
      : Date.now();

    return {
      id: entry.id || path,
      name: entry.name,
      path,
      isDirectory: isDir,
      size: isDir ? 0 : entry.size || 0,
      modifiedTime,
      contentHash: entry.content_hash,
      parentId: path.lastIndexOf('/') > 0 ? path.substring(0, path.lastIndexOf('/')) : '/',
      provider: 'dropbox',
    };
  }
}

/**
 * Common Cloud Provider Interface & Type Definitions
 * CloudSync Multi-Cloud Architecture
 */

export type CloudProviderType = 'google' | 'dropbox' | 'onedrive';

export interface CloudItem {
  id: string;
  name: string;
  path: string;           // Normalized slash-separated path, e.g. "/Documents/report.pdf"
  isDirectory: boolean;
  size: number;           // bytes (0 for directories)
  modifiedTime: number;   // Epoch timestamp in ms
  mimeType?: string;
  contentHash?: string;   // MD5 (Google), content_hash (Dropbox), quickXor/sha256 (OneDrive)
  thumbnailUrl?: string;
  downloadUrl?: string;
  parentId?: string;
  provider: CloudProviderType;
}

export interface CloudQuota {
  totalBytes: number;
  usedBytes: number;
  freeBytes?: number;
}

export interface CloudUser {
  id?: string;
  email: string;
  name: string;
  picture?: string;
  provider: CloudProviderType;
}

export interface ChangeList {
  items: CloudItem[];
  deletedIds: string[];
  cursor: string;
  hasMore: boolean;
}

export interface ListFilesOptions {
  folderIdOrPath?: string;
  pageSize?: number;
  pageToken?: string;
  recursive?: boolean;
}

export interface ListFilesResult {
  items: CloudItem[];
  nextPageToken?: string;
  hasMore: boolean;
}

export interface UploadOptions {
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
  abortSignal?: AbortSignal;
  mimeType?: string;
  overwrite?: boolean;
}

/**
 * Common Cloud Provider Interface
 * All cloud integrations (Google Drive, Dropbox, OneDrive) must implement this contract.
 */
export interface CloudProvider {
  readonly id: CloudProviderType;
  readonly name: string;

  /** Check if the provider currently has a valid authenticated session */
  isAuthenticated(): Promise<boolean>;

  /** Retrieve the current authenticated user's profile */
  getUserInfo(): Promise<CloudUser | null>;

  /** Disconnect the cloud provider account and revoke credentials */
  disconnect(): Promise<void>;

  /** List files & folders inside a given directory or root */
  listFiles(options?: ListFilesOptions): Promise<ListFilesResult>;

  /** Fetch metadata for a specific file or folder by ID or path */
  getMetadata(fileIdOrPath: string): Promise<CloudItem | null>;

  /** Upload a file to the provider */
  uploadFile(
    file: File | Blob,
    parentIdOrPath: string,
    fileName: string,
    options?: UploadOptions
  ): Promise<CloudItem>;

  /** Download file content as a Blob */
  downloadFile(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<Blob>;

  /** Download file content as UTF-8 text */
  downloadFileAsText(fileIdOrPath: string, abortSignal?: AbortSignal): Promise<string>;

  /** Create a folder */
  createFolder(
    name: string,
    parentIdOrPath?: string
  ): Promise<{ id: string; name: string; path: string; isNew: boolean }>;

  /** Delete a file or folder */
  deleteFile(fileIdOrPath: string): Promise<void>;

  /** Move a file or folder to a new parent */
  moveFile(
    fileIdOrPath: string,
    newParentIdOrPath: string,
    newName?: string
  ): Promise<CloudItem>;

  /** Rename a file or folder */
  renameFile(fileIdOrPath: string, newName: string): Promise<CloudItem>;

  /** Incremental change detection via provider cursors/delta tokens */
  getChanges(cursor?: string): Promise<ChangeList>;

  /** Get storage usage quota */
  getQuota(): Promise<CloudQuota | null>;
}

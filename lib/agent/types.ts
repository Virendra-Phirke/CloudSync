/**
 * CloudSync Controlled AI Agent Tools & Security Types
 */

import { CloudProviderType, CloudItem } from '../providers/types';

export interface ToolSecurityContext {
  userId: string;
  userEmail: string;
  sessionId: string;
  confirmationToken?: string;
  isConfirmed?: boolean;
}

export interface SecurityLimits {
  maxToolCallsPerTask: number;
  maxFilesAffected: number;
  maxBytesTransferred: number;
  maxConcurrentOperations: number;
  maxExecutionTimeMs: number;
}

export interface TaskExecutionMetrics {
  toolCallsCount: number;
  filesAffectedCount: number;
  bytesTransferred: number;
  startTime: number;
  activeOperations: number;
}

export interface DestructiveConfirmationRequest {
  requiresConfirmation: true;
  action: 'delete' | 'bulk_delete' | 'overwrite' | 'bulk_move' | 'disconnect_account' | 'large_scale_sync';
  description: string;
  confirmationToken: string;
  expiresAt: number;
  affectedItems: Array<{ path: string; name?: string; size?: number; provider?: string }>;
}

export interface AuditLogEntry {
  operationId: string;
  user: string;
  operation: string;
  provider: CloudProviderType | 'local' | 'system';
  connection: string;
  path: string;
  timestamp: number;
  result: 'success' | 'failed' | 'denied' | 'pending_confirmation';
  error?: string;
  details?: Record<string, unknown>;
}

// ─── 12 Controlled CloudSync Tool Input / Output Interfaces ───────────────────

export interface GetCloudConnectionsInput {}
export interface GetCloudConnectionsOutput {
  connections: Array<{
    provider: CloudProviderType;
    name: string;
    connected: boolean;
    userEmail?: string;
  }>;
}

export interface ListCloudFilesInput {
  provider: CloudProviderType;
  folderPath?: string;
  pageSize?: number;
  pageToken?: string;
}
export interface ListCloudFilesOutput {
  items: Array<{
    id: string;
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedTime: string;
    mimeType?: string;
  }>;
  nextPageToken?: string;
  hasMore: boolean;
}

export interface GetCloudFileInput {
  provider: CloudProviderType;
  filePath: string;
}
export interface GetCloudFileOutput {
  file: {
    id: string;
    name: string;
    path: string;
    size: number;
    modifiedTime: string;
    mimeType?: string;
  };
}

export interface SearchCloudFilesInput {
  provider: CloudProviderType;
  query: string;
  folderPath?: string;
}
export interface SearchCloudFilesOutput {
  matches: Array<{
    id: string;
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modifiedTime: string;
  }>;
}

export interface CreateSyncJobInput {
  sourceProvider: CloudProviderType | 'local';
  sourcePath?: string;
  destinationProvider: CloudProviderType | 'local';
  destinationPath?: string;
}
export interface CreateSyncJobOutput {
  jobId: string;
  status: 'started' | 'pending_confirmation';
  source: string;
  destination: string;
}

export interface GetSyncStatusInput {
  jobId: string;
}
export interface GetSyncStatusOutput {
  jobId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  filesProcessed: number;
  totalFiles: number;
  bytesTransferred: number;
  errorMessage?: string;
}

export interface UploadFileInput {
  provider: CloudProviderType;
  folderPath: string;
  fileName: string;
  content: string; // Base64 encoded or UTF-8 text
  isBase64?: boolean;
}
export interface UploadFileOutput {
  success: boolean;
  file: {
    id: string;
    name: string;
    path: string;
    size: number;
  };
}

export interface DownloadFileInput {
  provider: CloudProviderType;
  filePath: string;
  maxBytes?: number;
}
export interface DownloadFileOutput {
  fileName: string;
  mimeType: string;
  size: number;
  content: string; // Sanitized UTF-8 representation (truncated if exceeding limit)
  isTruncated: boolean;
}

export interface CreateCloudFolderInput {
  provider: CloudProviderType;
  parentPath: string;
  folderName: string;
}
export interface CreateCloudFolderOutput {
  success: boolean;
  folder: {
    id: string;
    name: string;
    path: string;
    isNew: boolean;
  };
}

export interface MoveCloudFileInput {
  provider: CloudProviderType;
  sourcePath: string;
  destinationFolderPath: string;
}
export interface MoveCloudFileOutput {
  success: boolean;
  file: {
    id: string;
    name: string;
    path: string;
  };
}

export interface RenameCloudFileInput {
  provider: CloudProviderType;
  filePath: string;
  newName: string;
}
export interface RenameCloudFileOutput {
  success: boolean;
  file: {
    id: string;
    name: string;
    path: string;
  };
}

export interface DeleteCloudFileInput {
  provider: CloudProviderType;
  filePath: string;
  isFolder?: boolean;
}
export interface DeleteCloudFileOutput {
  success: boolean;
  deletedPath: string;
}

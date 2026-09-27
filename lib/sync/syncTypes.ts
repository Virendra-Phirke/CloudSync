/**
 * Universal Sync Engine Types
 */

import { CloudProvider, CloudItem, CloudProviderType } from '../providers/types';

export type EndpointType = 'local' | 'cloud';

export interface LocalSyncEndpoint {
  type: 'local';
  handle: any; // FileSystemDirectoryHandle
  name: string;
}

export interface CloudSyncEndpoint {
  type: 'cloud';
  provider: CloudProvider;
  folderIdOrPath?: string;
  name: string;
}

export type SyncEndpoint = LocalSyncEndpoint | CloudSyncEndpoint;

export interface ConflictItem {
  path: string;
  sourceLastModified: number;
  destinationLastModified: number;
  sourceSize?: number;
  destinationSize?: number;
  sourceFile?: File;
  sourceId?: string;
  destinationId?: string;
  mimeType?: string;
}

export type ConflictResolution = 'source' | 'destination' | 'skip';

export interface SyncJobOptions {
  source: SyncEndpoint;
  destination: SyncEndpoint;
  onProgress?: (message: string, progress?: { completed: number; total: number }) => void;
  onConflict?: (conflicts: ConflictItem[]) => Promise<ConflictResolution>;
  abortSignal?: AbortSignal;
}

export interface SyncJobStatus {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'aborted';
  sourceName: string;
  destinationName: string;
  filesProcessed: number;
  totalFiles: number;
  bytesTransferred: number;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

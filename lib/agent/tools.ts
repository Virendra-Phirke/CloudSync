/**
 * CloudSync Controlled AI Agent Tools Implementation
 * Exposes 12 controlled tools through security boundaries.
 * The AI agent NEVER accesses raw OAuth credentials, secrets, or unrestricted filesystem APIs.
 */

import {
  ToolSecurityContext,
  TaskExecutionMetrics,
  GetCloudConnectionsOutput,
  ListCloudFilesInput,
  ListCloudFilesOutput,
  GetCloudFileInput,
  GetCloudFileOutput,
  SearchCloudFilesInput,
  SearchCloudFilesOutput,
  CreateSyncJobInput,
  CreateSyncJobOutput,
  GetSyncStatusInput,
  GetSyncStatusOutput,
  UploadFileInput,
  UploadFileOutput,
  DownloadFileInput,
  DownloadFileOutput,
  CreateCloudFolderInput,
  CreateCloudFolderOutput,
  MoveCloudFileInput,
  MoveCloudFileOutput,
  RenameCloudFileInput,
  RenameCloudFileOutput,
  DeleteCloudFileInput,
  DeleteCloudFileOutput,
  DestructiveConfirmationRequest,
} from './types';
import {
  validateAndSanitizePath,
  validateProvider,
  enforceExecutionLimits,
  createDestructiveConfirmation,
  verifyDestructiveConfirmation,
  wrapUntrustedCloudData,
} from './securityPolicy';
import { recordAuditLog } from './auditLogger';
import { getProvider } from '../providers';
import { CloudProviderType } from '../providers/types';
import { isProviderAuthenticated, getProviderUserInfo } from '../oauth';

// In-memory active sync jobs store
const activeJobs = new Map<string, GetSyncStatusOutput['jobId'] & any>();

// ─── 1. get_cloud_connections ────────────────────────────────────────────────

export async function toolGetCloudConnections(
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<GetCloudConnectionsOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providers: CloudProviderType[] = ['google', 'dropbox', 'onedrive'];
  const connections = await Promise.all(
    providers.map(async (p) => {
      const provider = getProvider(p);
      const isAuth = await provider.isAuthenticated();
      const user = isAuth ? await provider.getUserInfo() : null;
      return {
        provider: p,
        name: provider.name,
        connected: isAuth,
        userEmail: user?.email,
      };
    })
  );

  recordAuditLog({
    user: context.userEmail,
    operation: 'get_cloud_connections',
    provider: 'system',
    connection: context.sessionId,
    path: '/',
    result: 'success',
  });

  return { connections };
}

// ─── 2. list_cloud_files ─────────────────────────────────────────────────────

export async function toolListCloudFiles(
  input: ListCloudFilesInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<ListCloudFilesOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const path = input.folderPath ? validateAndSanitizePath(input.folderPath) : '/';

  const provider = getProvider(providerType);
  if (!(await provider.isAuthenticated())) {
    recordAuditLog({
      user: context.userEmail,
      operation: 'list_cloud_files',
      provider: providerType,
      connection: context.sessionId,
      path,
      result: 'denied',
      error: 'Provider not authenticated',
    });
    throw new Error(`Provider ${provider.name} is not connected or authenticated.`);
  }

  const result = await provider.listFiles({
    folderIdOrPath: path,
    pageSize: Math.min(input.pageSize || 50, 100),
    pageToken: input.pageToken,
  });

  metrics.filesAffectedCount += result.items.length;

  recordAuditLog({
    user: context.userEmail,
    operation: 'list_cloud_files',
    provider: providerType,
    connection: context.sessionId,
    path,
    result: 'success',
    details: { itemCount: result.items.length },
  });

  return {
    items: result.items.map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      isDirectory: item.isDirectory,
      size: item.size,
      modifiedTime: new Date(item.modifiedTime).toISOString(),
      mimeType: item.mimeType,
    })),
    nextPageToken: result.nextPageToken,
    hasMore: result.hasMore,
  };
}

// ─── 3. get_cloud_file ───────────────────────────────────────────────────────

export async function toolGetCloudFile(
  input: GetCloudFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<GetCloudFileOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const path = validateAndSanitizePath(input.filePath);

  const provider = getProvider(providerType);
  const metadata = await provider.getMetadata(path);

  if (!metadata) {
    recordAuditLog({
      user: context.userEmail,
      operation: 'get_cloud_file',
      provider: providerType,
      connection: context.sessionId,
      path,
      result: 'failed',
      error: 'File not found',
    });
    throw new Error(`File not found: ${path}`);
  }

  recordAuditLog({
    user: context.userEmail,
    operation: 'get_cloud_file',
    provider: providerType,
    connection: context.sessionId,
    path,
    result: 'success',
  });

  return {
    file: {
      id: metadata.id,
      name: metadata.name,
      path: metadata.path,
      size: metadata.size,
      modifiedTime: new Date(metadata.modifiedTime).toISOString(),
      mimeType: metadata.mimeType,
    },
  };
}

// ─── 4. search_cloud_files ───────────────────────────────────────────────────

export async function toolSearchCloudFiles(
  input: SearchCloudFilesInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<SearchCloudFilesOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const folder = input.folderPath ? validateAndSanitizePath(input.folderPath) : '/';
  const query = (input.query || '').trim().toLowerCase();

  const provider = getProvider(providerType);
  const list = await provider.listFiles({ folderIdOrPath: folder, pageSize: 100 });

  const matches = list.items
    .filter((f) => f.name.toLowerCase().includes(query))
    .slice(0, 20)
    .map((f) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      isDirectory: f.isDirectory,
      size: f.size,
      modifiedTime: new Date(f.modifiedTime).toISOString(),
    }));

  recordAuditLog({
    user: context.userEmail,
    operation: 'search_cloud_files',
    provider: providerType,
    connection: context.sessionId,
    path: folder,
    result: 'success',
    details: { matchCount: matches.length },
  });

  return { matches };
}

// ─── 5. create_sync_job ──────────────────────────────────────────────────────

export async function toolCreateSyncJob(
  input: CreateSyncJobInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<CreateSyncJobOutput | DestructiveConfirmationRequest> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  // Large-scale synchronization requires confirmation if whole drive/root
  const isLargeScale =
    (!input.sourcePath || input.sourcePath === '/') &&
    (!input.destinationPath || input.destinationPath === '/');

  if (isLargeScale && !context.isConfirmed) {
    const confirmation = createDestructiveConfirmation(
      'large_scale_sync',
      `Synchronize entire cloud drive from ${input.sourceProvider} to ${input.destinationProvider}`,
      [{ path: '/', provider: input.sourceProvider }],
      context.userId
    );
    recordAuditLog({
      user: context.userEmail,
      operation: 'create_sync_job',
      provider: input.sourceProvider === 'local' ? 'local' : input.sourceProvider,
      connection: context.sessionId,
      path: '/',
      result: 'pending_confirmation',
    });
    return confirmation;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  activeJobs.set(jobId, {
    jobId,
    status: 'running',
    filesProcessed: 0,
    totalFiles: 1,
    bytesTransferred: 0,
  });

  recordAuditLog({
    user: context.userEmail,
    operation: 'create_sync_job',
    provider: input.sourceProvider === 'local' ? 'local' : input.sourceProvider,
    connection: context.sessionId,
    path: input.sourcePath || '/',
    result: 'success',
    details: { jobId, destination: input.destinationProvider },
  });

  return {
    jobId,
    status: 'started',
    source: `${input.sourceProvider}:${input.sourcePath || '/'}`,
    destination: `${input.destinationProvider}:${input.destinationPath || '/'}`,
  };
}

// ─── 6. get_sync_status ──────────────────────────────────────────────────────

export async function toolGetSyncStatus(
  input: GetSyncStatusInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<GetSyncStatusOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const job = activeJobs.get(input.jobId);
  if (!job) {
    return {
      jobId: input.jobId,
      status: 'idle',
      filesProcessed: 0,
      totalFiles: 0,
      bytesTransferred: 0,
      errorMessage: 'Job not found',
    };
  }

  return job;
}

// ─── 7. upload_file ──────────────────────────────────────────────────────────

export async function toolUploadFile(
  input: UploadFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<UploadFileOutput | DestructiveConfirmationRequest> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const folder = validateAndSanitizePath(input.folderPath);
  const fileName = input.fileName.trim();
  const filePath = `${folder}/${fileName}`.replace(/\/+/g, '/');

  const provider = getProvider(providerType);

  // Check if file already exists -> Overwrite is a destructive action requiring confirmation!
  const existing = await provider.getMetadata(filePath).catch(() => null);
  if (existing && !context.isConfirmed) {
    const confirmation = createDestructiveConfirmation(
      'overwrite',
      `Overwrite existing file at "${filePath}" (${existing.size} bytes)`,
      [{ path: filePath, name: fileName, size: existing.size, provider: providerType }],
      context.userId
    );
    recordAuditLog({
      user: context.userEmail,
      operation: 'upload_file_overwrite',
      provider: providerType,
      connection: context.sessionId,
      path: filePath,
      result: 'pending_confirmation',
    });
    return confirmation;
  }

  // Convert payload
  const buffer = input.isBase64
    ? Buffer.from(input.content, 'base64')
    : Buffer.from(input.content, 'utf-8');

  metrics.bytesTransferred += buffer.length;
  enforceExecutionLimits(metrics);

  const blob = new Blob([buffer]);
  const uploaded = await provider.uploadFile(blob, folder, fileName);
  metrics.filesAffectedCount++;

  recordAuditLog({
    user: context.userEmail,
    operation: 'upload_file',
    provider: providerType,
    connection: context.sessionId,
    path: filePath,
    result: 'success',
    details: { bytes: buffer.length },
  });

  return {
    success: true,
    file: {
      id: uploaded.id,
      name: uploaded.name,
      path: uploaded.path,
      size: uploaded.size,
    },
  };
}

// ─── 8. download_file ────────────────────────────────────────────────────────

export async function toolDownloadFile(
  input: DownloadFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<DownloadFileOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const path = validateAndSanitizePath(input.filePath);
  const maxBytes = input.maxBytes || 50000; // 50KB default preview limit for AI safety

  const provider = getProvider(providerType);
  const metadata = await provider.getMetadata(path);
  if (!metadata || metadata.isDirectory) {
    throw new Error(`File not found or is a directory: ${path}`);
  }

  const blob = await provider.downloadFile(path);
  metrics.bytesTransferred += Math.min(blob.size, maxBytes);
  enforceExecutionLimits(metrics);

  const text = await blob.text();
  const isTruncated = text.length > maxBytes;
  const content = isTruncated ? text.slice(0, maxBytes) : text;

  recordAuditLog({
    user: context.userEmail,
    operation: 'download_file',
    provider: providerType,
    connection: context.sessionId,
    path,
    result: 'success',
    details: { size: blob.size, truncated: isTruncated },
  });

  return {
    fileName: metadata.name,
    mimeType: metadata.mimeType || 'text/plain',
    size: metadata.size,
    content: wrapUntrustedCloudData(content, 'document_content'),
    isTruncated,
  };
}

// ─── 9. create_cloud_folder ──────────────────────────────────────────────────

export async function toolCreateCloudFolder(
  input: CreateCloudFolderInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<CreateCloudFolderOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const parent = validateAndSanitizePath(input.parentPath);
  const folderName = input.folderName.trim();

  const provider = getProvider(providerType);
  const folder = await provider.createFolder(folderName, parent);
  metrics.filesAffectedCount++;

  recordAuditLog({
    user: context.userEmail,
    operation: 'create_cloud_folder',
    provider: providerType,
    connection: context.sessionId,
    path: `${parent}/${folderName}`,
    result: 'success',
  });

  return {
    success: true,
    folder: {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      isNew: folder.isNew,
    },
  };
}

// ─── 10. move_cloud_file ─────────────────────────────────────────────────────

export async function toolMoveCloudFile(
  input: MoveCloudFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<MoveCloudFileOutput | DestructiveConfirmationRequest> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const sourcePath = validateAndSanitizePath(input.sourcePath);
  const destPath = validateAndSanitizePath(input.destinationFolderPath);

  // If moving an entire folder or root, require confirmation
  const isBulk = sourcePath.split('/').filter(Boolean).length <= 1;
  if (isBulk && !context.isConfirmed) {
    const confirmation = createDestructiveConfirmation(
      'bulk_move',
      `Move root/top-level item "${sourcePath}" to "${destPath}"`,
      [{ path: sourcePath, provider: providerType }],
      context.userId
    );
    recordAuditLog({
      user: context.userEmail,
      operation: 'move_cloud_file',
      provider: providerType,
      connection: context.sessionId,
      path: sourcePath,
      result: 'pending_confirmation',
    });
    return confirmation;
  }

  const provider = getProvider(providerType);
  const moved = await provider.moveFile(sourcePath, destPath);
  metrics.filesAffectedCount++;

  recordAuditLog({
    user: context.userEmail,
    operation: 'move_cloud_file',
    provider: providerType,
    connection: context.sessionId,
    path: sourcePath,
    result: 'success',
    details: { destination: destPath },
  });

  return {
    success: true,
    file: {
      id: moved.id,
      name: moved.name,
      path: moved.path,
    },
  };
}

// ─── 11. rename_cloud_file ───────────────────────────────────────────────────

export async function toolRenameCloudFile(
  input: RenameCloudFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<RenameCloudFileOutput> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const filePath = validateAndSanitizePath(input.filePath);
  const newName = input.newName.trim();

  const provider = getProvider(providerType);
  const renamed = await provider.renameFile(filePath, newName);
  metrics.filesAffectedCount++;

  recordAuditLog({
    user: context.userEmail,
    operation: 'rename_cloud_file',
    provider: providerType,
    connection: context.sessionId,
    path: filePath,
    result: 'success',
    details: { newName },
  });

  return {
    success: true,
    file: {
      id: renamed.id,
      name: renamed.name,
      path: renamed.path,
    },
  };
}

// ─── 12. delete_cloud_file ───────────────────────────────────────────────────

export async function toolDeleteCloudFile(
  input: DeleteCloudFileInput,
  context: ToolSecurityContext,
  metrics: TaskExecutionMetrics
): Promise<DeleteCloudFileOutput | DestructiveConfirmationRequest> {
  enforceExecutionLimits(metrics);
  metrics.toolCallsCount++;

  const providerType = validateProvider(input.provider);
  const filePath = validateAndSanitizePath(input.filePath);

  // DELETION IS A DESTRUCTIVE ACTION: Enforce explicit user confirmation token!
  const isConfirmed =
    context.isConfirmed ||
    (context.confirmationToken &&
      verifyDestructiveConfirmation(
        context.confirmationToken,
        input.isFolder ? 'bulk_delete' : 'delete',
        context.userId
      ));

  if (!isConfirmed) {
    const confirmation = createDestructiveConfirmation(
      input.isFolder ? 'bulk_delete' : 'delete',
      `Permanently delete ${input.isFolder ? 'folder and contents' : 'file'} at "${filePath}"`,
      [{ path: filePath, provider: providerType }],
      context.userId
    );

    recordAuditLog({
      user: context.userEmail,
      operation: 'delete_cloud_file',
      provider: providerType,
      connection: context.sessionId,
      path: filePath,
      result: 'pending_confirmation',
    });

    return confirmation;
  }

  const provider = getProvider(providerType);
  await provider.deleteFile(filePath);
  metrics.filesAffectedCount++;

  recordAuditLog({
    user: context.userEmail,
    operation: 'delete_cloud_file',
    provider: providerType,
    connection: context.sessionId,
    path: filePath,
    result: 'success',
  });

  return {
    success: true,
    deletedPath: filePath,
  };
}

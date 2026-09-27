/**
 * CloudSync AI Agent Security Policy Engine
 * Enforces authentication, authorization, path boundaries, rate limits,
 * prompt injection defense, and cryptographic destructive-action confirmations.
 */

import {
  ToolSecurityContext,
  SecurityLimits,
  TaskExecutionMetrics,
  DestructiveConfirmationRequest,
} from './types';
import { CloudProviderType } from '../providers/types';
import { encryptPayload, decryptPayload } from '../serverCrypto';

export const DEFAULT_SECURITY_LIMITS: SecurityLimits = {
  maxToolCallsPerTask: 25,
  maxFilesAffected: 50,
  maxBytesTransferred: 50 * 1024 * 1024, // 50 MB
  maxConcurrentOperations: 3,
  maxExecutionTimeMs: 60000, // 60 seconds
};

export class SecurityPolicyViolation extends Error {
  public code: string;
  constructor(message: string, code = 'SECURITY_POLICY_VIOLATION') {
    super(`[SecurityPolicy] ${message}`);
    this.name = 'SecurityPolicyViolation';
    this.code = code;
  }
}

/**
 * Validates and sanitizes a cloud file path, rejecting path traversal attempts.
 */
export function validateAndSanitizePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new SecurityPolicyViolation('Path must be a non-empty string', 'INVALID_PATH');
  }

  // 1. Block null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(path)) {
    throw new SecurityPolicyViolation('Path contains forbidden control characters', 'FORBIDDEN_CHARACTERS');
  }

  // 2. Block path traversal attempts (..)
  const segments = path.replace(/\\/g, '/').split('/');
  for (const seg of segments) {
    if (seg === '..') {
      throw new SecurityPolicyViolation('Path traversal (..) is strictly prohibited', 'PATH_TRAVERSAL_DETECTED');
    }
  }

  // 3. Block Windows / POSIX drive root hijacks
  if (/^[a-zA-Z]:/.test(path)) {
    throw new SecurityPolicyViolation('Absolute drive paths are not permitted in cloud namespaces', 'DRIVE_LETTER_BLOCKED');
  }

  // Normalize slashes
  const clean = path.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
  const normalized = clean.startsWith('/') ? clean : `/${clean}`;
  return normalized;
}

/**
 * Validates cloud provider identifier.
 */
export function validateProvider(provider: string): CloudProviderType {
  if (provider !== 'google' && provider !== 'dropbox' && provider !== 'onedrive') {
    throw new SecurityPolicyViolation(`Invalid or unsupported cloud provider: ${provider}`, 'INVALID_PROVIDER');
  }
  return provider as CloudProviderType;
}

/**
 * Verifies that the task has not exceeded security execution quotas.
 */
export function enforceExecutionLimits(
  metrics: TaskExecutionMetrics,
  limits: SecurityLimits = DEFAULT_SECURITY_LIMITS
): void {
  const elapsed = Date.now() - metrics.startTime;
  if (elapsed > limits.maxExecutionTimeMs) {
    throw new SecurityPolicyViolation(
      `Execution time limit exceeded (${elapsed}ms > ${limits.maxExecutionTimeMs}ms)`,
      'TIME_LIMIT_EXCEEDED'
    );
  }

  if (metrics.toolCallsCount >= limits.maxToolCallsPerTask) {
    throw new SecurityPolicyViolation(
      `Maximum tool calls exceeded (${metrics.toolCallsCount} >= ${limits.maxToolCallsPerTask})`,
      'TOOL_CALL_LIMIT_EXCEEDED'
    );
  }

  if (metrics.filesAffectedCount >= limits.maxFilesAffected) {
    throw new SecurityPolicyViolation(
      `Maximum affected files limit exceeded (${metrics.filesAffectedCount} >= ${limits.maxFilesAffected})`,
      'FILE_LIMIT_EXCEEDED'
    );
  }

  if (metrics.bytesTransferred >= limits.maxBytesTransferred) {
    throw new SecurityPolicyViolation(
      `Data transfer quota exceeded (${metrics.bytesTransferred} bytes >= ${limits.maxBytesTransferred} bytes)`,
      'DATA_TRANSFER_LIMIT_EXCEEDED'
    );
  }

  if (metrics.activeOperations > limits.maxConcurrentOperations) {
    throw new SecurityPolicyViolation(
      `Maximum concurrent operations exceeded (${metrics.activeOperations} > ${limits.maxConcurrentOperations})`,
      'CONCURRENCY_LIMIT_EXCEEDED'
    );
  }
}

/**
 * Issues an authenticated confirmation token for destructive operations.
 */
export function createDestructiveConfirmation(
  action: DestructiveConfirmationRequest['action'],
  description: string,
  affectedItems: DestructiveConfirmationRequest['affectedItems'],
  userId: string,
  validityMs = 300000 // 5 minutes
): DestructiveConfirmationRequest {
  const expiresAt = Date.now() + validityMs;
  const payload = {
    action,
    userId,
    affectedItems,
    expiresAt,
    nonce: Math.random().toString(36).slice(2),
  };

  const confirmationToken = encryptPayload(payload);

  return {
    requiresConfirmation: true,
    action,
    description,
    confirmationToken,
    expiresAt,
    affectedItems,
  };
}

/**
 * Validates a confirmation token for a destructive operation.
 */
export function verifyDestructiveConfirmation(
  confirmationToken: string,
  expectedAction: DestructiveConfirmationRequest['action'],
  userId: string
): boolean {
  if (!confirmationToken) return false;

  const decrypted = decryptPayload<{
    action: string;
    userId: string;
    expiresAt: number;
    affectedItems: any[];
  }>(confirmationToken);

  if (!decrypted) return false;
  if (decrypted.action !== expectedAction) return false;
  if (decrypted.userId !== userId) return false;
  if (Date.now() > decrypted.expiresAt) return false;

  return true;
}

/**
 * Sanitizes untrusted cloud data (filenames, document text, metadata) to prevent prompt injection.
 * Escapes delimiters and wraps the content in unambiguous boundary tags.
 */
export function wrapUntrustedCloudData(
  content: string,
  type: 'metadata' | 'filename' | 'document_content'
): string {
  if (!content) return '';

  // Neutralize common prompt injection boundary escapes
  const sanitized = content
    .replace(/<\/untrusted_data>/gi, '&lt;/untrusted_data&gt;')
    .replace(/<system>/gi, '&lt;system&gt;')
    .replace(/<\/system>/gi, '&lt;/system&gt;')
    .replace(/```/g, "'''");

  return `<untrusted_cloud_data type="${type}">\n${sanitized}\n</untrusted_cloud_data>`;
}

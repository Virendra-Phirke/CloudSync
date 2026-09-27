/**
 * CloudSync Audit Logger
 * Records security-relevant operations with rigorous redaction of secrets, tokens, and file contents.
 */

import { AuditLogEntry } from './types';
import crypto from 'crypto';

const MAX_AUDIT_LOG_BUFFER = 1000;
const auditBuffer: AuditLogEntry[] = [];

const SENSITIVE_KEY_REGEX = /token|secret|key|password|auth|authorization|credential|content|payload|blob/i;

/**
 * Recursively redacts sensitive keys from an arbitrary object.
 */
function sanitizeAuditDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      sanitized[k] = sanitizeAuditDetails(v as Record<string, unknown>);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Records an audit log event.
 */
export function recordAuditLog(
  entry: Omit<AuditLogEntry, 'operationId' | 'timestamp'> & { operationId?: string }
): AuditLogEntry {
  const finalEntry: AuditLogEntry = {
    operationId: entry.operationId || crypto.randomUUID(),
    timestamp: Date.now(),
    user: entry.user || 'anonymous',
    operation: entry.operation,
    provider: entry.provider,
    connection: entry.connection,
    path: entry.path || '/',
    result: entry.result,
    error: entry.error,
    details: sanitizeAuditDetails(entry.details),
  };

  // Push to memory buffer with bounded size
  auditBuffer.unshift(finalEntry);
  if (auditBuffer.length > MAX_AUDIT_LOG_BUFFER) {
    auditBuffer.pop();
  }

  // Structured stdout logging
  console.log(
    `[AUDIT] [${finalEntry.result.toUpperCase()}] op=${finalEntry.operation} user=${finalEntry.user} provider=${finalEntry.provider} path="${finalEntry.path}" id=${finalEntry.operationId}`
  );

  return finalEntry;
}

/**
 * Returns recent audit log entries.
 */
export function getAuditLogs(limit = 100): AuditLogEntry[] {
  return auditBuffer.slice(0, limit);
}

/**
 * Clears audit buffer (used for testing).
 */
export function clearAuditLogs(): void {
  auditBuffer.length = 0;
}

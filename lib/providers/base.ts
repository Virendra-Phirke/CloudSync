/**
 * Base Cloud Provider utilities
 * Shared HTTP helpers, retry with exponential backoff, rate limiting, and path normalization
 */

export interface RetryOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxDelayMs?: number;
}

export class ProviderError extends Error {
  public status?: number;
  public provider: string;
  public code?: string;

  constructor(message: string, provider: string, status?: number, code?: string) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.code = code;
  }
}

/**
 * Normalizes cloud paths to standard `/folder/file.ext` format without trailing slashes.
 */
export function normalizeCloudPath(path: string): string {
  if (!path || path === '/' || path === '.') return '/';
  const clean = path.replace(/\\/g, '/').replace(/\/+/g, '/').trim();
  const withLeading = clean.startsWith('/') ? clean : `/${clean}`;
  return withLeading.length > 1 && withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

/**
 * Standard fetch with automatic exponential backoff, rate-limit (429), and 5xx retries.
 */
export async function fetchWithProviderRetry(
  provider: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const initialBackoffMs = options.initialBackoffMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);

      // Non-retryable success or client error (400-428, 404, etc.)
      if (res.ok || (res.status >= 400 && res.status < 429) || res.status === 404) {
        return res;
      }

      // Retryable status: 429 (Rate Limit) or 5xx (Server Error)
      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          return res;
        }

        const retryAfter = res.headers.get('Retry-After');
        let delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : initialBackoffMs * Math.pow(2, attempt) + Math.random() * 200;

        if (isNaN(delayMs) || delayMs <= 0) {
          delayMs = initialBackoffMs * Math.pow(2, attempt);
        }
        delayMs = Math.min(delayMs, maxDelayMs);

        console.warn(`[${provider}] Status ${res.status} on attempt ${attempt + 1}/${maxRetries}. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return res;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = Math.min(initialBackoffMs * Math.pow(2, attempt), maxDelayMs);
        console.warn(`[${provider}] Network failure on attempt ${attempt + 1}. Retrying in ${delayMs}ms...`, err?.message);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new ProviderError('Request failed after maximum retries', provider);
}

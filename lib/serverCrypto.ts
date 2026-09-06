import crypto from 'crypto';

/**
 * Derives a 32-byte AES key from the server-only GOOGLE_CLIENT_SECRET or SESSION_SECRET.
 * This function only executes on the Vercel server backend.
 */
function getServerKey(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) {
    throw new Error('Server key configuration missing: GOOGLE_CLIENT_SECRET is not set.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts an arbitrary object into an authenticated AES-256-GCM token string.
 * Format: iv:authTag:ciphertext (all base64url encoded)
 */
export function encryptPayload(data: Record<string, unknown>): string {
  const key = getServerKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decrypts an authenticated AES-256-GCM token string.
 * Returns null if tampering is detected, key mismatch, or format invalid.
 */
export function decryptPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(authTagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');

    const key = getServerKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Calculates base64url-encoded SHA-256 hash for PKCE verification.
 */
export function calculatePkceChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

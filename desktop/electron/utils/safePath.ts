import path from 'path';

/**
 * Validates and safely resolves a relative path within a base directory.
 * Throws an Error if path traversal is detected (e.g. `../../windows/system32`).
 */
export function resolveSafePath(baseFolder: string, relativePath = ''): string {
  if (!baseFolder || typeof baseFolder !== 'string') {
    throw new Error('Base folder path is required');
  }

  const normalizedBase = path.resolve(baseFolder);
  const resolvedTarget = path.resolve(normalizedBase, relativePath);

  // Check if target starts with base folder
  // On Windows, paths are case-insensitive, so normalize comparison
  const baseCompare = process.platform === 'win32' ? normalizedBase.toLowerCase() : normalizedBase;
  const targetCompare = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;

  if (!targetCompare.startsWith(baseCompare)) {
    throw new Error(`Path traversal violation: "${relativePath}" escapes root folder "${baseFolder}"`);
  }

  // Also ensure no null byte injection
  if (resolvedTarget.indexOf('\0') !== -1) {
    throw new Error('Path contains null bytes');
  }

  return resolvedTarget;
}

/**
 * Normalizes relative path separators to POSIX forward slashes for cross-platform and web consistency.
 */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

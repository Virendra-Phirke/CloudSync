import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dialog } from 'electron';
import { resolveSafePath, toPosixPath } from '../utils/safePath';
import { logger } from '../utils/logger';
import { DesktopFileEntry, DesktopFolderStats } from '../types';
import { storageService } from './storageService';

// Standard mime-types without external package dependency
const MIME_TYPES: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  jsx: 'application/javascript',
  ts: 'application/typescript',
  tsx: 'application/typescript',
  json: 'application/json',
  csv: 'text/csv',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
};

export function getMimeType(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return 'application/vnd.google-apps.folder';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Loads .syncignore patterns from root folder if present.
 */
export async function loadSyncIgnore(folderPath: string): Promise<Set<string>> {
  const ignoredPatterns = new Set<string>([
    'node_modules',
    '.git',
    '.next',
    'desktop/out',
    '.syncignore',
  ]);

  try {
    const ignoreFilePath = path.join(folderPath, '.syncignore');
    if (fsSync.existsSync(ignoreFilePath)) {
      const content = await fs.readFile(ignoreFilePath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!')) {
          ignoredPatterns.add(trimmed.replace(/\/$/, ''));
        }
      }
    }
  } catch (err) {
    logger.warn('FILESYSTEM', `Could not read .syncignore in ${folderPath}`, err);
  }

  return ignoredPatterns;
}

export function isPathIgnored(relativePath: string, ignoredPatterns: Set<string>): boolean {
  const normalized = toPosixPath(relativePath);
  const segments = normalized.split('/');

  for (const pattern of ignoredPatterns) {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (normalized.endsWith(ext)) return true;
    } else {
      const cleanPattern = pattern.replace(/\/$/, '');
      if (segments.includes(cleanPattern) || normalized === cleanPattern || normalized.startsWith(cleanPattern + '/')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Trusted Roots Manager
 * Ensures the renderer cannot pass arbitrary absolute paths.
 * All operations must reference a pre-registered rootId.
 */
export class TrustedRootsManager {
  private roots = new Map<string, string>(); // rootId -> absolutePath

  async init() {
    const settings = await storageService.getSettings();
    for (const folder of settings.monitoredFolders) {
      if (folder.id && folder.path && fsSync.existsSync(folder.path)) {
        this.roots.set(folder.id, path.resolve(folder.path));
        logger.info('FILESYSTEM', `Loaded trusted root: ${folder.id} -> ${folder.name}`);
      }
    }
  }

  registerRoot(absolutePath: string, name?: string): { rootId: string; name: string } {
    const normalized = path.resolve(absolutePath);
    // Check if already registered
    for (const [id, existingPath] of this.roots.entries()) {
      if (existingPath.toLowerCase() === normalized.toLowerCase()) {
        return { rootId: id, name: name || path.basename(normalized) };
      }
    }

    const rootId = `root-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const folderName = name || path.basename(normalized);
    this.roots.set(rootId, normalized);

    storageService.addMonitoredFolder({ id: rootId, name: folderName, path: normalized });
    logger.info('FILESYSTEM', `Registered new trusted root: ${rootId} -> ${folderName}`);
    return { rootId, name: folderName };
  }

  getRootPath(rootId: string): string {
    const rootPath = this.roots.get(rootId);
    if (!rootPath) {
      throw new Error(`Unauthorized or unknown rootId: ${rootId}`);
    }
    return rootPath;
  }

  removeRoot(rootId: string) {
    const rootPath = this.roots.get(rootId);
    if (rootPath) {
      this.roots.delete(rootId);
      storageService.removeMonitoredFolder(rootPath);
    }
  }

  getAllRoots(): Array<{ rootId: string; name: string }> {
    const res: Array<{ rootId: string; name: string }> = [];
    for (const [id, rootPath] of this.roots.entries()) {
      res.push({ rootId: id, name: path.basename(rootPath) });
    }
    return res;
  }
}

export const trustedRoots = new TrustedRootsManager();

export class FilesystemService {
  /**
   * Prompts user with native Windows folder dialog and registers trusted root.
   * Returns { rootId, name } — absolute path is NOT sent to renderer.
   */
  async selectFolder(): Promise<{ rootId: string; name: string } | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select Sync Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    return trustedRoots.registerRoot(selectedPath);
  }

  /**
   * Scans immediate children of a folder relative to a trusted root.
   */
  async scanFolderChildren(rootId: string, relativePath = ''): Promise<DesktopFileEntry[]> {
    const rootPath = trustedRoots.getRootPath(rootId);
    const targetDir = resolveSafePath(rootPath, relativePath);
    const ignored = await loadSyncIgnore(rootPath);

    try {
      const dirEntries = await fs.readdir(targetDir, { withFileTypes: true });
      const results: DesktopFileEntry[] = [];

      for (const dirent of dirEntries) {
        const entryRelPath = relativePath ? `${relativePath}/${dirent.name}` : dirent.name;
        if (isPathIgnored(entryRelPath, ignored)) continue;

        const fullPath = path.join(targetDir, dirent.name);
        try {
          const stats = await fs.stat(fullPath);
          const isDir = dirent.isDirectory();

          results.push({
            id: toPosixPath(entryRelPath),
            name: dirent.name,
            path: toPosixPath(entryRelPath),
            size: isDir ? 0 : stats.size,
            lastModified: stats.mtimeMs,
            mimeType: getMimeType(dirent.name, isDir),
            isDirectory: isDir,
          });
        } catch {
          // skip inaccessible
        }
      }

      results.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return results;
    } catch (err: any) {
      logger.error('FILESYSTEM', `Failed to scan directory for root ${rootId}`, err);
      throw err;
    }
  }

  /**
   * Recursively scans directory relative to trusted root.
   */
  async scanFolderFiles(rootId: string, relativePath = '', maxDepth = 6, currentDepth = 0): Promise<DesktopFileEntry[]> {
    if (currentDepth > maxDepth) return [];

    const rootPath = trustedRoots.getRootPath(rootId);
    const targetDir = resolveSafePath(rootPath, relativePath);
    const ignored = await loadSyncIgnore(rootPath);
    const results: DesktopFileEntry[] = [];

    try {
      const dirEntries = await fs.readdir(targetDir, { withFileTypes: true });

      for (const dirent of dirEntries) {
        const entryRelPath = relativePath ? `${relativePath}/${dirent.name}` : dirent.name;
        if (isPathIgnored(entryRelPath, ignored)) continue;

        const fullPath = path.join(targetDir, dirent.name);
        try {
          const stats = await fs.stat(fullPath);
          const isDir = dirent.isDirectory();

          results.push({
            id: toPosixPath(entryRelPath),
            name: dirent.name,
            path: toPosixPath(entryRelPath),
            size: isDir ? 0 : stats.size,
            lastModified: stats.mtimeMs,
            mimeType: getMimeType(dirent.name, isDir),
            isDirectory: isDir,
          });

          if (isDir) {
            const subEntries = await this.scanFolderFiles(rootId, entryRelPath, maxDepth, currentDepth + 1);
            results.push(...subEntries);
          }
        } catch {
          // skip unreadable
        }
      }

      if (currentDepth === 0) {
        results.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.path.localeCompare(b.path);
        });
      }

      return results;
    } catch (err: any) {
      logger.error('FILESYSTEM', `Error scanning recursive directory in root ${rootId}`, err);
      return [];
    }
  }

  /**
   * Reads file contents safely into an ArrayBuffer.
   */
  async readFile(rootId: string, relativePath: string): Promise<{ data: ArrayBuffer; mimeType: string; size: number; lastModified: number } | null> {
    const rootPath = trustedRoots.getRootPath(rootId);
    const filePath = resolveSafePath(rootPath, relativePath);
    try {
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        mimeType: getMimeType(path.basename(filePath), false),
        size: stats.size,
        lastModified: stats.mtimeMs,
      };
    } catch (err: any) {
      logger.error('FILESYSTEM', `Failed to read file ${relativePath}`, err);
      return null;
    }
  }

  /**
   * Writes file data to disk safely within trusted root.
   */
  async writeFile(rootId: string, relativePath: string, data: ArrayBuffer | Uint8Array): Promise<boolean> {
    const rootPath = trustedRoots.getRootPath(rootId);
    const targetFile = resolveSafePath(rootPath, relativePath);
    try {
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
      await fs.writeFile(targetFile, buffer);
      logger.info('FILESYSTEM', `Wrote file ${relativePath} (${buffer.length} bytes)`);
      return true;
    } catch (err: any) {
      logger.error('FILESYSTEM', `Failed to write file ${relativePath}`, err);
      throw err;
    }
  }

  /**
   * Deletes a file or directory within trusted root.
   */
  async deleteEntry(rootId: string, relativePath: string): Promise<boolean> {
    const rootPath = trustedRoots.getRootPath(rootId);
    const targetPath = resolveSafePath(rootPath, relativePath);
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
      } else {
        await fs.unlink(targetPath);
      }
      logger.info('FILESYSTEM', `Deleted entry: ${relativePath}`);
      return true;
    } catch (err: any) {
      logger.error('FILESYSTEM', `Failed to delete entry ${relativePath}`, err);
      return false;
    }
  }

  /**
   * Creates a directory recursively within trusted root.
   */
  async createDirectory(rootId: string, relativePath: string): Promise<boolean> {
    const rootPath = trustedRoots.getRootPath(rootId);
    const dirPath = resolveSafePath(rootPath, relativePath);
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (err: any) {
      logger.error('FILESYSTEM', `Failed to create directory ${relativePath}`, err);
      return false;
    }
  }

  /**
   * Calculates aggregate stats for trusted root.
   */
  async getFolderStats(rootId: string): Promise<DesktopFolderStats> {
    const files = await this.scanFolderFiles(rootId);
    let fileCount = 0;
    let dirCount = 0;
    let totalSize = 0;

    for (const f of files) {
      if (f.isDirectory) {
        dirCount++;
      } else {
        fileCount++;
        totalSize += f.size;
      }
    }

    return { fileCount, dirCount, totalSize };
  }
}

export const filesystemService = new FilesystemService();

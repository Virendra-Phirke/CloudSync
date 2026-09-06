import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { logger } from '../utils/logger';
import { toPosixPath } from '../utils/safePath';
import { loadSyncIgnore, isPathIgnored, trustedRoots } from './filesystem';
import { DesktopFolderWatcherEvent } from '../types';

type WatcherEventCallback = (event: DesktopFolderWatcherEvent) => void;

export class FileWatcherService {
  private watchers = new Map<string, FSWatcher>(); // rootId -> FSWatcher
  private listeners: WatcherEventCallback[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private DEBOUNCE_MS = 800;

  addListener(callback: WatcherEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  async watchFolder(rootId: string): Promise<boolean> {
    let normalizedRoot: string;
    try {
      normalizedRoot = trustedRoots.getRootPath(rootId);
    } catch {
      logger.warn('FILE-WATCHER', `Cannot watch unknown rootId: ${rootId}`);
      return false;
    }

    if (this.watchers.has(rootId)) {
      return true;
    }

    try {
      const ignoredPatterns = await loadSyncIgnore(normalizedRoot);

      const watcher = chokidar.watch(normalizedRoot, {
        ignored: (targetPath: string) => {
          const relative = path.relative(normalizedRoot, targetPath);
          if (!relative || relative === '.') return false;
          return isPathIgnored(relative, ignoredPatterns);
        },
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 400,
          pollInterval: 100,
        },
        depth: 6,
      });

      watcher
        .on('add', (filePath) => this.handleEvent('add', rootId, normalizedRoot, filePath))
        .on('change', (filePath) => this.handleEvent('change', rootId, normalizedRoot, filePath))
        .on('unlink', (filePath) => this.handleEvent('unlink', rootId, normalizedRoot, filePath))
        .on('addDir', (dirPath) => this.handleEvent('addDir', rootId, normalizedRoot, dirPath))
        .on('unlinkDir', (dirPath) => this.handleEvent('unlinkDir', rootId, normalizedRoot, dirPath))
        .on('error', (err) => logger.error('FILE-WATCHER', `Watcher error in root ${rootId}`, err));

      this.watchers.set(rootId, watcher);
      logger.info('FILE-WATCHER', `Watching root: ${rootId}`);
      return true;
    } catch (err: any) {
      logger.error('FILE-WATCHER', `Failed to start watching root ${rootId}`, err);
      return false;
    }
  }

  async stopWatchingFolder(rootId: string): Promise<boolean> {
    const watcher = this.watchers.get(rootId);
    if (!watcher) return false;

    try {
      await watcher.close();
      this.watchers.delete(rootId);
      logger.info('FILE-WATCHER', `Stopped watching root: ${rootId}`);
      return true;
    } catch (err: any) {
      logger.error('FILE-WATCHER', `Error stopping watcher for root ${rootId}`, err);
      return false;
    }
  }

  async stopAll(): Promise<void> {
    for (const [rootId, watcher] of this.watchers.entries()) {
      try {
        await watcher.close();
      } catch {}
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private handleEvent(
    type: DesktopFolderWatcherEvent['type'],
    rootId: string,
    rootFolder: string,
    targetPath: string
  ) {
    const relative = toPosixPath(path.relative(rootFolder, targetPath));
    const eventKey = `${rootId}::${relative}`;

    // Coalesce rapid file writes into single debounced event
    if (this.debounceTimers.has(eventKey)) {
      clearTimeout(this.debounceTimers.get(eventKey)!);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(eventKey);

      const event: DesktopFolderWatcherEvent = {
        type,
        folderPath: rootId,
        relativePath: relative,
        timestamp: Date.now(),
      };

      logger.info('FILE-WATCHER', `[DEBOUNCED] ${type.toUpperCase()} -> ${relative}`);

      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (err) {
          logger.error('FILE-WATCHER', 'Listener callback error', err);
        }
      }
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(eventKey, timer);
  }
}

export const fileWatcherService = new FileWatcherService();

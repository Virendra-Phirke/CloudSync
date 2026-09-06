import { app } from 'electron';
import { fileWatcherService } from '../services/fileWatcher';
import { stopEmbeddedServer } from '../services/serverService';
import { destroyTray } from './tray';
import { getMainWindow, createMainWindow } from './window';
import { logger } from '../utils/logger';

import { spawn } from 'child_process';
import path from 'path';

export function setupLifecycle(): boolean {
  // Handle Squirrel.Windows install/update/uninstall shortcut events
  if (process.platform === 'win32' && process.argv.length > 1) {
    const squirrelEvent = process.argv[1];
    if (squirrelEvent && squirrelEvent.startsWith('--squirrel-')) {
      const appFolder = path.resolve(process.execPath, '..');
      const rootFolder = path.resolve(appFolder, '..');
      const updateExe = path.join(rootFolder, 'Update.exe');
      const exeName = path.basename(process.execPath);

      const runUpdate = (args: string[]) => {
        try {
          spawn(updateExe, args, { detached: true, stdio: 'ignore' }).unref();
        } catch {}
      };

      switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
          runUpdate(['--createShortcut', exeName]);
          setTimeout(() => app.quit(), 1000);
          return false;

        case '--squirrel-uninstall':
          runUpdate(['--removeShortcut', exeName]);
          setTimeout(() => app.quit(), 1000);
          return false;

        case '--squirrel-obsolete':
          app.quit();
          return false;
      }
    }
  }

  // Single-instance lock
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    logger.warn('SYNC', 'Another CloudSync desktop instance is already running. Quitting.');
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    logger.info('SYNC', 'Second instance detected, focusing existing window');
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      createMainWindow();
    }
  });

  // Graceful cleanup on quit
  app.on('before-quit', async () => {
    logger.info('SYNC', 'Application terminating, cleaning up background services...');
    await fileWatcherService.stopAll();
    destroyTray();
    stopEmbeddedServer();
  });

  app.on('window-all-closed', () => {
    // On Windows, keep running in tray unless explicit quit
    logger.info('TRAY', 'All windows closed, running in tray');
  });

  return true;
}

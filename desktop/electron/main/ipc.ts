import { ipcMain, shell } from 'electron';
import { filesystemService, trustedRoots } from '../services/filesystem';
import { fileWatcherService } from '../services/fileWatcher';
import { notificationService } from '../services/notificationService';
import { syncService } from '../services/syncService';
import { updateTrayStatus } from './tray';
import { getMainWindow } from './window';
import { logger } from '../utils/logger';
import { DesktopNotificationPayload } from '../types';

import { authService } from '../services/authService';

export function registerIpcHandlers() {
  logger.info('IPC', 'Registering secure typed IPC handlers');

  ipcMain.handle('desktop:auth:login', async () => {
    return await authService.login();
  });

  ipcMain.handle('desktop:auth:logout', async () => {
    return await authService.logout();
  });

  ipcMain.handle('desktop:auth:getSession', async () => {
    return await authService.getUser();
  });

  ipcMain.handle('desktop:auth:getAccessToken', async () => {
    return await authService.getAccessToken();
  });

  ipcMain.handle('desktop:selectFolder', async () => {
    try {
      return await filesystemService.selectFolder();
    } catch (err: any) {
      logger.error('IPC', 'selectFolder error', err);
      throw err;
    }
  });

  ipcMain.handle('desktop:scanFolderChildren', async (_, { rootId, relativePath }: { rootId: string; relativePath?: string }) => {
    try {
      return await filesystemService.scanFolderChildren(rootId, relativePath || '');
    } catch (err: any) {
      logger.error('IPC', `scanFolderChildren error for ${rootId}`, err);
      throw err;
    }
  });

  ipcMain.handle('desktop:scanFolderFiles', async (_, { rootId, relativePath }: { rootId: string; relativePath?: string }) => {
    try {
      return await filesystemService.scanFolderFiles(rootId, relativePath || '');
    } catch (err: any) {
      logger.error('IPC', `scanFolderFiles error for ${rootId}`, err);
      throw err;
    }
  });

  ipcMain.handle('desktop:readFile', async (_, { rootId, relativePath }: { rootId: string; relativePath: string }) => {
    try {
      return await filesystemService.readFile(rootId, relativePath);
    } catch (err: any) {
      logger.error('IPC', `readFile error: ${relativePath}`, err);
      return null;
    }
  });

  ipcMain.handle('desktop:writeFile', async (_, { rootId, relativePath, data }: { rootId: string; relativePath: string; data: ArrayBuffer }) => {
    try {
      return await filesystemService.writeFile(rootId, relativePath, Buffer.from(data));
    } catch (err: any) {
      logger.error('IPC', `writeFile error: ${relativePath}`, err);
      throw err;
    }
  });

  ipcMain.handle('desktop:deleteEntry', async (_, { rootId, relativePath }: { rootId: string; relativePath: string }) => {
    try {
      return await filesystemService.deleteEntry(rootId, relativePath);
    } catch (err: any) {
      logger.error('IPC', `deleteEntry error: ${relativePath}`, err);
      return false;
    }
  });

  ipcMain.handle('desktop:createDirectory', async (_, { rootId, relativePath }: { rootId: string; relativePath: string }) => {
    try {
      return await filesystemService.createDirectory(rootId, relativePath);
    } catch (err: any) {
      logger.error('IPC', `createDirectory error: ${relativePath}`, err);
      return false;
    }
  });

  ipcMain.handle('desktop:getFolderStats', async (_, { rootId }: { rootId: string }) => {
    try {
      return await filesystemService.getFolderStats(rootId);
    } catch (err: any) {
      logger.error('IPC', `getFolderStats error: ${rootId}`, err);
      return { fileCount: 0, dirCount: 0, totalSize: 0 };
    }
  });

  ipcMain.handle('desktop:openPath', async (_, { rootId }: { rootId: string }) => {
    try {
      const rootPath = trustedRoots.getRootPath(rootId);
      await shell.openPath(rootPath);
      return true;
    } catch (err: any) {
      logger.error('IPC', `openPath error for ${rootId}`, err);
      return false;
    }
  });

  ipcMain.handle('desktop:showNotification', async (_, payload: DesktopNotificationPayload) => {
    notificationService.showNotification(payload);
  });

  ipcMain.handle('desktop:watchFolder', async (_, { rootId }: { rootId: string }) => {
    return await fileWatcherService.watchFolder(rootId);
  });

  ipcMain.handle('desktop:stopWatchingFolder', async (_, { rootId }: { rootId: string }) => {
    return await fileWatcherService.stopWatchingFolder(rootId);
  });

  ipcMain.handle('desktop:getSyncStatus', async () => {
    return syncService.getStatus();
  });

  ipcMain.handle('desktop:updateTrayStatus', async (_, status: string) => {
    updateTrayStatus(status);
  });

  // Forward debounced watcher events to renderer
  fileWatcherService.addListener((event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop:folderEvent', event);
    }
  });
}

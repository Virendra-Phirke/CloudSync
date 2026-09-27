import { contextBridge, ipcRenderer } from 'electron';
import {
  CloudSyncDesktopAPI,
  DesktopNotificationPayload,
  DesktopFolderWatcherEvent,
} from '../types';

const api: CloudSyncDesktopAPI = {
  isDesktop: true,
  platform: process.platform,

  auth: {
    login: () => ipcRenderer.invoke('desktop:auth:login'),
    logout: () => ipcRenderer.invoke('desktop:auth:logout'),
    getSession: () => ipcRenderer.invoke('desktop:auth:getSession'),
    getAccessToken: () => ipcRenderer.invoke('desktop:auth:getAccessToken'),
  },

  selectFolder: () => ipcRenderer.invoke('desktop:selectFolder'),

  scanFolderChildren: (rootId: string, relativePath?: string) =>
    ipcRenderer.invoke('desktop:scanFolderChildren', { rootId, relativePath }),

  scanFolderFiles: (rootId: string, relativePath?: string) =>
    ipcRenderer.invoke('desktop:scanFolderFiles', { rootId, relativePath }),

  readFile: (rootId: string, relativePath: string) =>
    ipcRenderer.invoke('desktop:readFile', { rootId, relativePath }),

  writeFile: (rootId: string, relativePath: string, data: ArrayBuffer | Uint8Array) =>
    ipcRenderer.invoke('desktop:writeFile', { rootId, relativePath, data }),

  deleteEntry: (rootId: string, relativePath: string) =>
    ipcRenderer.invoke('desktop:deleteEntry', { rootId, relativePath }),

  createDirectory: (rootId: string, relativePath: string) =>
    ipcRenderer.invoke('desktop:createDirectory', { rootId, relativePath }),

  getFolderStats: (rootId: string) =>
    ipcRenderer.invoke('desktop:getFolderStats', { rootId }),

  openPath: (rootId: string) =>
    ipcRenderer.invoke('desktop:openPath', { rootId }),

  showNotification: (payload: DesktopNotificationPayload) =>
    ipcRenderer.invoke('desktop:showNotification', payload),

  watchFolder: (rootId: string) =>
    ipcRenderer.invoke('desktop:watchFolder', { rootId }),

  stopWatchingFolder: (rootId: string) =>
    ipcRenderer.invoke('desktop:stopWatchingFolder', { rootId }),

  getSyncStatus: () =>
    ipcRenderer.invoke('desktop:getSyncStatus'),

  updateTrayStatus: (status: string) =>
    ipcRenderer.invoke('desktop:updateTrayStatus', status),

  startup: {
    getSettings: () => ipcRenderer.invoke('desktop:startup:getSettings'),
    setSettings: (settings: { openAtLogin: boolean; openAsHidden?: boolean }) =>
      ipcRenderer.invoke('desktop:startup:setSettings', settings),
  },

  quitApp: () => ipcRenderer.invoke('desktop:quitApp'),

  hideWindow: () => ipcRenderer.invoke('desktop:hideWindow'),

  showWindow: () => ipcRenderer.invoke('desktop:showWindow'),

  onFolderEvent: (callback: (event: DesktopFolderWatcherEvent) => void) => {
    const handler = (_: any, event: DesktopFolderWatcherEvent) => callback(event);
    ipcRenderer.on('desktop:folderEvent', handler);
    return () => {
      ipcRenderer.removeListener('desktop:folderEvent', handler);
    };
  },

  onSyncTrigger: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('desktop:triggerSync', handler);
    return () => {
      ipcRenderer.removeListener('desktop:triggerSync', handler);
    };
  },

  onAuthChanged: (callback: (payload: { user: any }) => void) => {
    const handler = (_: any, payload: { user: any }) => callback(payload);
    ipcRenderer.on('desktop:authChanged', handler);
    return () => {
      ipcRenderer.removeListener('desktop:authChanged', handler);
    };
  },

  onBackgroundModeChanged: (callback: (payload: { inBackground: boolean }) => void) => {
    const handler = (_: any, payload: { inBackground: boolean }) => callback(payload);
    ipcRenderer.on('desktop:backgroundModeChanged', handler);
    return () => {
      ipcRenderer.removeListener('desktop:backgroundModeChanged', handler);
    };
  },
};

contextBridge.exposeInMainWorld('cloudSyncDesktop', api);

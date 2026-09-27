export type SyncStatusState =
  | 'IDLE'
  | 'SCANNING'
  | 'HASHING'
  | 'COMPARING'
  | 'UPLOADING'
  | 'DOWNLOADING'
  | 'CONFLICT'
  | 'COMPLETED'
  | 'ERROR'
  | 'PAUSED';

export interface DesktopFolderSelection {
  id: string;
  name: string;
  path: string;
}

export interface DesktopFileEntry {
  id: string;
  name: string;
  path: string;
  size: number;
  lastModified: number;
  mimeType: string;
  isDirectory: boolean;
}

export interface DesktopFolderStats {
  fileCount: number;
  dirCount: number;
  totalSize: number;
}

export interface DesktopFolderWatcherEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  folderPath: string;
  relativePath: string;
  timestamp: number;
}

export interface DesktopSyncStatus {
  state: SyncStatusState;
  progressMessage: string;
  activeFolderId: string | null;
  activeFolderPath: string | null;
  processedCount: number;
  totalCount: number;
}

export interface DesktopNotificationPayload {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

export interface DesktopStorageSettings {
  monitoredFolders: Array<{ id: string; name: string; path: string }>;
  startMinimizedToTray: boolean;
  notifyOnComplete: boolean;
  autoSyncOnWatch: boolean;
  openAtLogin?: boolean;
  ecoMode?: boolean;
}

export interface DesktopUser {
  email: string;
  name: string;
  picture: string;
}

export interface CloudSyncDesktopAPI {
  isDesktop: boolean;
  platform: string;
  auth: {
    login: () => Promise<boolean>;
    loginWithProvider: (provider: string) => Promise<boolean>;
    logout: () => Promise<void>;
    getSession: () => Promise<DesktopUser | null>;
    getAccessToken: () => Promise<string | null>;
    getProviderAccessToken: (provider: string) => Promise<string | null>;
    getProviderStates: () => Promise<Record<string, { connected: boolean; user: DesktopUser | null }>>;
    disconnectProvider: (provider: string) => Promise<void>;
  };
  selectFolder: () => Promise<DesktopFolderSelection | null>;
  scanFolderChildren: (folderPath: string, relativePath?: string) => Promise<DesktopFileEntry[]>;
  scanFolderFiles: (folderPath: string, relativePath?: string) => Promise<DesktopFileEntry[]>;
  readFile: (folderPath: string, relativePath: string) => Promise<{ data: ArrayBuffer; mimeType: string; size: number; lastModified: number } | null>;
  writeFile: (folderPath: string, relativePath: string, data: ArrayBuffer | Uint8Array) => Promise<boolean>;
  deleteEntry: (folderPath: string, relativePath: string) => Promise<boolean>;
  createDirectory: (folderPath: string, relativePath: string) => Promise<boolean>;
  getFolderStats: (folderPath: string) => Promise<DesktopFolderStats>;
  openPath: (targetPath: string) => Promise<boolean>;
  showNotification: (payload: DesktopNotificationPayload) => Promise<void>;
  watchFolder: (folderPath: string) => Promise<boolean>;
  stopWatchingFolder: (folderPath: string) => Promise<boolean>;
  getSyncStatus: () => Promise<DesktopSyncStatus>;
  updateTrayStatus: (status: string) => Promise<void>;
  startup: {
    getSettings: () => Promise<{ openAtLogin: boolean; openAsHidden: boolean }>;
    setSettings: (settings: { openAtLogin: boolean; openAsHidden?: boolean }) => Promise<boolean>;
  };
  quitApp: () => Promise<void>;
  hideWindow: () => Promise<void>;
  showWindow: () => Promise<void>;
  onFolderEvent: (callback: (event: DesktopFolderWatcherEvent) => void) => () => void;
  onSyncTrigger: (callback: () => void) => () => void;
  onAuthChanged: (callback: (payload: { user: DesktopUser | null }) => void) => () => void;
  onProviderAuthChanged?: (callback: (payload: { provider: string; user: DesktopUser | null }) => void) => () => void;
  onBackgroundModeChanged?: (callback: (payload: { inBackground: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    cloudSyncDesktop?: CloudSyncDesktopAPI;
  }
}

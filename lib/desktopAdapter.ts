'use client';

/**
 * CloudSync Desktop Capability Adapter
 * Provides capability checking and minimal Duck-typed Directory/File Handles
 * wrapping native Electron IPC calls.
 */

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).cloudSyncDesktop);
}

export function getDesktopAPI() {
  if (typeof window === 'undefined' || !(window as any).cloudSyncDesktop) {
    throw new Error('Desktop API is not available in browser environment');
  }
  return (window as any).cloudSyncDesktop;
}

export interface DesktopHandleOptions {
  rootId: string;
  relativePath?: string;
  name?: string;
}

/**
 * Creates a Duck-typed Directory Handle that adheres to the subset of
 * FileSystemDirectoryHandle methods used by CloudSync.
 */
export function createDesktopDirectoryHandle(rootId: string, relativePath = '', name = 'SyncFolder'): any {
  return {
    kind: 'directory',
    name,
    rootId,
    relativePath,

    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',

    async *entries(): AsyncIterable<[string, any]> {
      const api = getDesktopAPI();
      const children = await api.scanFolderChildren(rootId, relativePath);

      for (const item of children) {
        const itemRelPath = relativePath ? `${relativePath}/${item.name}` : item.name;

        if (item.isDirectory) {
          yield [item.name, createDesktopDirectoryHandle(rootId, itemRelPath, item.name)];
        } else {
          yield [item.name, createDesktopFileHandle(rootId, itemRelPath, item.name, item.size, item.lastModified, item.mimeType)];
        }
      }
    },

    async getFileHandle(fileName: string, options?: { create?: boolean }): Promise<any> {
      const childRelPath = relativePath ? `${relativePath}/${fileName}` : fileName;
      return createDesktopFileHandle(rootId, childRelPath, fileName);
    },

    async getDirectoryHandle(dirName: string, options?: { create?: boolean }): Promise<any> {
      const api = getDesktopAPI();
      const childRelPath = relativePath ? `${relativePath}/${dirName}` : dirName;

      if (options?.create) {
        await api.createDirectory(rootId, childRelPath);
      }

      return createDesktopDirectoryHandle(rootId, childRelPath, dirName);
    },
  };
}

/**
 * Creates a Duck-typed File Handle that adheres to the subset of
 * FileSystemFileHandle methods used by CloudSync.
 */
export function createDesktopFileHandle(
  rootId: string,
  relativePath: string,
  fileName: string,
  cachedSize = 0,
  cachedMtime = Date.now(),
  cachedMime = 'application/octet-stream'
): any {
  return {
    kind: 'file',
    name: fileName,
    rootId,
    relativePath,

    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',

    async getFile(): Promise<File> {
      const api = getDesktopAPI();
      const res = await api.readFile(rootId, relativePath);

      if (!res) {
        // Fallback empty file if missing/deleted
        return new File([], fileName, { type: cachedMime, lastModified: cachedMtime });
      }

      return new File([res.data], fileName, {
        type: res.mimeType || cachedMime,
        lastModified: res.lastModified || cachedMtime,
      });
    },

    async createWritable(): Promise<{ write: (data: any) => Promise<void>; close: () => Promise<void> }> {
      const api = getDesktopAPI();
      let writeBuffer: Uint8Array | null = null;

      return {
        write: async (data: any) => {
          if (data instanceof Blob) {
            const ab = await data.arrayBuffer();
            writeBuffer = new Uint8Array(ab);
          } else if (data instanceof ArrayBuffer) {
            writeBuffer = new Uint8Array(data);
          } else if (ArrayBuffer.isView(data)) {
            writeBuffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          } else {
            writeBuffer = new TextEncoder().encode(String(data));
          }
        },
        close: async () => {
          if (writeBuffer) {
            await api.writeFile(rootId, relativePath, writeBuffer);
          }
        },
      };
    },
  };
}

export async function getStartupSettings(): Promise<{ openAtLogin: boolean; openAsHidden: boolean } | null> {
  if (!isDesktop() || !window.cloudSyncDesktop?.startup) return null;
  return await window.cloudSyncDesktop.startup.getSettings();
}

export async function setStartupSettings(openAtLogin: boolean, openAsHidden = true): Promise<boolean> {
  if (!isDesktop() || !window.cloudSyncDesktop?.startup) return false;
  return await window.cloudSyncDesktop.startup.setSettings({ openAtLogin, openAsHidden });
}

export async function quitDesktopApp(): Promise<void> {
  if (!isDesktop() || !window.cloudSyncDesktop?.quitApp) return;
  await window.cloudSyncDesktop.quitApp();
}

export async function hideDesktopWindow(): Promise<void> {
  if (!isDesktop() || !window.cloudSyncDesktop?.hideWindow) return;
  await window.cloudSyncDesktop.hideWindow();
}


import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getAppUserDataPath } from '../utils/paths';
import { logger } from '../utils/logger';
import { DesktopStorageSettings } from '../types';

const DEFAULT_SETTINGS: DesktopStorageSettings = {
  monitoredFolders: [],
  startMinimizedToTray: false,
  notifyOnComplete: true,
  autoSyncOnWatch: true,
};

export class StorageService {
  private settingsFilePath: string;
  private settingsCache: DesktopStorageSettings | null = null;

  constructor() {
    this.settingsFilePath = path.join(getAppUserDataPath(), 'desktop-settings.json');
  }

  async getSettings(): Promise<DesktopStorageSettings> {
    if (this.settingsCache) return this.settingsCache;

    try {
      if (fsSync.existsSync(this.settingsFilePath)) {
        const raw = await fs.readFile(this.settingsFilePath, 'utf-8');
        this.settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        return this.settingsCache!;
      }
    } catch (err) {
      logger.warn('SYNC', 'Failed to read desktop settings, using defaults', err);
    }

    this.settingsCache = { ...DEFAULT_SETTINGS };
    return this.settingsCache;
  }

  async saveSettings(settings: Partial<DesktopStorageSettings>): Promise<void> {
    try {
      const current = await this.getSettings();
      this.settingsCache = { ...current, ...settings };
      const dir = path.dirname(this.settingsFilePath);
      if (!fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(this.settingsFilePath, JSON.stringify(this.settingsCache, null, 2), 'utf-8');
      logger.info('SYNC', 'Saved desktop settings');
    } catch (err) {
      logger.error('SYNC', 'Failed to save desktop settings', err);
    }
  }

  async addMonitoredFolder(folder: { id: string; name: string; path: string }) {
    const current = await this.getSettings();
    if (!current.monitoredFolders.some((f) => f.path === folder.path)) {
      current.monitoredFolders.push(folder);
      await this.saveSettings({ monitoredFolders: current.monitoredFolders });
    }
  }

  async removeMonitoredFolder(folderPath: string) {
    const current = await this.getSettings();
    const updated = current.monitoredFolders.filter((f) => f.path !== folderPath);
    await this.saveSettings({ monitoredFolders: updated });
  }
}

export const storageService = new StorageService();

import { get, set } from 'idb-keyval';

export interface AppSettings {
  autoSync: boolean;
  launchOnStartup: boolean;
  syncIntervalMin: number;
}

const SETTINGS_KEY = 'omnisync_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  autoSync: false,
  launchOnStartup: false,
  syncIntervalMin: 5,
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const data = await get<AppSettings>(SETTINGS_KEY);
    return data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('Failed to load settings from IDB', err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
    // Dispatch a custom event so other components (like AutoSyncManager) can react
    window.dispatchEvent(new CustomEvent('omnisync-settings-changed'));
  } catch (err) {
    console.error('Failed to save settings to IDB', err);
  }
}

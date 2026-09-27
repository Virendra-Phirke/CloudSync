import { app } from 'electron';
import { logger } from '../utils/logger';
import { storageService } from './storageService';

export class StartupService {
  async isEnabled(): Promise<boolean> {
    try {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    } catch (err) {
      logger.error('STARTUP', 'Failed to get login item settings', err);
      const saved = await storageService.getSettings();
      return !!saved.openAtLogin;
    }
  }

  async getSettings(): Promise<{ openAtLogin: boolean; openAsHidden: boolean }> {
    try {
      const settings = app.getLoginItemSettings();
      return {
        openAtLogin: settings.openAtLogin,
        openAsHidden: settings.openAsHidden,
      };
    } catch (err) {
      const saved = await storageService.getSettings();
      return {
        openAtLogin: !!saved.openAtLogin,
        openAsHidden: !!saved.startMinimizedToTray,
      };
    }
  }

  async setStartup(openAtLogin: boolean, openAsHidden = true): Promise<boolean> {
    try {
      const isDev = !app.isPackaged;
      const appArgs = isDev ? [process.cwd(), '--hidden'] : ['--hidden'];

      app.setLoginItemSettings({
        openAtLogin,
        openAsHidden,
        path: process.execPath,
        args: openAsHidden ? appArgs : (isDev ? [process.cwd()] : []),
      });

      await storageService.saveSettings({ openAtLogin, startMinimizedToTray: openAsHidden });
      logger.info('STARTUP', `Run on Startup set to: ${openAtLogin} (hidden: ${openAsHidden})`);
      return true;
    } catch (err) {
      logger.error('STARTUP', 'Failed to configure startup settings', err);
      return false;
    }
  }
}

export const startupService = new StartupService();

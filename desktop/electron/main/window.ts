import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { getIconPath } from '../utils/paths';
import { logger } from '../utils/logger';
import { resolveAppUrl } from '../services/serverService';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setAppIsQuitting(val: boolean) {
  isQuitting = val;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const preloadPath = path.join(__dirname, '../preload/preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'CloudSync',
    backgroundColor: '#090d16',
    icon: getIconPath(),
    show: false, // show when ready-to-show
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  const appUrl = await resolveAppUrl();
  logger.info('IPC', `Loading CloudSync UI from: ${appUrl}`);
  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('IPC', 'Main window displayed');
  });

  // When user clicks the close button 'X', hide to tray instead of exiting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      logger.info('TRAY', 'Window minimized to tray');
    }
  });

  // Safe navigation: external URLs open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow Google OAuth login popups/navigation
    if (url.includes('accounts.google.com') || url.includes('google.com/o/oauth2')) {
      return { action: 'allow' };
    }

    // Allow app origin
    if (url.startsWith('http://localhost:3000') || url.startsWith('http://127.0.0.1:3000')) {
      return { action: 'allow' };
    }

    // Otherwise open in user's default browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

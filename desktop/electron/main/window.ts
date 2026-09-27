import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { getIconPath } from '../utils/paths';
import { logger } from '../utils/logger';
import { resolveAppUrl } from '../services/serverService';
import { memoryManager } from '../services/memoryManager';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setAppIsQuitting(val: boolean) {
  isQuitting = val;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }
}

export function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }

  const preloadPath = path.join(__dirname, '../preload/preload.js');
  const startHidden = process.argv.includes('--hidden') || process.argv.includes('-hidden');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'CloudSync',
    backgroundColor: '#090d16',
    icon: getIconPath(),
    show: false, // show when ready-to-show (unless startHidden)
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: true, // Throttles inactive renderers to achieve 50-100MB RAM in background
    },
  });

  const appUrl = await resolveAppUrl();
  logger.info('IPC', `Loading CloudSync UI from: ${appUrl}`);
  mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    if (startHidden) {
      logger.info('SYNC', 'Started with --hidden flag, running quietly in background tray');
      memoryManager.enterEcoMode(mainWindow);
    } else {
      mainWindow?.show();
      logger.info('IPC', 'Main window displayed');
    }
  });

  mainWindow.on('hide', () => {
    memoryManager.enterEcoMode(mainWindow);
  });

  mainWindow.on('show', () => {
    memoryManager.leaveEcoMode(mainWindow);
  });

  // When user clicks the close button 'X', hide to tray instead of exiting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      logger.info('TRAY', 'Window closed to tray. CloudSync running in background Eco Mode.');
    }
  });

  // Safe navigation: external URLs open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow OAuth login popups/navigation (Google, Dropbox, OneDrive)
    if (
      url.includes('accounts.google.com') ||
      url.includes('google.com/o/oauth2') ||
      url.includes('dropbox.com/oauth2') ||
      url.includes('login.microsoftonline.com') ||
      url.includes('login.live.com')
    ) {
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

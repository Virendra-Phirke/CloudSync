import { Tray, Menu, nativeImage, NativeImage, app, shell } from 'electron';
import { getIconPath } from '../utils/paths';
import { getMainWindow, createMainWindow, setAppIsQuitting } from './window';
import { logger } from '../utils/logger';
import { storageService } from '../services/storageService';

let tray: Tray | null = null;
let currentStatusLabel = '✓ Synced';

export function updateTrayStatus(statusLabel: string) {
  currentStatusLabel = statusLabel;
  renderTrayMenu();
}

async function showOrFocusWindow() {
  const win = getMainWindow() || (await createMainWindow());
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function renderTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'CloudSync',
      enabled: false,
    },
    {
      label: currentStatusLabel,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open CloudSync',
      click: () => {
        showOrFocusWindow();
      },
    },
    {
      label: 'Sync Now',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.webContents.send('desktop:triggerSync');
          logger.info('TRAY', 'Triggered Sync Now from tray');
        }
      },
    },
    {
      label: 'Open Sync Folder',
      click: async () => {
        const settings = await storageService.getSettings();
        if (settings.monitoredFolders.length > 0) {
          shell.openPath(settings.monitoredFolders[0].path);
        } else {
          showOrFocusWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit CloudSync',
      click: () => {
        setAppIsQuitting(true);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`CloudSync - ${currentStatusLabel}`);
}

export function initTray(): Tray {
  if (tray) return tray;

  const iconPath = getIconPath();
  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Create a fallback 16x16 icon in memory if file doesn't exist
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('CloudSync - Desktop File Synchronization');

  tray.on('double-click', () => {
    showOrFocusWindow();
  });

  tray.on('click', () => {
    showOrFocusWindow();
  });

  renderTrayMenu();
  logger.info('TRAY', 'System tray initialized');
  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

import { Tray, Menu, nativeImage, NativeImage, app, shell, BrowserWindow } from 'electron';
import { getIconPath } from '../utils/paths';
import { getMainWindow, createMainWindow, setAppIsQuitting } from './window';
import { logger } from '../utils/logger';
import { storageService } from '../services/storageService';
import { startupService } from '../services/startupService';
import { memoryManager } from '../services/memoryManager';

let tray: Tray | null = null;
let currentStatusLabel = '✓ Synced';

export function updateTrayStatus(statusLabel: string) {
  currentStatusLabel = statusLabel;
  renderTrayMenu();
}

async function showOrFocusWindow(): Promise<BrowserWindow> {
  const win = getMainWindow() || (await createMainWindow());
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  renderTrayMenu();
  return win;
}

export async function renderTrayMenu() {
  if (!tray) return;

  const win = getMainWindow();
  const isWindowVisible = win && !win.isDestroyed() && win.isVisible();
  const isStartupEnabled = await startupService.isEnabled();
  const inEcoMode = memoryManager.isBackground() || !isWindowVisible;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'CloudSync (Background Service)',
      enabled: false,
    },
    {
      label: `● ${currentStatusLabel}`,
      enabled: false,
    },
    {
      label: inEcoMode ? '🍃 Background Eco Mode (50–100 MB Target)' : '💻 Window Active',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isWindowVisible ? 'Focus CloudSync' : 'Open CloudSync',
      click: () => {
        showOrFocusWindow();
      },
    },
    {
      label: 'Sync Now',
      click: () => {
        const currentWin = getMainWindow();
        if (currentWin) {
          currentWin.webContents.send('desktop:triggerSync');
          logger.info('TRAY', 'Triggered Sync Now from tray');
        } else {
          showOrFocusWindow().then((w) => {
            w.webContents.send('desktop:triggerSync');
          });
        }
      },
    },
    {
      label: 'Open Monitored Folder',
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
      label: 'Start with Windows',
      type: 'checkbox',
      checked: isStartupEnabled,
      click: async (item) => {
        await startupService.setStartup(item.checked, true);
        renderTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Close Background Service & Quit',
      click: () => {
        logger.info('TRAY', 'User requested full application exit from system tray');
        setAppIsQuitting(true);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`CloudSync - ${currentStatusLabel} (${inEcoMode ? 'Eco Mode' : 'Active'})`);
}

export function initTray(): Tray {
  if (tray) return tray;

  const iconPath = getIconPath();
  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    } else {
      // Ensure crisp 16x16 scaling for Windows notification tray
      icon = icon.resize({ width: 16, height: 16 });
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('CloudSync - Running in Background (✓ Synced)');

  // Double click restores and focuses the window
  tray.on('double-click', () => {
    showOrFocusWindow();
  });

  // Single click restores window on Windows
  tray.on('click', () => {
    showOrFocusWindow();
  });

  // Right click brings up the full context menu
  tray.on('right-click', () => {
    renderTrayMenu();
    tray?.popUpContextMenu();
  });

  renderTrayMenu();
  logger.info('TRAY', 'System tray initialized with background eco controls');
  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

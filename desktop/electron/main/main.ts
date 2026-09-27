import { app } from 'electron';
import { setupLifecycle } from './lifecycle';
import { createMainWindow } from './window';
import { initTray } from './tray';
import { registerIpcHandlers } from './ipc';
import { trustedRoots } from '../services/filesystem';
import { logger } from '../utils/logger';

async function bootstrap() {
  logger.info('SYNC', 'Starting CloudSync Desktop Application...');

  // Configure Chromium flags for Background Eco Mode (50-100MB RAM target)
  app.commandLine.appendSwitch('js-flags', '--expose-gc');
  app.commandLine.appendSwitch('disable-renderer-backgrounding', 'false');

  const canContinue = setupLifecycle();
  if (!canContinue) return;

  await app.whenReady();

  // Initialize persistent trusted roots
  await trustedRoots.init();

  // Register IPC handlers
  registerIpcHandlers();

  // Initialize System Tray
  initTray();

  // Create & display main window
  createMainWindow();

  app.on('activate', () => {
    createMainWindow();
  });

  logger.info('SYNC', 'CloudSync Desktop ready and running');
}

bootstrap().catch((err) => {
  logger.error('ERROR', 'Fatal desktop startup error', err);
  app.quit();
});

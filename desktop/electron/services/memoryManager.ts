import { BrowserWindow, app } from 'electron';
import { logger } from '../utils/logger';

export class MemoryManager {
  private inBackground = false;

  isBackground(): boolean {
    return this.inBackground;
  }

  async enterEcoMode(win: BrowserWindow | null) {
    this.inBackground = true;
    logger.info('MEMORY', 'Entering Background Eco Mode (Target: 50-100MB RAM)...');

    if (win && !win.isDestroyed()) {
      try {
        // 1. Tell renderer to pause heavy animations, DOM buffers, and virtual lists
        win.webContents.send('desktop:backgroundModeChanged', { inBackground: true });

        // 2. Clear Chromium session cache
        await win.webContents.session.clearCache();

        // 3. Trigger V8 Garbage Collection in renderer if available
        await win.webContents.executeJavaScript('if (typeof window !== "undefined" && window.gc) { window.gc(); }', true).catch(() => {});
      } catch (err) {
        logger.warn('MEMORY', 'Error notifying renderer of eco mode', err);
      }
    }

    // 4. Trigger V8 Garbage Collection in main process if available
    if (typeof (global as any).gc === 'function') {
      try {
        (global as any).gc();
      } catch {}
    }

    const mem = process.memoryUsage();
    logger.info('MEMORY', `Eco Mode active. Main process RSS: ${Math.round(mem.rss / 1024 / 1024)} MB, Heap: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
  }

  leaveEcoMode(win: BrowserWindow | null) {
    this.inBackground = false;
    logger.info('MEMORY', 'Exiting Background Eco Mode. Resuming full UI.');

    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send('desktop:backgroundModeChanged', { inBackground: false });
      } catch (err) {
        logger.warn('MEMORY', 'Error notifying renderer of foreground mode', err);
      }
    }
  }
}

export const memoryManager = new MemoryManager();

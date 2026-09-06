import { Notification } from 'electron';
import { logger } from '../utils/logger';
import { DesktopNotificationPayload } from '../types';
import { getIconPath } from '../utils/paths';

export class NotificationService {
  private lastNotificationTime = 0;
  private MIN_INTERVAL_MS = 2000;
  private pendingBatchCount = 0;
  private batchTimer: NodeJS.Timeout | null = null;

  /**
   * Shows a Windows native desktop notification.
   */
  showNotification(payload: DesktopNotificationPayload) {
    if (!Notification.isSupported()) {
      logger.warn('SYNC', 'Desktop notifications not supported on this platform');
      return;
    }

    try {
      const notification = new Notification({
        title: payload.title || 'CloudSync',
        body: payload.body,
        icon: getIconPath(),
        silent: false,
      });

      notification.show();
      logger.info('SYNC', `Displayed notification: "${payload.title}" - "${payload.body}"`);
    } catch (err) {
      logger.error('SYNC', 'Failed to display notification', err);
    }
  }

  /**
   * Batches sync completion notifications so rapid updates are summarized.
   */
  recordFileSynced(fileName: string) {
    this.pendingBatchCount++;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      const count = this.pendingBatchCount;
      this.pendingBatchCount = 0;
      this.batchTimer = null;

      if (count > 0) {
        this.showNotification({
          title: 'CloudSync',
          body: count === 1 ? `Synchronized ${fileName}` : `Synchronized ${count} files with Google Drive`,
          type: 'success',
        });
      }
    }, 2500);
  }

  /**
   * Displays a conflict alert notification.
   */
  notifyConflict(conflictCount: number) {
    this.showNotification({
      title: 'CloudSync - Sync Conflict',
      body: `${conflictCount} file${conflictCount > 1 ? 's require' : ' requires'} conflict resolution`,
      type: 'warning',
    });
  }
}

export const notificationService = new NotificationService();

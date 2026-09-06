import { DesktopSyncStatus, SyncStatusState } from '../types';
import { logger } from '../utils/logger';

type StatusListener = (status: DesktopSyncStatus) => void;

export class SyncService {
  private status: DesktopSyncStatus = {
    state: 'IDLE',
    progressMessage: 'Ready',
    activeFolderId: null,
    activeFolderPath: null,
    processedCount: 0,
    totalCount: 0,
  };

  private listeners: StatusListener[] = [];

  getStatus(): DesktopSyncStatus {
    return { ...this.status };
  }

  updateStatus(partial: Partial<DesktopSyncStatus>) {
    this.status = { ...this.status, ...partial };
    logger.debug('SYNC', `State change: ${this.status.state} - ${this.status.progressMessage}`);
    for (const listener of this.listeners) {
      try {
        listener(this.getStatus());
      } catch (err) {
        logger.error('SYNC', 'Error in sync status listener', err);
      }
    }
  }

  addListener(callback: StatusListener): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  setIdle() {
    this.updateStatus({
      state: 'IDLE',
      progressMessage: 'Ready',
      processedCount: 0,
      totalCount: 0,
    });
  }

  setSyncing(message: string, processed = 0, total = 0) {
    this.updateStatus({
      state: 'UPLOADING',
      progressMessage: message,
      processedCount: processed,
      totalCount: total,
    });
  }

  setCompleted(message = 'Sync completed successfully') {
    this.updateStatus({
      state: 'COMPLETED',
      progressMessage: message,
    });
  }

  setError(errorMsg: string) {
    this.updateStatus({
      state: 'ERROR',
      progressMessage: errorMsg,
    });
  }
}

export const syncService = new SyncService();

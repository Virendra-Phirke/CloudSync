'use client';
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { ConflictItem, syncBiDirectional } from '../lib/syncBiDirectional';
import { useToast } from './ToastContext';
import { getLocalFolderById, getLocalFolders } from '../lib/localFolder';
import { isDesktop, getDesktopAPI } from '../lib/desktopAdapter';

interface SyncContextType {
  isSyncing: boolean;
  syncProgressMsg: string;
  activeSyncFolderId: string | null;
  currentConflicts: ConflictItem[];
  resolveConflictFn: ((resolution: 'local' | 'drive' | 'skip') => void) | null;
  startSync: (folderId: string) => Promise<void>;
  cancelSync: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState('');
  const [activeSyncFolderId, setActiveSyncFolderId] = useState<string | null>(null);
  
  const [currentConflicts, setCurrentConflicts] = useState<ConflictItem[]>([]);
  const [resolveConflictFn, setResolveConflictFn] = useState<((res: 'local' | 'drive' | 'skip') => void) | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSyncingRef = useRef(false);
  const pendingSyncFolderIdRef = useRef<string | null>(null);
  const { showToast } = useToast();

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startSync = useCallback(async (folderId: string) => {
    // Serialization: do not run sync twice concurrently
    if (isSyncingRef.current) {
      pendingSyncFolderIdRef.current = folderId;
      return;
    }
    
    cancelSync(); 
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setActiveSyncFolderId(folderId);
    setSyncProgressMsg('Starting sync...');

    if (isDesktop()) {
      try {
        getDesktopAPI().updateTrayStatus('Syncing with Google Drive...');
      } catch {}
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const entry = await getLocalFolderById(folderId);
      if (!entry) throw new Error('Folder not found or permission denied');
      
      await syncBiDirectional(
        entry.handle, 
        (msg) => { setSyncProgressMsg(msg); },
        (conflicts) => {
          if (isDesktop() && conflicts.length > 0) {
            try {
              getDesktopAPI().showNotification({
                title: 'CloudSync - Conflict Detected',
                body: `${conflicts.length} file(s) require conflict resolution.`,
                type: 'warning',
              });
            } catch {}
          }
          return new Promise<'local' | 'drive' | 'skip'>((resolve) => {
            setCurrentConflicts(conflicts);
            setResolveConflictFn(() => (res: 'local' | 'drive' | 'skip') => {
              setCurrentConflicts([]);
              setResolveConflictFn(null);
              resolve(res);
            });
          });
        },
        abortController.signal
      );
      
      if (!abortController.signal.aborted) {
        showToast('Sync completed successfully!', 'success');
        if (isDesktop()) {
          try {
            getDesktopAPI().showNotification({
              title: 'CloudSync',
              body: 'Synchronization complete with Google Drive',
              type: 'success',
            });
          } catch {}
        }
      } else {
        showToast('Sync was cancelled.', 'info');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        showToast('Sync was cancelled.', 'info');
      } else {
        console.error(err);
        showToast(`Sync failed: ${err.message}`, 'error');
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setSyncProgressMsg('');
      setActiveSyncFolderId(null);
      setCurrentConflicts([]);
      setResolveConflictFn(null);
      abortControllerRef.current = null;

      if (isDesktop()) {
        try {
          getDesktopAPI().updateTrayStatus('✓ Synced');
        } catch {}
      }
      
      // Force trigger custom event so other views refresh
      window.dispatchEvent(new Event('omnisync-sync-completed'));

      // Process any coalesced pending sync request
      if (pendingSyncFolderIdRef.current) {
        const nextFolderId = pendingSyncFolderIdRef.current;
        pendingSyncFolderIdRef.current = null;
        setTimeout(() => {
          startSync(nextFolderId);
        }, 1000);
      }
    }
  }, [showToast, cancelSync]);

  // Desktop integration: hook into watcher and tray triggers
  useEffect(() => {
    if (!isDesktop()) return;

    let unsubEvent: (() => void) | undefined;
    let unsubTray: (() => void) | undefined;

    try {
      const api = getDesktopAPI();

      // Watch all active monitored folders
      getLocalFolders().then((folders) => {
        for (const f of folders) {
          const rootId = f.info?.desktopRootId || f.id;
          api.watchFolder(rootId).catch(() => {});
        }
      });

      // File watcher debounced events -> queue sync
      unsubEvent = api.onFolderEvent(async (event: any) => {
        const folders = await getLocalFolders();
        const target = folders.find((f: any) => (f.info?.desktopRootId || f.id) === event.folderPath);
        if (target) {
          startSync(target.id);
        }
      });

      // Tray "Sync Now" trigger
      unsubTray = api.onSyncTrigger(async () => {
        const folders = await getLocalFolders();
        if (folders.length > 0) {
          startSync(folders[0].id);
        }
      });
    } catch (err) {
      console.warn('Could not attach desktop listeners', err);
    }

    return () => {
      unsubEvent?.();
      unsubTray?.();
    };
  }, [startSync]);

  return (
    <SyncContext.Provider value={{
      isSyncing,
      syncProgressMsg,
      activeSyncFolderId,
      currentConflicts,
      resolveConflictFn,
      startSync,
      cancelSync
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
}

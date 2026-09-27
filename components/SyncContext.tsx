'use client';
import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { ConflictItem, syncBiDirectional } from '../lib/syncBiDirectional';
import { useToast } from './ToastContext';
import { getLocalFolderById, getLocalFolders } from '../lib/localFolder';
import { isDesktop, getDesktopAPI } from '../lib/desktopAdapter';
import { CloudProviderType } from '../lib/providers/types';
import { getProvider } from '../lib/providers';

interface SyncContextType {
  isSyncing: boolean;
  syncProgressMsg: string;
  activeSyncFolderId: string | null;
  currentConflicts: ConflictItem[];
  resolveConflictFn: ((resolution: 'local' | 'drive' | 'skip') => void) | null;
  startSync: (folderId: string, provider?: CloudProviderType) => Promise<void>;
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
  const pendingSyncFolderIdRef = useRef<{ folderId: string; provider?: CloudProviderType } | null>(null);
  const { showToast } = useToast();

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startSync = useCallback(async (folderId: string, targetProvider: CloudProviderType = 'google') => {
    // Serialization: do not run sync twice concurrently
    if (isSyncingRef.current) {
      pendingSyncFolderIdRef.current = { folderId, provider: targetProvider };
      return;
    }
    
    cancelSync(); 
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setActiveSyncFolderId(folderId);
    setSyncProgressMsg(`Starting sync with ${targetProvider === 'google' ? 'Google Drive' : targetProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'}...`);

    const cloudProvider = getProvider(targetProvider);

    if (isDesktop()) {
      try {
        getDesktopAPI().updateTrayStatus(`Syncing with ${cloudProvider.name}...`);
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
        abortController.signal,
        cloudProvider
      );
      
      if (!abortController.signal.aborted) {
        showToast(`Sync completed with ${cloudProvider.name}!`, 'success');
        if (isDesktop()) {
          try {
            getDesktopAPI().showNotification({
              title: 'CloudSync',
              body: `Synchronization complete with ${cloudProvider.name}`,
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
        const next = pendingSyncFolderIdRef.current;
        pendingSyncFolderIdRef.current = null;
        setTimeout(() => {
          startSync(next.folderId, next.provider);
        }, 1000);
      }
    }
  }, [showToast, cancelSync]);

  // Desktop integration: hook into watcher and tray triggers
  useEffect(() => {
    if (!isDesktop()) return;

    let unsubEvent: (() => void) | undefined;
    let unsubTray: (() => void) | undefined;
    let unsubBg: (() => void) | undefined;

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
          startSync(target.id, target.info?.provider || 'google');
        }
      });

      // Tray "Sync Now" trigger
      unsubTray = api.onSyncTrigger(async () => {
        const folders = await getLocalFolders();
        if (folders.length > 0) {
          for (const f of folders) {
            await startSync(f.id, f.info?.provider || 'google');
          }
        }
      });

      // Background Eco Mode handler: trim renderer memory
      unsubBg = api.onBackgroundModeChanged?.((payload: { inBackground: boolean }) => {
        if (payload.inBackground) {
          if (typeof window !== 'undefined' && typeof (window as any).gc === 'function') {
            try {
              (window as any).gc();
            } catch {}
          }
        }
      });
    } catch (err) {
      console.warn('Could not attach desktop listeners', err);
    }

    return () => {
      unsubEvent?.();
      unsubTray?.();
      unsubBg?.();
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

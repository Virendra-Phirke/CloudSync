'use client';
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { ConflictItem, syncBiDirectional } from '../lib/syncBiDirectional';
import { useToast } from './ToastContext';
import { getLocalFolderById } from '../lib/localFolder';

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
  const { showToast } = useToast();

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startSync = useCallback(async (folderId: string) => {
    if (isSyncing) {
      showToast('A sync is already in progress.', 'error');
      return;
    }
    
    cancelSync(); 
    
    setIsSyncing(true);
    setActiveSyncFolderId(folderId);
    setSyncProgressMsg('Starting sync...');
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const entry = await getLocalFolderById(folderId);
      if (!entry) throw new Error('Folder not found or permission denied');
      
      await syncBiDirectional(
        entry.handle, 
        (msg) => { setSyncProgressMsg(msg); },
        (conflicts) => {
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
      setIsSyncing(false);
      setSyncProgressMsg('');
      setActiveSyncFolderId(null);
      setCurrentConflicts([]);
      setResolveConflictFn(null);
      abortControllerRef.current = null;
      
      // Force trigger a custom event so other components (like FilesView) know to reload their file lists
      window.dispatchEvent(new Event('omnisync-sync-completed'));
    }
  }, [isSyncing, showToast, cancelSync]);

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

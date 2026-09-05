'use client';
import {
  Search, Folder, MoreVertical, UploadCloud, 
  X, Download, CheckCircle, Check, HardDrive,
  RefreshCw, FolderOpen, CloudOff, Loader2,
  LayoutGrid, List, Plus, FolderPlus, ChevronRight, Trash2, Share2, ChevronDown, AlertTriangle, FilePlus, EyeOff
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchDriveFiles, DriveFile, uploadFileToDrive, deleteDriveFile } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import {
  getLocalFolders, getLocalFolderById, pickAndInitFolder, commitLocalFolder, readFolderChildren,
  LocalFile, SyncFolderEntry, getLocalFolderInfos, SyncFolder,
} from '../lib/localFolder';
import { syncBiDirectional, ConflictItem } from '../lib/syncBiDirectional';
import { useSync } from './SyncContext';
import { useToast } from './ToastContext';
import { getFileTypeInfo } from '../lib/fileUtils';
import { useVirtualizer } from '@tanstack/react-virtual';
import dynamic from 'next/dynamic';

const FilePreviewModal = dynamic(() => import('./FilePreviewModal').then(mod => mod.FilePreviewModal), { ssr: false });
const ConfirmDialog = dynamic(() => import('./ConfirmDialog').then(mod => mod.ConfirmDialog), { ssr: false });
const ShareModal = dynamic(() => import('./ShareModal').then(mod => mod.ShareModal), { ssr: false });
const ConflictResolverModal = dynamic(() => import('./ConflictResolverModal').then(mod => mod.ConflictResolverModal), { ssr: false });
const SyncIgnoreModal = dynamic(() => import('./SyncIgnoreModal').then(mod => mod.SyncIgnoreModal), { ssr: false });

import { removeSyncState } from '../lib/syncState';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SyncStatus = 'Synced' | 'Syncing' | 'Local Only' | 'Not Synced';
type ViewMode = 'grid' | 'list';

type FileItem = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  status: SyncStatus;
  size: string;
  sizeBytes: number;
  date: string;
  path: string;
  driveId?: string;
  isDirectory: boolean;
  mimeType?: string;
  thumbnailLink?: string;
  iconLink?: string;
  handle?: any;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  const factor = Math.pow(10, dm);
  const truncated = Math.floor(val * factor) / factor;
  return `${truncated} ${sizes[i]}`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Component ─────────────────────────────────────────────────────────────────

const VirtualizedListBody = React.memo(({
  files,
  selectedIds,
  searchQuery,
  statusBadge,
  handleRowClick,
  handleSelectFile,
  setShareFiles
}: {
  files: FileItem[],
  selectedIds: Set<string>,
  searchQuery: string,
  statusBadge: Record<SyncStatus, { cls: string; icon: React.ReactNode; label: string }>,
  handleRowClick: (file: FileItem) => void,
  handleSelectFile: (e: React.MouseEvent, id: string) => void,
  setShareFiles: (files: FileItem[]) => void
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="max-h-[60vh] overflow-auto hide-scrollbar">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const file = files[virtualRow.index];
          const typeInfo = getFileTypeInfo(file.name, file.mimeType, file.isDirectory);
          const TypeIcon = typeInfo.icon;
          const badge = statusBadge[file.status];
          
          return (
            <div
              key={virtualRow.key}
              onClick={() => handleRowClick(file)}
              className={`absolute top-0 left-0 w-full flex items-center border-b border-border/60 hover:bg-secondary/50 transition-colors duration-150 group cursor-pointer ${
                selectedIds.has(file.id) ? 'bg-primary/10' : ''
              }`}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="px-5 py-3.5 w-14 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                <div
                  onClick={(e) => handleSelectFile(e, file.id)}
                  className={`w-4 h-4 rounded flex items-center justify-center transition-colors border cursor-pointer ${
                    selectedIds.has(file.id) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-600 text-transparent hover:border-neutral-400'
                  }`}
                >
                  <Check size={12} strokeWidth={3} className={`transition-opacity duration-200 ${selectedIds.has(file.id) ? 'opacity-100' : 'opacity-0'}`} />
                </div>
              </div>
              <div className="px-5 py-3.5 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${typeInfo.bg} shrink-0`}>
                    <TypeIcon size={16} className={typeInfo.color} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-neutral-200 text-sm truncate block max-w-[220px]" title={file.name}>
                      {file.name}
                    </span>
                    {searchQuery && file.path !== file.name && (
                      <div className="text-[11px] text-neutral-500 mt-0.5 truncate max-w-[200px]" title={file.path}>
                        {file.path}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3.5 w-28 shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badge.cls}`}>
                  {badge.icon} {badge.label}
                </span>
              </div>
              <div className="px-5 py-3.5 w-24 shrink-0 text-sm text-neutral-400 hidden sm:block truncate">{file.size}</div>
              <div className="px-5 py-3.5 w-28 shrink-0 text-sm text-neutral-400 hidden md:block truncate">{file.date}</div>
              <div className="px-5 py-3.5 w-16 shrink-0 text-right" onClick={(e) => e.stopPropagation()}>
                {!file.isDirectory && file.driveId ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareFiles([file]);
                    }}
                    className="text-neutral-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Share File"
                  >
                    <Share2 size={16} />
                  </button>
                ) : (
                  <div className="w-7 h-7 inline-block"></div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedListBody.displayName = 'VirtualizedListBody';

export const FilesView = React.memo(function FilesView() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareFiles, setShareFiles] = useState<FileItem[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  const { isSyncing: syncing, syncProgressMsg, currentConflicts, resolveConflictFn, startSync, cancelSync } = useSync();

  // Multi-folder state
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);

  // File Deletion State
  const [filesToDelete, setFilesToDelete] = useState<FileItem[] | null>(null);
  const [deletingFiles, setDeletingFiles] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [addingFiles, setAddingFiles] = useState(false);
  const [showSyncIgnoreModal, setShowSyncIgnoreModal] = useState(false);
  const [activeFolderHandle, setActiveFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [pendingFolderHandle, setPendingFolderHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const handleForceSyncRef = useRef<(() => void) | null>(null);

  const { showToast } = useToast();

  // Load folder list on mount
  useEffect(() => {
    getLocalFolderInfos().then(infos => {
      setFolders(infos);
      if (infos.length > 0 && !activeFolderId) {
        setActiveFolderId(infos[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Load files from the active folder and cross-reference with Drive */
  const loadFiles = useCallback(async () => {
    if (!activeFolderId) {
      setFiles([]);
      return;
    }
    
    setLoading(true);
    try {
      const entry = await getLocalFolderById(activeFolderId);
      if (!entry) {
        setFiles([]);
        setLoading(false);
        return;
      }

      // Navigate to the current subdirectory handle
      let targetHandle = entry.handle;
      const prefix = currentPath;
      if (currentPath !== '') {
        const parts = currentPath.split('/');
        for (const p of parts) {
          targetHandle = await targetHandle.getDirectoryHandle(p);
        }
      }

      // 1. Fetch local files immediately so UI doesn't hang on skeletons
      // Pass entry.handle (root handle) so it can parse .syncignore correctly for subfolders
      const localFiles = await readFolderChildren(targetHandle, prefix, entry.handle);
      
      const initialMerged: FileItem[] = localFiles.map((lf): FileItem => ({
        id: lf.id,
        name: lf.name,
        type: lf.isDirectory ? 'folder' : 'file',
        isDirectory: lf.isDirectory,
        status: 'Syncing', // Temporary status while we check Drive
        size: lf.isDirectory ? '--' : formatBytes(lf.size),
        sizeBytes: lf.size,
        path: lf.path,
        date: formatDate(lf.lastModified),
        mimeType: lf.mimeType,
        handle: lf.handle,
      }));

      setFiles(initialMerged);
      setLoading(false); // Stop showing skeletons immediately

      // 2. Fetch Drive files in background to update sync statuses
      const driveFiles = await fetchDriveFiles();
      const driveByNameAndParent = new Map<string, DriveFile>();
      driveFiles.forEach((f) => driveByNameAndParent.set(f.name.toLowerCase(), f));

      setFiles(prevFiles => {
        // Simple safeguard: only update if the file paths match our prefix
        // (in case the user quickly navigated to another folder before Drive fetch finished)
        if (prevFiles.length > 0 && !prevFiles[0].path.startsWith(prefix)) {
          return prevFiles;
        }

        return prevFiles.map(file => {
          const driveMatch = driveByNameAndParent.get(file.name.toLowerCase());
          return {
            ...file,
            status: driveMatch ? 'Synced' : 'Local Only',
            driveId: driveMatch?.id,
            thumbnailLink: driveMatch?.thumbnailLink,
            iconLink: driveMatch?.iconLink,
          };
        });
      });
    } catch (err: any) {
      console.error('Error loading files', err);
      showToast(`Failed to load files: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, currentPath, showToast]);

  // Reset path when active folder changes
  useEffect(() => {
    if (activeFolderId) {
      setCurrentPath('');
    }
  }, [activeFolderId]);

  // Reload files when dependencies change
  useEffect(() => {
    if (activeFolderId) {
      loadFiles();
    }
  }, [activeFolderId, loadFiles]);

  // Reload files after global sync completes
  useEffect(() => {
    const handleSyncComplete = () => {
      loadFiles();
    };
    window.addEventListener('omnisync-sync-completed', handleSyncComplete);
    return () => window.removeEventListener('omnisync-sync-completed', handleSyncComplete);
  }, [loadFiles]);

  // Auth state
  useEffect(() => {
    const unsub = initAuth(
      (u) => { setUser(u); loadFiles(); },
      () => { setUser(null); loadFiles(); }
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when window gets focus
  useEffect(() => {
    const onFocus = () => { if (userRef.current && activeFolderId) loadFiles(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadFiles, activeFolderId]);

  const getParentPath = (path: string) => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  };

  const proceedWithAddFolder = useCallback(async () => {
    setShowPermissionModal(false);
    setAddingFolder(true);
    try {
      const handle = await pickAndInitFolder();
      if (handle) {
        setPendingFolderHandle(handle);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to pick folder', 'error');
      }
    } finally {
      setAddingFolder(false);
    }
  }, [showToast]);

  const handleAddFolder = useCallback(() => {
    // Directly start picking a folder, we don't need to ask permission 
    // unless this is a specific design. Wait, the old code showed the permission modal.
    // I'll keep the permission modal flow to be safe.
    setShowPermissionModal(true);
  }, []);

  const handleForceSync = useCallback(async () => {
    if (!userRef.current) { showToast('Connect your Google account first.', 'error'); return; }
    if (!activeFolderId) { showToast('Select a folder first.', 'error'); return; }
    
    await startSync(activeFolderId);
  }, [activeFolderId, startSync, showToast]);
  handleForceSyncRef.current = handleForceSync;

  const handleAddFiles = useCallback(async () => {
    if (!activeFolderId) {
      showToast('Select a folder first.', 'error');
      return;
    }
    try {
      const handles = await (window as any).showOpenFilePicker({ multiple: true });
      if (!handles || handles.length === 0) return;
      
      setAddingFiles(true);
      const entry = await getLocalFolderById(activeFolderId);
      if (!entry) throw new Error('Folder not found or permission denied');
      
      let targetHandle = entry.handle;
      if (currentPath !== '') {
        const parts = currentPath.split('/');
        for (const p of parts) {
          targetHandle = await targetHandle.getDirectoryHandle(p);
        }
      }

      let hasNewFiles = false;
      for (const handle of handles) {
        const file = await handle.getFile();
        const newFileHandle = await targetHandle.getFileHandle(file.name, { create: true });
        const writable = await (newFileHandle as any).createWritable();
        await writable.write(file);
        await writable.close();
        hasNewFiles = true;
      }
      
      if (hasNewFiles) {
        showToast("Files added successfully!", "success");
        loadFiles();
        handleForceSyncRef.current?.();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to add files', 'error');
      }
    } finally {
      setAddingFiles(false);
      setIsFabMenuOpen(false);
    }
  }, [activeFolderId, currentPath, loadFiles, showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!activeFolderId) return;
    e.preventDefault();
    setIsDragging(true);
  }, [activeFolderId]);

  // Prevent tab refresh/close while syncing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncing) {
        e.preventDefault();
        e.returnValue = ''; // Required to show the browser warning dialog
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncing]);

  // Keep screen awake while syncing to reduce background throttling
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && syncing) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    };

    if (syncing) {
      requestWakeLock();
    } else if (wakeLock) {
      wakeLock.release().then(() => { wakeLock = null; });
    }
    
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [syncing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!activeFolderId) return;
    
    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    try {
      const entry = await getLocalFolderById(activeFolderId);
      if (!entry) return;

      let targetHandle = entry.handle;
      if (currentPath !== '') {
        const parts = currentPath.split('/');
        for (const p of parts) {
          targetHandle = await targetHandle.getDirectoryHandle(p);
        }
      }

      let hasNewFiles = false;

      for (const item of items) {
        if (item.kind === 'file') {
          let file: File | null = null;
          
          if ('getAsFileSystemHandle' in item) {
            const handle = await (item as any).getAsFileSystemHandle();
            if (handle && handle.kind === 'file') {
              file = await handle.getFile();
            }
          } else {
            file = item.getAsFile();
          }

          if (file) {
            const newFileHandle = await targetHandle.getFileHandle(file.name, { create: true });
            const writable = await (newFileHandle as any).createWritable();
            await writable.write(file);
            await writable.close();
            hasNewFiles = true;
          }
        }
      }

      if (hasNewFiles) {
        showToast("Files saved successfully!", "success");
        loadFiles();
        handleForceSyncRef.current?.();
      }
    } catch (err: any) {
      console.error('Drop error:', err);
      showToast(err.message || 'Failed to save dropped files', 'error');
    }
  }, [activeFolderId, currentPath, loadFiles, showToast]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (q) {
      return files.filter((f) => f.name.toLowerCase().includes(q) || f.date.toLowerCase().includes(q));
    }
    // readFolderChildren already returns only the current directory's children
    return files;
  }, [files, searchQuery]);

  const handleSelectAll = useCallback(() => {
    const allSelected = filteredFiles.length > 0 && selectedIds.size === filteredFiles.length;
    setSelectedIds(allSelected ? new Set() : new Set(filteredFiles.map((f) => f.id)));
  }, [filteredFiles, selectedIds]);

  const handleSelectFile = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((file: FileItem) => {
    if (selectedIds.size > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.has(file.id) ? next.delete(file.id) : next.add(file.id);
        return next;
      });
      return;
    }

    if (file.isDirectory) {
      setCurrentPath(file.path);
      setSearchQuery('');
    } else {
      setPreviewFile(file);
    }
  }, [selectedIds.size]);

  const closePreview = useCallback(() => setPreviewFile(null), []);



  const handleDeleteFile = useCallback(async () => {
    if (!filesToDelete || filesToDelete.length === 0) return;
    setDeletingFiles(true);
    let successCount = 0;
    
    try {
      for (const file of filesToDelete) {
        if (file.driveId) {
          await deleteDriveFile(file.driveId);
          await removeSyncState(file.path);
        }
        successCount++;
        setFiles(prev => prev.filter(f => f.id !== file.id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
      showToast(`Deleted ${successCount} file(s) successfully`, 'success');
    } catch (err: any) {
      showToast(`Failed to delete some files: ${err.message}`, 'error');
    } finally {
      setDeletingFiles(false);
      setFilesToDelete(null);
    }
  }, [filesToDelete, showToast]);

  // ── Status badge config ─────────────────────────────────────────────────────
  const statusBadge: Record<SyncStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    Synced:      { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} />, label: 'Synced' },
    Syncing:     { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',         icon: <UploadCloud size={12} className="animate-pulse" />, label: 'Syncing' },
    'Local Only':{ cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       icon: <HardDrive size={12} />, label: 'Local Only' },
    'Not Synced':{ cls: 'bg-neutral-700/50 text-neutral-400 border-neutral-700',    icon: <CloudOff size={12} />, label: 'Not Synced' },
  };

  const noFolders = folders.length === 0;
  const noAccount = !user;

  const breadcrumbs = currentPath ? currentPath.split('/') : [];
  const handleNavigate = (index: number) => {
    if (index === -1) setCurrentPath('');
    else setCurrentPath(breadcrumbs.slice(0, index + 1).join('/'));
  };

  const activeFolder = folders.find(f => f.id === activeFolderId);

  // Load the active folder's handle for the syncignore modal
  useEffect(() => {
    if (!activeFolderId) { setActiveFolderHandle(null); return; }
    getLocalFolderById(activeFolderId).then(entry => {
      setActiveFolderHandle(entry?.handle ?? null);
    });
  }, [activeFolderId]);

  // Handler: add selected files to .syncignore
  const handleIgnoreFiles = useCallback(async () => {
    if (!activeFolderHandle || selectedIds.size === 0) return;
    const selected = filteredFiles.filter(f => selectedIds.has(f.id));
    if (selected.length === 0) return;

    try {
      // Read existing content
      let existing = '';
      try {
        const fh = await activeFolderHandle.getFileHandle('.syncignore');
        const file = await fh.getFile();
        existing = await file.text();
      } catch {
        // no file yet
      }

      const lines = existing.split('\n').map(l => l.trim());
      const newPatterns = selected
        .map(f => f.path)
        .filter(p => !lines.includes(p));

      if (newPatterns.length === 0) {
        showToast('Selected items are already in .syncignore', 'info');
        return;
      }

      const updated = existing.trimEnd() + '\n' + newPatterns.join('\n') + '\n';
      const fh = await activeFolderHandle.getFileHandle('.syncignore', { create: true });
      const writable = await (fh as any).createWritable();
      await writable.write(updated);
      await writable.close();

      showToast(`Added ${newPatterns.length} pattern(s) to .syncignore`, 'success');
      setSelectedIds(new Set());
      loadFiles();
    } catch (err: any) {
      showToast(err.message || 'Failed to update .syncignore', 'error');
    }
  }, [activeFolderHandle, selectedIds, filteredFiles, showToast, loadFiles]);

  // File counts for badge
  const fileCounts = useMemo(() => {
    const total = filteredFiles.length;
    const fileCount = filteredFiles.filter(f => !f.isDirectory).length;
    const folderCount = filteredFiles.filter(f => f.isDirectory).length;
    return { total, fileCount, folderCount };
  }, [filteredFiles]);

  return (
    <div
      className={`h-full flex flex-col relative ${isDragging ? 'ring-2 ring-blue-500/30 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay - NO backdrop-filter */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 border-2 border-dashed border-blue-500 m-4 rounded-3xl pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-neutral-900 p-8 rounded-2xl flex flex-col items-center shadow-xl border border-blue-500/30">
              <UploadCloud size={48} className="text-blue-400 mb-4 animate-bounce" />
              <h3 className="text-xl font-bold text-neutral-100 mb-2">Drop files to upload</h3>
              <p className="text-neutral-400 text-sm">Files will be synced to Google Drive</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-4 sm:px-6 md:px-8 border-b border-border/70 sticky top-0 bg-background/95 backdrop-blur-md z-10">
        {/* Top row */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto whitespace-nowrap hide-scrollbar">
            <h2 className="text-sm font-bold text-foreground shrink-0">Files</h2>
            {activeFolder && (
              <>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                <button 
                  onClick={() => handleNavigate(-1)}
                  className={`text-xs sm:text-sm hover:text-foreground transition-colors shrink-0 ${currentPath === '' ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                >
                  {activeFolder.name}
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    <button 
                      onClick={() => handleNavigate(idx)}
                      className={`text-xs sm:text-sm hover:text-foreground transition-colors truncate max-w-[120px] ${idx === breadcrumbs.length - 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-10 py-1.5 text-xs sm:text-sm bg-secondary/80 border border-border/80 text-foreground rounded-xl focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all w-32 sm:w-48 placeholder:text-muted-foreground"
              />
              <kbd className="hidden sm:inline-block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border/70 font-mono pointer-events-none">⌘K</kbd>
            </div>
            
            {/* Action Buttons Group */}
            <div className="flex items-center gap-1.5 justify-end shrink-0">
              {/* View toggle */}
              <div className="flex items-center bg-secondary/80 border border-border/80 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="Grid view"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="List view"
                >
                  <List size={15} />
                </button>
              </div>
              
              {/* Refresh */}
              <button
                onClick={loadFiles}
                disabled={noFolders || loading || syncing}
                title="Refresh files"
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary/80 hover:bg-secondary disabled:opacity-50 text-foreground text-xs sm:text-sm font-medium rounded-xl transition-colors border border-border/80"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">Refresh</span>
              </button>
              
              {/* Sync */}
              <button
                onClick={handleForceSync}
                disabled={noFolders || loading || syncing || noAccount}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-xs sm:text-sm font-medium rounded-xl transition-all shadow-sm shadow-primary/20"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>{syncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Toolbar */}
        <div className="flex flex-wrap items-center gap-2 py-2.5 border-t border-border/50">
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
              className="flex items-center justify-between min-w-[170px] max-w-[240px] gap-2 px-3 py-1.5 bg-secondary/80 border border-border/80 hover:border-primary/50 rounded-xl transition-all group"
            >
              <div className="flex items-center gap-2.5 truncate">
                <Folder size={15} className="text-primary shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                  {activeFolder?.name || 'Select Folder'}
                </span>
              </div>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform duration-200 ${isFolderDropdownOpen ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
              {isFolderDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsFolderDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1.5 w-60 bento-block !p-1.5 shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="max-h-60 overflow-y-auto p-1 hide-scrollbar space-y-1">
                      {folders.map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => {
                            setActiveFolderId(folder.id);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm transition-colors ${
                            activeFolderId === folder.id 
                              ? 'bg-primary/10 text-primary font-medium' 
                              : 'text-foreground hover:bg-secondary/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate mr-2">
                            <Folder size={14} className={activeFolderId === folder.id ? 'text-primary' : 'text-muted-foreground shrink-0'} />
                            <span className="truncate">{folder.name}</span>
                          </div>
                          {activeFolderId === folder.id && (
                            <CheckCircle size={14} className="text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          
          {/* + New dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:opacity-90 text-primary-foreground text-xs sm:text-sm font-medium rounded-xl transition-all shadow-sm shadow-primary/20"
            >
              <Plus size={14} />
              <span>New</span>
              <ChevronDown size={12} className={`transition-transform duration-150 ${isFabMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {isFabMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsFabMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full mt-1.5 w-48 bento-block !p-1.5 shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => { setIsFabMenuOpen(false); handleAddFolder(); }}
                      disabled={addingFolder}
                      className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm text-foreground hover:bg-secondary/70 transition-colors"
                    >
                      {addingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} className="text-primary" />}
                      <span>New Folder</span>
                    </button>
                    {activeFolderId && (
                      <button
                        onClick={() => { setIsFabMenuOpen(false); handleAddFiles(); }}
                        disabled={addingFiles || syncing}
                        className="flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm text-foreground hover:bg-secondary/70 transition-colors"
                      >
                        {addingFiles ? <Loader2 size={14} className="animate-spin" /> : <FilePlus size={14} className="text-emerald-400" />}
                        <span>Add Files</span>
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        
          <button
            onClick={handleAddFolder}
            disabled={addingFolder}
            title="Add New Folder"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground border border-dashed border-border/80 hover:border-primary/50 hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0"
          >
            {addingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
            <span className="hidden sm:inline">Add Folder</span>
          </button>

          {activeFolderId && (
            <button
              onClick={() => setShowSyncIgnoreModal(true)}
              title="Manage .syncignore"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-amber-400/90 border border-amber-500/30 hover:border-amber-500/50 hover:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition-colors shrink-0"
            >
              <EyeOff size={14} />
              <span className="hidden sm:inline">.syncignore</span>
            </button>
          )}
        </div>
      </header>
      
      {/* Sync progress bar */}
      <AnimatePresence>
        {syncing && (
          <motion.div
            className="bg-blue-500/10 border-b border-blue-500/20 px-8 py-2.5 flex items-center gap-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
             <Loader2 size={14} className="animate-spin text-blue-400" />
             <span className="text-sm font-medium text-blue-400">{syncProgressMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        className="flex-1 overflow-auto p-6 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        
        {/* Drag Overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div 
              className="absolute inset-4 z-50 bg-blue-500/10 border-2 border-dashed border-blue-500/50 rounded-2xl flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                <UploadCloud size={40} className="text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-blue-400">Drop files here</h3>
              <p className="text-blue-400/80 mt-2">Files will be saved locally and synced to Drive</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selection toolbar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              className="mb-4 p-3.5 bento-subcard border border-primary/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs sm:text-sm font-bold text-foreground">{selectedIds.size} item(s) selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShareFiles(filteredFiles.filter(f => selectedIds.has(f.id)))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
                >
                  <Share2 size={14} /> Share
                </button>
                <button
                  onClick={handleIgnoreFiles}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
                >
                  <EyeOff size={14} /> Ignore
                </button>
                <button
                  onClick={() => setFilesToDelete(filteredFiles.filter(f => selectedIds.has(f.id)))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button 
                  onClick={() => setSelectedIds(new Set())} 
                  className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors cursor-pointer ml-auto sm:ml-0"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No folder / no account prompts */}
        {noFolders || noAccount ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center animate-fadeInUp max-w-md mx-auto">
            {noAccount ? (
              <div className="bento-block p-8 flex flex-col items-center text-center w-full">
                <div className="w-16 h-16 bg-secondary/80 rounded-2xl flex items-center justify-center mb-5 border border-border">
                  <CloudOff size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">Google Drive Not Connected</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">Connect your Google account in the Accounts tab to enable bi-directional sync.</p>
              </div>
            ) : (
              <div className="bento-block p-8 flex flex-col items-center text-center w-full">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5 border border-primary/20">
                  <FolderPlus size={32} className="text-primary" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">No Folders Added</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                  Add a folder from your local PC to enable automatic bidirectional synchronization with Google Drive.
                </p>
                <button
                  onClick={handleAddFolder}
                  disabled={addingFolder}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 active:scale-[0.98] text-primary-foreground text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  {addingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                  Select Local Folder
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* File count bar */}
            <div className="flex items-center justify-between mb-4 animate-fadeInDown">
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500">
                  {fileCounts.total} items
                  {fileCounts.folderCount > 0 && <> · {fileCounts.folderCount} folder{fileCounts.folderCount !== 1 ? 's' : ''}</>}
                  {fileCounts.fileCount > 0 && <> · {fileCounts.fileCount} file{fileCounts.fileCount !== 1 ? 's' : ''}</>}
                </span>
              </div>
              {viewMode === 'list' && filteredFiles.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer" onClick={handleSelectAll}>
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors border ${
                    filteredFiles.length > 0 && selectedIds.size === filteredFiles.length ? 'bg-blue-500 border-blue-500 text-white' : 'bg-neutral-800 border-neutral-600 text-transparent hover:border-neutral-400'
                  }`}>
                    <Check size={10} strokeWidth={3} className={`transition-opacity duration-200 ${filteredFiles.length > 0 && selectedIds.size === filteredFiles.length ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                  Select all
                </div>
              )}
            </div>

            {/* Loading state */}
            {loading ? (
              <div className="w-full">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2 animate-pulse">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 h-[100px]">
                        <div className="w-9 h-9 bg-neutral-800 rounded-lg mb-2" />
                        <div className="w-3/4 h-3.5 bg-neutral-800 rounded mb-1.5" />
                        <div className="w-1/2 h-3 bg-neutral-800/60 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden animate-pulse">
                    <div className="flex flex-col">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-neutral-800/50">
                          <div className="w-8 h-8 bg-neutral-800 rounded-lg shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="w-1/3 h-4 bg-neutral-800 rounded" />
                            <div className="w-1/4 h-3 bg-neutral-800 rounded hidden md:block" />
                          </div>
                          <div className="w-24 h-4 bg-neutral-800 rounded hidden sm:block" />
                          <div className="w-24 h-4 bg-neutral-800 rounded hidden md:block" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : filteredFiles.length > 0 ? (
              <AnimatePresence mode="wait">
                {viewMode === 'grid' ? (
                  <motion.div 
                    key="grid"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2"
                  >
                    <AnimatePresence>
                      {filteredFiles.map((file) => {
                        const typeInfo = getFileTypeInfo(file.name, file.mimeType, file.isDirectory);
                        const TypeIcon = typeInfo.icon;
                        const badge = statusBadge[file.status];
                        const isSelected = selectedIds.has(file.id);
                        
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            key={file.id}
                            onClick={() => handleRowClick(file)}
                            className={`group relative bento-subcard !p-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                              isSelected ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/30' : 'border-border/70 hover:border-border'
                            }`}
                          >
                            {/* Selection checkbox */}
                            <div
                              className={`absolute top-2 right-2 z-10 transition-all duration-150 ${
                                isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFile(e, file.id);
                              }}
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors border ${
                                isSelected ? 'bg-primary border-primary text-primary-foreground shadow-sm' : 'bg-secondary/80 border-border text-transparent hover:border-muted-foreground backdrop-blur-sm'
                              }`}>
                                <Check size={14} strokeWidth={3} className={`transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                              </div>
                            </div>
                            
                            {/* File icon */}
                            <div className={`w-9 h-9 rounded-xl ${typeInfo.bg} border ${typeInfo.borderColor} flex items-center justify-center mb-2`}>
                              <TypeIcon size={18} className={typeInfo.color} />
                            </div>
                            
                            {/* File name */}
                            <p className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors" title={file.name}>
                              {file.name}
                            </p>
                            
                            {/* Meta */}
                            <div className="flex items-center justify-between mt-1 text-muted-foreground">
                              <span className="text-xs">{file.isDirectory ? 'Folder' : file.size}</span>
                              <div className="flex items-center gap-2">
                                {!file.isDirectory && file.driveId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShareFiles([file]);
                                    }}
                                    className="text-muted-foreground hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Share File"
                                  >
                                    <Share2 size={14} />
                                  </button>
                                )}
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  file.status === 'Synced' ? 'bg-emerald-400' :
                                  file.status === 'Syncing' ? 'bg-blue-400 animate-pulse' :
                                  file.status === 'Local Only' ? 'bg-amber-400' : 'bg-neutral-600'
                                }`} title={file.status} />
                              </div>
                            </div>
                            
                            {/* Search path hint */}
                            {searchQuery && file.path !== file.name && (
                              <div className="text-[10px] text-muted-foreground mt-1 truncate" title={file.path}>
                                {file.path}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                ) : (
                /* ── List View (Virtualized) ── */
                <motion.div 
                  key="list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bento-block !p-0 overflow-hidden shadow-sm"
                >
                  {/* Header row */}
                  <div className="flex items-center border-b border-border/70 bg-secondary/50 min-w-[600px]">
                    <div className="px-5 py-3 w-14 shrink-0 flex items-center">
                      <div
                        onClick={handleSelectAll}
                        className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors border cursor-pointer ${
                          filteredFiles.length > 0 && selectedIds.size === filteredFiles.length ? 'bg-primary border-primary text-primary-foreground' : 'bg-secondary border-border text-transparent hover:border-muted-foreground'
                        }`}
                      >
                        <Check size={12} strokeWidth={3} className={`transition-opacity duration-200 ${filteredFiles.length > 0 && selectedIds.size === filteredFiles.length ? 'opacity-100' : 'opacity-0'}`} />
                      </div>
                    </div>
                    <div className="px-5 py-3 flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</div>
                    <div className="px-5 py-3 w-28 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</div>
                    <div className="px-5 py-3 w-24 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:block">Size</div>
                    <div className="px-5 py-3 w-28 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:block">Modified</div>
                    <div className="px-5 py-3 w-16 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</div>
                  </div>
                  {/* Virtualized rows */}
                  <VirtualizedListBody
                    files={filteredFiles}
                    selectedIds={selectedIds}
                    searchQuery={searchQuery}
                    statusBadge={statusBadge}
                    handleRowClick={handleRowClick}
                    handleSelectFile={handleSelectFile}
                    setShareFiles={setShareFiles}
                  />
                </motion.div>
              )}
              </AnimatePresence>
            ) : (
              /* Empty state */
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                {searchQuery ? (
                  <div className="bento-block p-8 flex flex-col items-center text-center max-w-sm mx-auto w-full">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3 text-muted-foreground">
                      <Search size={22} />
                    </div>
                    <p className="text-sm font-bold text-foreground">No results for &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-xs text-muted-foreground mt-1">Try checking for typos or searching a different term</p>
                    <button onClick={() => setSearchQuery('')} className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors cursor-pointer">Clear Search</button>
                  </div>
                ) : (
                  <div className="bento-block p-8 flex flex-col items-center text-center max-w-sm mx-auto w-full">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3 text-muted-foreground">
                      <FolderOpen size={22} />
                    </div>
                    <p className="text-sm font-bold text-foreground">This folder is empty</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">Upload local files or create a new subfolder to get started</p>
                    <div className="flex items-center gap-2">
                      <button onClick={handleAddFiles} disabled={!activeFolderId} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-xl transition-all shadow-sm shadow-primary/20 disabled:opacity-50 cursor-pointer"><UploadCloud size={14} /> Upload</button>
                      <button onClick={handleAddFolder} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-xl transition-colors cursor-pointer"><FolderPlus size={14} /> New Folder</button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>



      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <FilePreviewModal
            file={previewFile}
            onClose={closePreview}
            statusBadge={statusBadge}
          />
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {shareFiles && (
          <ShareModal
            isOpen={!!shareFiles}
            onClose={() => setShareFiles(null)}
            files={shareFiles}
          />
        )}
      </AnimatePresence>

      {/* Conflict Modal */}
      <AnimatePresence>
        {currentConflicts.length > 0 && resolveConflictFn && (
          <ConflictResolverModal
            isOpen={currentConflicts.length > 0}
            conflicts={currentConflicts}
            onResolve={resolveConflictFn}
          />
        )}
      </AnimatePresence>

      {/* Pre-Permission Modal */}
      <AnimatePresence>
        {showPermissionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-neutral-100">Permission Required</h3>
              </div>
              <p className="text-neutral-400 text-sm mb-6 leading-relaxed">
                In the next step, your browser will ask for permission to view and edit files in the folder you select. <br /><br />
                <strong className="text-neutral-200">Please click &quot;Allow&quot; on the native browser prompt</strong> to enable CloudSync to synchronize your files.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPermissionModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={proceedWithAddFolder}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-500/20"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SyncIgnore Editor Modal */}
      <AnimatePresence>
        {(showSyncIgnoreModal || pendingFolderHandle) && (
          <SyncIgnoreModal
            isOpen={!!(showSyncIgnoreModal || pendingFolderHandle)}
            onClose={() => {
              setShowSyncIgnoreModal(false);
              setPendingFolderHandle(null);
            }}
            folderHandle={pendingFolderHandle || activeFolderHandle}
            folderName={pendingFolderHandle?.name || activeFolder?.name || ''}
            onSaved={async () => {
              if (pendingFolderHandle) {
                 try {
                   const entry = await commitLocalFolder(pendingFolderHandle);
                   const infos = await getLocalFolderInfos();
                   setFolders(infos);
                   setActiveFolderId(entry.id);
                   showToast(`Added folder "${entry.info.name}"`, 'success');
                 } catch (err: any) {
                   showToast(err.message || 'Failed to add folder', 'error');
                 }
                 setPendingFolderHandle(null);
              } else {
                showToast('.syncignore updated — refreshing files', 'success');
                loadFiles();
              }
            }}
            isNewFolder={!!pendingFolderHandle}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!filesToDelete && filesToDelete.length > 0}
        title={filesToDelete?.length === 1 ? 'Delete File' : `Delete ${filesToDelete?.length} Files`}
        message={
          filesToDelete?.length === 1 ? (
            <>
              Are you sure you want to delete <strong>{filesToDelete[0].name}</strong>?
              {filesToDelete[0].driveId ? ' This will delete the file from Google Drive.' : ' This file is only stored locally.'}
            </>
          ) : (
            `Are you sure you want to delete ${filesToDelete?.length} selected files? Files synced to Google Drive will be removed from the cloud.`
          )
        }
        confirmText={deletingFiles ? 'Deleting...' : 'Delete'}
        isDestructive
        onConfirm={handleDeleteFile}
        onCancel={() => !deletingFiles && setFilesToDelete(null)}
      />
    </div>
  );
});

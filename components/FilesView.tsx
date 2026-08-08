'use client';
import {
  Search, Folder, MoreVertical, UploadCloud, 
  X, Download, CheckCircle, HardDrive,
  RefreshCw, FolderOpen, CloudOff, Loader2,
  LayoutGrid, List, Plus, FolderPlus, ChevronRight, Trash2, Share2, ChevronDown
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchDriveFiles, DriveFile, uploadFileToDrive, deleteDriveFile } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import {
  getLocalFolders, getLocalFolderById, addLocalFolder, readFolderFiles,
  LocalFile, SyncFolderEntry, getLocalFolderInfos, SyncFolder,
} from '../lib/localFolder';
import { syncBiDirectional, ConflictItem } from '../lib/syncBiDirectional';
import { useToast } from './ToastContext';
import { FilePreviewModal, getFileTypeInfo } from './FilePreviewModal';
import { ConfirmDialog } from './ConfirmDialog';
import { ShareModal } from './ShareModal';
import { ConflictResolverModal } from './ConflictResolverModal';
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

export const FilesView = React.memo(function FilesView() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareFile, setShareFile] = useState<{ id: string; name: string; driveId?: string } | null>(null);
  const [currentConflicts, setCurrentConflicts] = useState<ConflictItem[]>([]);
  const [resolveConflictFn, setResolveConflictFn] = useState<((res: 'local' | 'drive' | 'skip') => void) | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  // Multi-folder state
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);

  // File Deletion State
  const [filesToDelete, setFilesToDelete] = useState<FileItem[] | null>(null);
  const [deletingFiles, setDeletingFiles] = useState(false);

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

      const [localFiles, driveFiles] = await Promise.all([
        readFolderFiles(entry.handle),
        fetchDriveFiles(),
      ]);

      const driveByNameAndParent = new Map<string, DriveFile>();
      driveFiles.forEach((f) => driveByNameAndParent.set(f.name.toLowerCase(), f));

      const merged: FileItem[] = localFiles.map((lf): FileItem => {
        const driveMatch = driveByNameAndParent.get(lf.name.toLowerCase());
        return {
          id: lf.id,
          name: lf.name,
          type: lf.isDirectory ? 'folder' : 'file',
          isDirectory: lf.isDirectory,
          status: driveMatch ? 'Synced' : 'Local Only',
          size: lf.isDirectory ? '--' : formatBytes(lf.size),
          sizeBytes: lf.size,
          path: lf.path,
          date: formatDate(lf.lastModified),
          driveId: driveMatch?.id,
          mimeType: lf.mimeType,
          thumbnailLink: driveMatch?.thumbnailLink,
          iconLink: driveMatch?.iconLink,
          handle: lf.handle,
        };
      });

      setFiles(merged);
    } catch (err: any) {
      console.error('Error loading files', err);
      showToast(`Failed to load files: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, showToast]);

  // Reload files when active folder changes
  useEffect(() => {
    if (activeFolderId) {
      setCurrentPath('');
      loadFiles();
    }
  }, [activeFolderId, loadFiles]);

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

  const handleAddFolder = useCallback(async () => {
    setAddingFolder(true);
    try {
      const entry = await addLocalFolder();
      if (entry) {
        const infos = await getLocalFolderInfos();
        setFolders(infos);
        setActiveFolderId(entry.id);
        showToast(`Added folder "${entry.info.name}"`, 'success');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to add folder', 'error');
      }
    } finally {
      setAddingFolder(false);
    }
  }, [showToast]);

  const handleForceSync = useCallback(async () => {
    if (!userRef.current) { showToast('Connect your Google account first.', 'error'); return; }
    if (!activeFolderId) { showToast('Select a folder first.', 'error'); return; }
    
    setSyncing(true);
    setSyncProgressMsg('Starting sync...');
    try {
      const entry = await getLocalFolderById(activeFolderId);
      if (!entry) throw new Error('Folder not found or permission denied');
      
      await syncBiDirectional(entry.handle, (msg) => {
        setSyncProgressMsg(msg);
      }, (conflicts) => {
        return new Promise<'local' | 'drive' | 'skip'>((resolve) => {
          setCurrentConflicts(conflicts);
          setResolveConflictFn(() => (res: 'local' | 'drive' | 'skip') => {
            setCurrentConflicts([]);
            setResolveConflictFn(null);
            resolve(res);
          });
        });
      });
      
      showToast('Sync completed successfully!', 'success');
      loadFiles();
    } catch (err: any) {
      console.error(err);
      showToast(`Sync failed: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
      setSyncProgressMsg('');
    }
  }, [activeFolderId, loadFiles, showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!activeFolderId) return;
    e.preventDefault();
    setIsDragging(true);
  }, [activeFolderId]);

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
        handleForceSync();
      }
    } catch (err: any) {
      console.error('Drop error:', err);
      showToast(err.message || 'Failed to save dropped files', 'error');
    }
  }, [activeFolderId, currentPath, loadFiles, handleForceSync, showToast]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (q) {
      return files.filter((f) => f.name.toLowerCase().includes(q) || f.date.toLowerCase().includes(q));
    } else {
      return files.filter((f) => getParentPath(f.path) === currentPath);
    }
  }, [files, searchQuery, currentPath]);

  const handleSelectAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? new Set(filteredFiles.map((f) => f.id)) : new Set());
  }, [filteredFiles]);

  const handleSelectFile = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((file: FileItem) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
      setSearchQuery('');
    } else {
      setPreviewFile(file);
    }
  }, []);

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
      <header className="px-8 max-md:pl-20 py-6 border-b border-neutral-800 flex flex-col gap-4 sticky top-0 bg-neutral-950/95 z-10">
        {/* Top row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col min-w-0 flex-1 mr-4">
            <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Files</h2>
            {activeFolder && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-neutral-400 overflow-x-auto whitespace-nowrap hide-scrollbar pb-1">
                <button 
                  onClick={() => handleNavigate(-1)}
                  className={`hover:text-neutral-200 transition-colors shrink-0 ${currentPath === '' ? 'text-neutral-200 font-medium' : ''}`}
                >
                  {activeFolder.name}
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={12} className="text-neutral-600 shrink-0" />
                    <button 
                      onClick={() => handleNavigate(idx)}
                      className={`hover:text-neutral-200 transition-colors truncate ${idx === breadcrumbs.length - 1 ? 'text-neutral-200 font-medium' : ''}`}
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
            {/* Search */}
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all w-full md:w-56 placeholder:text-neutral-500"
              />
            </div>
            
            {/* Action Buttons Group */}
            <div className="flex items-center gap-2 justify-end shrink-0">
              {/* View toggle */}
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    viewMode === 'grid' ? 'bg-neutral-800 text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                  aria-label="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all duration-200 ${
                    viewMode === 'list' ? 'bg-neutral-800 text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
              </div>
              
              {/* Refresh */}
              <button
                onClick={loadFiles}
                disabled={noFolders || loading || syncing}
                title="Refresh files"
                className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-200 text-sm font-medium rounded-xl transition-colors"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                <span className="hidden sm:inline">Refresh</span>
              </button>
              
              {/* Sync */}
              <button
                onClick={handleForceSync}
                disabled={noFolders || loading || syncing || noAccount}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm shadow-blue-500/20 hover:shadow-blue-500/30"
              >
                {syncing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync to Drive'}</span>
                <span className="sm:hidden">{syncing ? 'Syncing...' : 'Sync'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Folder Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
            className="flex items-center justify-between min-w-[200px] max-w-[280px] gap-3 px-4 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 rounded-xl transition-all shadow-sm group"
          >
            <div className="flex items-center gap-2.5 truncate">
              <Folder size={16} className="text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-neutral-200 truncate">
                {activeFolder?.name || 'Select Folder'}
              </span>
            </div>
            <ChevronDown size={14} className={`text-neutral-500 shrink-0 transition-transform duration-200 ${isFolderDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isFolderDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsFolderDropdownOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-64 bg-neutral-900 border border-neutral-800 shadow-xl rounded-xl z-50 overflow-hidden"
                >
                  <div className="max-h-60 overflow-y-auto p-1.5 hide-scrollbar">
                    {folders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => {
                          setActiveFolderId(folder.id);
                          setIsFolderDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          activeFolderId === folder.id 
                            ? 'bg-blue-500/10 text-blue-400' 
                            : 'text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate mr-2">
                          <Folder size={14} className={activeFolderId === folder.id ? 'text-blue-400' : 'text-neutral-500 shrink-0'} />
                          <span className="truncate">{folder.name}</span>
                        </div>
                        {activeFolderId === folder.id && (
                          <CheckCircle size={14} className="text-blue-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-1.5 border-t border-neutral-800 bg-neutral-900/50">
                    <button
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        handleAddFolder();
                      }}
                      disabled={addingFolder}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                    >
                      {addingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                      Add New Folder
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
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
              className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <span className="text-sm font-medium text-blue-400">{selectedIds.size} item(s) selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilesToDelete(filteredFiles.filter(f => selectedIds.has(f.id)))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  <Trash2 size={14} /> Delete Selected
                </button>
                <button 
                  onClick={() => setSelectedIds(new Set())} 
                  className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No folder / no account prompts */}
        {noFolders || noAccount ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-fadeInUp">
            {noAccount ? (
              <>
                <div className="w-20 h-20 bg-neutral-800/50 rounded-2xl flex items-center justify-center mb-6 border border-neutral-700/50">
                  <CloudOff size={36} className="text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-200 mb-2">Not connected</h3>
                <p className="text-sm text-neutral-500 max-w-xs">Connect your Google account in the <span className="text-blue-400">Accounts</span> tab to enable sync.</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-neutral-800/50 rounded-2xl flex items-center justify-center mb-6 border border-neutral-700/50">
                  <FolderPlus size={36} className="text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-200 mb-2">No folders added</h3>
                <p className="text-sm text-neutral-500 max-w-xs mb-6">
                  Add a folder from your PC to start syncing with Google Drive.
                </p>
                <button
                  onClick={handleAddFolder}
                  disabled={addingFolder}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-md shadow-blue-500/20"
                >
                  {addingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                  Select Folder
                </button>
              </>
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
                <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filteredFiles.length > 0 && selectedIds.size === filteredFiles.length}
                    onChange={handleSelectAll}
                    className="w-3.5 h-3.5 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900 cursor-pointer"
                  />
                  Select all
                </label>
              )}
            </div>

            {/* Loading state */}
            {loading ? (
              <div className="w-full">
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 h-36">
                        <div className="w-12 h-12 bg-neutral-800 rounded-xl mb-4" />
                        <div className="w-3/4 h-4 bg-neutral-800 rounded mb-2" />
                        <div className="w-1/2 h-3 bg-neutral-800 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden animate-pulse">
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
              /* ── Grid View ── */
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 stagger-children">
                  {filteredFiles.map((file) => {
                    const typeInfo = getFileTypeInfo(file.name, file.mimeType, file.isDirectory);
                    const TypeIcon = typeInfo.icon;
                    const badge = statusBadge[file.status];
                    const isSelected = selectedIds.has(file.id);
                    
                    return (
                      <div
                        key={file.id}
                        onClick={() => handleRowClick(file)}
                        className={`group relative bg-neutral-900 border rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:bg-neutral-800/70 hover:border-neutral-700 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 ${
                          isSelected ? 'border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/20' : 'border-neutral-800'
                        }`}
                      >
                        {/* Selection checkbox */}
                        <div
                          className={`absolute top-2.5 right-2.5 transition-opacity duration-150 flex items-center gap-1 ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div onClick={(e) => handleSelectFile(e, file.id)} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </div>
                        </div>
                        
                        {/* File icon */}
                        <div className={`w-12 h-12 rounded-xl ${typeInfo.bg} border ${typeInfo.borderColor} flex items-center justify-center mb-3 transition-transform duration-200 group-hover:scale-105`}>
                          <TypeIcon size={22} className={typeInfo.color} />
                        </div>
                        
                        {/* File name */}
                        <p className="text-sm font-medium text-neutral-200 truncate mb-1" title={file.name}>
                          {file.name}
                        </p>
                        
                        {/* Meta */}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-neutral-500">{file.isDirectory ? 'Folder' : file.size}</span>
                          <div className="flex items-center gap-2">
                            {!file.isDirectory && file.driveId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareFile({ id: file.id, name: file.name, driveId: file.driveId });
                                }}
                                className="text-neutral-500 hover:text-blue-400 p-1 rounded-md hover:bg-blue-500/10 transition-colors opacity-0 group-hover:opacity-100"
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
                          <div className="text-[10px] text-neutral-600 mt-1 truncate" title={file.path}>
                            {file.path}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── List View ── */
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-neutral-900/50">
                        <th className="px-5 py-3.5 w-10">
                          <input
                            type="checkbox"
                            checked={filteredFiles.length > 0 && selectedIds.size === filteredFiles.length}
                            onChange={handleSelectAll}
                            className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
                          />
                        </th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Name</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Size</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Modified</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 stagger-children">
                      {filteredFiles.map((file) => {
                        const typeInfo = getFileTypeInfo(file.name, file.mimeType, file.isDirectory);
                        const TypeIcon = typeInfo.icon;
                        const badge = statusBadge[file.status];
                        return (
                          <tr
                            key={file.id}
                            onClick={() => handleRowClick(file)}
                            className={`hover:bg-neutral-800/50 transition-colors duration-150 group cursor-pointer ${
                              selectedIds.has(file.id) ? 'bg-blue-500/5' : ''
                            }`}
                          >
                            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(file.id)}
                                onChange={() => {}}
                                onClick={(e) => handleSelectFile(e, file.id)}
                                className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900 cursor-pointer"
                              />
                            </td>
                            <td className="px-5 py-3.5">
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
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badge.cls}`}>
                                {badge.icon} {badge.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-sm text-neutral-400">{file.size}</td>
                            <td className="px-5 py-3.5 text-sm text-neutral-400">{file.date}</td>
                            <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                              {!file.isDirectory && file.driveId ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFile({ id: file.id, name: file.name, driveId: file.driveId });
                                  }}
                                  className="text-neutral-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Share File"
                                >
                                  <Share2 size={16} />
                                </button>
                              ) : (
                                <div className="w-7 h-7 inline-block"></div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-neutral-500 animate-fadeInUp">
                {searchQuery ? (
                  <>
                    <Search size={32} className="text-neutral-700 mb-1" />
                    <p className="text-sm font-medium text-neutral-300">No matching files</p>
                    <p className="text-xs text-neutral-500">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <FolderOpen size={32} className="text-neutral-700 mb-1" />
                    <p className="text-sm font-medium text-neutral-300">Folder is empty</p>
                  </>
                )}
              </div>
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
        {shareFile && (
          <ShareModal
            isOpen={!!shareFile}
            onClose={() => setShareFile(null)}
            file={shareFile}
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

'use client';
import {
  Search, Folder, MoreVertical, UploadCloud, 
  X, Download, CheckCircle, HardDrive,
  RefreshCw, FolderOpen, CloudOff, Loader2,
  LayoutGrid, List, Plus, FolderPlus, ChevronRight,
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchDriveFiles, DriveFile, uploadFileToDrive } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import {
  getLocalFolders, getLocalFolderById, addLocalFolder, readFolderFiles,
  LocalFile, SyncFolderEntry, getLocalFolderInfos, SyncFolder,
} from '../lib/localFolder';
import { syncLocalFolderToDrive } from '../lib/syncEngine';
import { useToast } from './ToastContext';
import { FilePreviewModal, getFileTypeInfo } from './FilePreviewModal';

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
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  // Multi-folder state
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);

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
      
      await syncLocalFolderToDrive(entry.handle, (msg) => {
        setSyncProgressMsg(msg);
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

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!e.dataTransfer.files?.length) return;

    const dropped = Array.from(e.dataTransfer.files);
    for (const file of dropped) {
      const tempId = `upload-${Date.now()}-${file.name}`;
      setFiles((prev) => [{
        id: tempId, name: file.name, type: 'file', isDirectory: false,
        status: 'Syncing', size: formatBytes(file.size), sizeBytes: file.size,
        path: currentPath ? `${currentPath}/${file.name}` : file.name,
        date: formatDate(Date.now()), mimeType: file.type,
      }, ...prev]);

      try {
        const uploaded = await uploadFileToDrive(file);
        showToast(`${file.name} uploaded to Drive`, 'success');
        setFiles((prev) => prev.map((f) => f.id === tempId
          ? { ...f, id: uploaded.id, status: 'Synced', driveId: uploaded.id,
              thumbnailLink: uploaded.thumbnailLink, iconLink: uploaded.iconLink }
          : f
        ));
      } catch (err: any) {
        showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
        setFiles((prev) => prev.map((f) => f.id === tempId ? { ...f, status: 'Local Only' } : f));
      }
    }
  }, [showToast, currentPath]);

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

      {/* Header - NO backdrop-filter */}
      <header className="px-8 py-5 border-b border-neutral-800 flex flex-col gap-4 sticky top-0 bg-neutral-950/95 z-10">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Files</h2>
            {activeFolder && (
              <div className="flex items-center gap-1.5 mt-1.5 text-sm text-neutral-400">
                <button 
                  onClick={() => handleNavigate(-1)}
                  className={`hover:text-neutral-200 transition-colors ${currentPath === '' ? 'text-neutral-200 font-medium' : ''}`}
                >
                  {activeFolder.name}
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight size={12} className="text-neutral-600" />
                    <button 
                      onClick={() => handleNavigate(idx)}
                      className={`hover:text-neutral-200 transition-colors ${idx === breadcrumbs.length - 1 ? 'text-neutral-200 font-medium' : ''}`}
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={15} />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all w-56 placeholder:text-neutral-500"
              />
            </div>
            
            {/* View toggle */}
            <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all duration-200 ${
                  viewMode === 'grid' ? 'bg-neutral-800 text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all duration-200 ${
                  viewMode === 'list' ? 'bg-neutral-800 text-neutral-100 shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <List size={16} />
              </button>
            </div>
            
            {/* Refresh */}
            <button
              onClick={loadFiles}
              disabled={noFolders || loading || syncing}
              className="flex items-center gap-2 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-200 text-sm font-medium rounded-xl transition-colors"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Refresh
            </button>
            
            {/* Sync */}
            <button
              onClick={handleForceSync}
              disabled={noFolders || loading || syncing || noAccount}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all duration-200 shadow-sm shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              {syncing ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
              {syncing ? 'Syncing...' : 'Sync to Drive'}
            </button>
          </div>
        </div>

        {/* Folder tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 shrink-0 border ${
                activeFolderId === folder.id
                  ? 'bg-blue-600/10 text-blue-400 border-blue-500/30 shadow-sm'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              <Folder size={14} className={activeFolderId === folder.id ? 'text-blue-400' : 'text-neutral-500'} />
              {folder.name}
            </button>
          ))}
          <button
            onClick={handleAddFolder}
            disabled={addingFolder}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-neutral-500 border border-dashed border-neutral-700 hover:border-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 transition-all duration-200 shrink-0"
          >
            {addingFolder ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add Folder
          </button>
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

      <div className="flex-1 overflow-auto p-6 relative">

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
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
                Clear
              </button>
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
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-500">
                <Loader2 size={32} className="animate-spin text-blue-400" />
                <p className="text-sm font-medium text-neutral-300">Reading folder...</p>
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
                          className={`absolute top-2.5 right-2.5 transition-opacity duration-150 ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          onClick={(e) => handleSelectFile(e, file.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
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
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            file.status === 'Synced' ? 'bg-emerald-400' :
                            file.status === 'Syncing' ? 'bg-blue-400 animate-pulse' :
                            file.status === 'Local Only' ? 'bg-amber-400' : 'bg-neutral-600'
                          }`} title={file.status} />
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
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
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
                              <button className="text-neutral-500 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical size={16} />
                              </button>
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
    </div>
  );
});

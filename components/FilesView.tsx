'use client';
import {
  Search, Folder, File, MoreVertical, UploadCloud, Trash2, PauseCircle,
  X, Image as ImageIcon, FileText, Download, CheckCircle, HardDrive,
  RefreshCw, FolderOpen, CloudOff, Loader2,
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { fetchDriveFiles, DriveFile, uploadFileToDrive } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import { getLocalFolder, getLocalFolderInfo, readFolderFiles, LocalFile, FolderInfo } from '../lib/localFolder';
import { syncLocalFolderToDrive } from '../lib/syncEngine';
import { useToast } from './ToastContext';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SyncStatus = 'Synced' | 'Syncing' | 'Local Only' | 'Not Synced';

type FileItem = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  status: SyncStatus;
  size: string;
  sizeBytes: number;
  date: string;
  path: string;
  driveId?: string;         // set if matched to a Drive file
  isDirectory: boolean;
  mimeType?: string;
  thumbnailLink?: string;
  iconLink?: string;
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
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [syncProgressMsg, setSyncProgressMsg] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  const { showToast } = useToast();

  /** Load files from the selected local folder and cross-reference with Drive */
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const handle = await getLocalFolder();
      if (!handle) {
        setFiles([]);
        setLoading(false);
        return;
      }

      // Read local files and Drive files in parallel
      const [localFiles, driveFiles] = await Promise.all([
        readFolderFiles(handle),
        fetchDriveFiles(),
      ]);

      const driveByNameAndParent = new Map<string, DriveFile>();
      // For a robust implementation, we would map drive files by their exact path
      // but matching by name is an approximation for this UI state
      driveFiles.forEach((f) => driveByNameAndParent.set(f.name.toLowerCase(), f));

      // Merge: local files are the source of truth, check Drive for sync status
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
        };
      });

      setFiles(merged);
    } catch (err: any) {
      console.error('Error loading files', err);
      showToast(`Failed to load files: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Auth state
  useEffect(() => {
    const unsub = initAuth(
      (u) => { setUser(u); loadFiles(); },
      () => { setUser(null); loadFiles(); }
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if local folder is set on mount
  useEffect(() => {
    getLocalFolderInfo().then(setFolderInfo);
  }, []);

  // Reload when window gets focus (folder may have changed)
  useEffect(() => {
    const onFocus = () => { if (userRef.current) loadFiles(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadFiles]);

  const getParentPath = (path: string) => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  };

  const handleForceSync = useCallback(async () => {
    if (!userRef.current) { showToast('Connect your Google account first.', 'error'); return; }
    
    setSyncing(true);
    setSyncProgressMsg('Starting sync...');
    try {
      const handle = await getLocalFolder();
      if (!handle) throw new Error('No local folder selected');
      
      await syncLocalFolderToDrive(handle, (msg) => {
        setSyncProgressMsg(msg);
      });
      
      showToast('Sync completed successfully!', 'success');
      loadFiles(); // reload to reflect new statuses
    } catch (err: any) {
      console.error(err);
      showToast(`Sync failed: ${err.message}`, 'error');
    } finally {
      setSyncing(false);
      setSyncProgressMsg('');
    }
  }, [loadFiles, showToast]);

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

  // Drag and drop → upload to Drive
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

  // ── No folder selected state ────────────────────────────────────────────────
  const noFolder = !folderInfo;
  const noAccount = !user;

  const breadcrumbs = currentPath ? currentPath.split('/') : [];
  const handleNavigate = (index: number) => {
    if (index === -1) setCurrentPath('');
    else setCurrentPath(breadcrumbs.slice(0, index + 1).join('/'));
  };

  return (
    <div
      className={`h-full flex flex-col relative ${isDragging ? 'bg-blue-500/5' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-900/20 backdrop-blur-sm border-2 border-dashed border-blue-500 m-4 rounded-3xl pointer-events-none">
          <div className="bg-neutral-900 p-8 rounded-2xl flex flex-col items-center shadow-xl border border-blue-500/30">
            <UploadCloud size={48} className="text-blue-400 mb-4 animate-bounce" />
            <h3 className="text-xl font-bold text-neutral-100 mb-2">Drop files to upload</h3>
            <p className="text-neutral-400 text-sm">Files will be synced to Google Drive</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-8 py-6 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Files</h2>
          {folderInfo && (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-neutral-400">
              <button 
                onClick={() => handleNavigate(-1)}
                className={`hover:text-neutral-200 transition-colors ${currentPath === '' ? 'text-neutral-200 font-medium' : ''}`}
              >
                {folderInfo.name}
              </button>
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <span className="text-neutral-600">/</span>
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
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input
              type="text"
              placeholder="Search all files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all w-64 placeholder:text-neutral-500"
            />
          </div>
          <button
            onClick={loadFiles}
            disabled={noFolder || loading || syncing}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-200 text-sm font-medium rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          
          <button
            onClick={handleForceSync}
            disabled={noFolder || loading || syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-sm shadow-blue-500/20"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {syncing ? 'Syncing...' : 'Sync to Drive'}
          </button>
        </div>
      </header>
      
      {syncing && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-8 py-3 flex items-center gap-3">
           <Loader2 size={16} className="animate-spin text-blue-400" />
           <span className="text-sm font-medium text-blue-400">{syncProgressMsg}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto p-8 relative">

        {/* Selection toolbar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-between">
            <span className="text-sm font-medium text-blue-400">{selectedIds.size} item(s) selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors">
                Clear
              </button>
            </div>
          </div>
        )}

        {/* No folder / no account prompts */}
        {noFolder || noAccount ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {noAccount ? (
              <>
                <div className="w-20 h-20 bg-neutral-800 rounded-2xl flex items-center justify-center mb-6">
                  <CloudOff size={36} className="text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-200 mb-2">Not connected</h3>
                <p className="text-sm text-neutral-500 max-w-xs">Connect your Google account in the <span className="text-blue-400">Accounts</span> tab to enable sync.</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-neutral-800 rounded-2xl flex items-center justify-center mb-6">
                  <HardDrive size={36} className="text-neutral-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-200 mb-2">No folder selected</h3>
                <p className="text-sm text-neutral-500 max-w-xs">
                  Go to <span className="text-blue-400">Settings</span> and select a folder on your PC to sync with Google Drive.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/50">
                  <th className="px-6 py-4 w-12">
                    <input
                      type="checkbox"
                      checked={filteredFiles.length > 0 && selectedIds.size === filteredFiles.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900"
                    />
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Last Modified</th>
                  <th className="px-6 py-4 text-xs font-semibold text-neutral-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-neutral-500">
                        <Loader2 size={32} className="animate-spin text-blue-400" />
                        <p className="text-sm font-medium text-neutral-300">Reading folder...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredFiles.length > 0 ? filteredFiles.map((file) => {
                  const badge = statusBadge[file.status];
                  return (
                    <tr
                      key={file.id}
                      onClick={() => handleRowClick(file)}
                      className="hover:bg-neutral-800/50 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(file.id)}
                          onChange={() => {}}
                          onClick={(e) => handleSelectFile(e, file.id)}
                          className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-neutral-900 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {file.iconLink ? (
                            <img src={file.iconLink} alt={file.type} className="w-5 h-5 object-contain" />
                          ) : file.isDirectory ? (
                            <Folder className="text-blue-400 fill-blue-500/10 shrink-0" size={20} />
                          ) : (
                            <File className="text-neutral-500 shrink-0" size={20} />
                          )}
                          <span className="font-medium text-neutral-200 text-sm truncate max-w-[220px]" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                        {searchQuery && file.path !== file.name && (
                          <div className="text-[11px] text-neutral-500 mt-0.5 ml-8 truncate max-w-[200px]" title={file.path}>
                            {file.path}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badge.cls}`}>
                          {badge.icon} {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-400">{file.size}</td>
                      <td className="px-6 py-4 text-sm text-neutral-400">{file.date}</td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button className="text-neutral-500 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-neutral-500">
                        {searchQuery ? (
                          <>
                            <Search size={32} className="text-neutral-700 mb-1" />
                            <p className="text-sm font-medium text-neutral-300">No matching files</p>
                          </>
                        ) : (
                          <>
                            <FolderOpen size={32} className="text-neutral-700 mb-1" />
                            <p className="text-sm font-medium text-neutral-300">Folder is empty</p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closePreview}>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                {previewFile.iconLink ? <img src={previewFile.iconLink} alt="" className="w-5 h-5" /> : <FileText className="w-5 h-5 text-neutral-400" />}
                File Details
              </h3>
              <button onClick={closePreview} className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 flex flex-col items-center">
              {previewFile.thumbnailLink ? (
                <div className="w-full aspect-video bg-neutral-950 rounded-xl mb-6 overflow-hidden flex items-center justify-center border border-neutral-800">
                  <img src={previewFile.thumbnailLink} alt={previewFile.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-full aspect-video bg-neutral-950 rounded-xl mb-6 flex flex-col items-center justify-center border border-neutral-800 text-neutral-600 gap-3">
                  {previewFile.isDirectory ? <Folder size={48} /> : <ImageIcon size={48} />}
                  <span className="text-sm">No preview available</span>
                </div>
              )}

              <div className="w-full space-y-3">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Name</p>
                  <p className="text-neutral-200 font-medium truncate" title={previewFile.name}>{previewFile.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Type</p>
                    <p className="text-neutral-200 text-sm truncate">{previewFile.isDirectory ? 'Folder' : (previewFile.mimeType || 'File')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Size</p>
                    <p className="text-neutral-200 text-sm">{previewFile.size}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Modified</p>
                    <p className="text-neutral-200 text-sm">{previewFile.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Status</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${statusBadge[previewFile.status].cls}`}>
                      {statusBadge[previewFile.status].icon} {statusBadge[previewFile.status].label}
                    </span>
                  </div>
                </div>
                {previewFile.driveId && (
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Drive ID</p>
                    <p className="text-neutral-400 text-xs font-mono truncate">{previewFile.driveId}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex justify-end gap-2">
              {previewFile.driveId && (
                <a
                  href={`https://drive.google.com/file/d/${previewFile.driveId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <Download size={16} /> Open in Drive
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

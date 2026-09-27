'use client';
import {
  Search, Folder, MoreVertical, UploadCloud, 
  X, Download, CheckCircle, Check, HardDrive,
  RefreshCw, FolderOpen, CloudOff, Loader2,
  LayoutGrid, List, Plus, FolderPlus, ChevronRight, Trash2, Share2, ChevronDown, AlertTriangle, FilePlus, EyeOff, FolderTree,
  Eye, ArrowUpDown, ChevronUp, CheckCircle2
} from 'lucide-react';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchDriveFiles, DriveFile, uploadFileToDrive, deleteDriveFile } from '../lib/drive';
import { CloudProviderType } from '../lib/providers/types';
import { getProvider } from '../lib/providers';
import { initAuth, OAuthUser, isProviderAuthenticated, initiateProviderOAuth } from '../lib/oauth';
import {
  getLocalFolders, getLocalFolderById, getLocalFolderRaw, pickAndInitFolder, commitLocalFolder, readFolderChildren,
  readFolderFiles, LocalFile, SyncFolderEntry, getLocalFolderInfos, SyncFolder, updateLocalFolderProvider,
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
const SyncIgnoreModal = dynamic(() => import('./SyncIgnoreModal').then(mod => mod.SyncIgnoreModal), { ssr: false });
const FolderStructureTree = dynamic(() => import('./FolderStructureTree').then(mod => mod.FolderStructureTree), { ssr: false });

import { removeSyncState, saveSyncStateEntry, getSyncState } from '../lib/syncState';

// ─── Types ─────────────────────────────────────────────────────────────────────

type SyncStatus = 'Synced' | 'Syncing' | 'Local Only' | 'Not Synced';
type ViewMode = 'grid' | 'list' | 'tree';

type FileItem = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  status: SyncStatus;
  size: string;
  sizeBytes: number;
  date: string;
  modifiedTime?: number;
  path: string;
  driveId?: string;
  isDirectory: boolean;
  mimeType?: string;
  thumbnailLink?: string;
  iconLink?: string;
  handle?: any;
  provider?: CloudProviderType;
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
  setShareFiles,
  onPreviewFile,
  onDeleteFile,
}: {
  files: FileItem[],
  selectedIds: Set<string>,
  searchQuery: string,
  statusBadge: Record<SyncStatus, { cls: string; dot: string; icon: React.ReactNode; label: string }>,
  handleRowClick: (file: FileItem) => void,
  handleSelectFile: (e: React.MouseEvent, id: string) => void,
  setShareFiles: (files: FileItem[]) => void,
  onPreviewFile?: (file: FileItem) => void,
  onDeleteFile?: (file: FileItem) => void,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
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
          const isSelected = selectedIds.has(file.id);
          
          return (
            <div
              key={virtualRow.key}
              onClick={() => handleRowClick(file)}
              className={`absolute top-0 left-0 w-full flex items-center border-b border-border/50 hover:bg-secondary/40 transition-colors duration-150 group cursor-pointer select-none ${
                isSelected ? 'bg-primary/10 border-primary/30' : ''
              }`}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* Checkbox */}
              <div className="w-12 px-3 shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <div
                  onClick={(e) => handleSelectFile(e, file.id)}
                  className={`w-4 h-4 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground shadow-xs'
                      : 'border-border/80 bg-secondary/40 text-transparent hover:border-primary/60 hover:bg-secondary/80'
                  }`}
                >
                  <Check size={11} strokeWidth={3} className={`transition-opacity duration-150 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                </div>
              </div>

              {/* Name & Type Icon */}
              <div className="flex-1 min-w-[200px] px-3 flex items-center gap-3 overflow-hidden">
                <div className={`p-2 rounded-xl ${typeInfo.bg} ${typeInfo.borderColor} border shrink-0`}>
                  <TypeIcon size={16} className={typeInfo.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground text-sm truncate block group-hover:text-primary transition-colors" title={file.name}>
                    {file.name}
                  </span>
                  {searchQuery && file.path !== file.name && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={file.path}>
                      {file.path}
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className="w-32 px-3 shrink-0">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${badge.cls}`}>
                  <span className={`size-1.5 rounded-full ${badge.dot}`} />
                  <span>{badge.label}</span>
                </span>
              </div>

              {/* Size */}
              <div className="w-28 px-3 shrink-0 font-mono text-xs text-muted-foreground hidden sm:block truncate">
                {file.size}
              </div>

              {/* Modified Date */}
              <div className="w-36 px-3 shrink-0 text-xs text-muted-foreground hidden md:block whitespace-nowrap">
                {file.date}
              </div>

              {/* Actions on hover */}
              <div className="w-28 px-4 shrink-0 flex items-center justify-end gap-1 text-right" onClick={(e) => e.stopPropagation()}>
                {!file.isDirectory && (
                  <button
                    type="button"
                    onClick={() => onPreviewFile?.(file)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Preview File"
                  >
                    <Eye size={15} />
                  </button>
                )}
                {!file.isDirectory && file.driveId && (
                  <button
                    type="button"
                    onClick={() => setShareFiles([file])}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Share File"
                  >
                    <Share2 size={15} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteFile?.(file)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Delete File"
                >
                  <Trash2 size={15} />
                </button>
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

  const { isSyncing: syncing, syncProgressMsg, startSync, cancelSync } = useSync();

  // Multi-folder state
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);

  // Tree View State
  const [treeFiles, setTreeFiles] = useState<LocalFile[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);

  const loadTreeFiles = useCallback(async () => {
    if (!activeFolderId) {
      setTreeFiles([]);
      return;
    }
    setLoadingTree(true);
    try {
      const entry = await getLocalFolderById(activeFolderId);
      if (entry) {
        const list = await readFolderFiles(entry.handle);
        setTreeFiles(list);
      }
    } catch (err) {
      console.error('Failed to load tree files:', err);
    } finally {
      setLoadingTree(false);
    }
  }, [activeFolderId]);

  useEffect(() => {
    if (viewMode === 'tree') {
      loadTreeFiles();
    }
  }, [viewMode, activeFolderId, loadTreeFiles]);

  // File Deletion State
  const [filesToDelete, setFilesToDelete] = useState<FileItem[] | null>(null);
  const [deletingFiles, setDeletingFiles] = useState(false);
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

  const [selectedCloudProvider, setSelectedCloudProvider] = useState<CloudProviderType>('google');
  const [providerPermissionError, setProviderPermissionError] = useState<string | null>(null);
  const [folderPermissionPrompt, setFolderPermissionPrompt] = useState<boolean>(false);

  /** Load files for the selected Cloud Provider */
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setProviderPermissionError(null);
    try {
      const isAuth = isProviderAuthenticated(selectedCloudProvider);
      if (!isAuth) {
        setFiles([]);
        setLoading(false);
        return;
      }

      if (selectedCloudProvider === 'google') {
        const syncState = await getSyncState();

        // 1. If local folder is selected, cross-reference local files
        if (activeFolderId) {
          try {
            const entry = await getLocalFolderById(activeFolderId);
            if (entry) {
              setFolderPermissionPrompt(false);
              let targetHandle = entry.handle;
              const prefix = currentPath;
              if (currentPath !== '') {
                const parts = currentPath.split('/');
                for (const p of parts) {
                  targetHandle = await targetHandle.getDirectoryHandle(p);
                }
              }

              const allLocalFiles = await readFolderChildren(targetHandle, prefix, entry.handle);

              const activeFolder = folders.find(f => f.id === activeFolderId);
              const folderProvider = activeFolder?.provider;

              // If the active folder is explicitly configured for another cloud provider (e.g. 'dropbox'),
              // do NOT show its local files in Google Drive!
              if (folderProvider && folderProvider !== 'google') {
                setFiles([]);
                setLoading(false);
                return;
              }

              // ONLY show files that belong to Google Drive
              const googleLocalFiles = allLocalFiles.filter(lf => {
                const item = syncState[lf.path];
                if (item?.provider) {
                  return item.provider === 'google';
                }
                return !folderProvider || folderProvider === 'google';
              });

              // Check which local files have been uploaded to Drive
              let driveFiles: DriveFile[] = [];
              try {
                driveFiles = await fetchDriveFiles();
              } catch {}
              const driveByName = new Map<string, DriveFile>();
              driveFiles.forEach((f) => driveByName.set(f.name.toLowerCase(), f));

              const merged: FileItem[] = googleLocalFiles.map((lf): FileItem => {
                const match = driveByName.get(lf.name.toLowerCase());
                return {
                  id: lf.id,
                  name: lf.name,
                  type: lf.isDirectory ? 'folder' : 'file',
                  isDirectory: lf.isDirectory,
                  status: match ? 'Synced' : 'Local Only',
                  size: lf.isDirectory ? '--' : formatBytes(lf.size),
                  sizeBytes: lf.size,
                  path: lf.path,
                  date: formatDate(lf.lastModified),
                  modifiedTime: lf.lastModified,
                  mimeType: lf.mimeType,
                  handle: lf.handle,
                  driveId: match?.id,
                  thumbnailLink: match?.thumbnailLink,
                  iconLink: match?.iconLink,
                  provider: 'google',
                };
              });

              setFiles(merged);
              setLoading(false);
              return;
            } else {
              setFolderPermissionPrompt(true);
            }
          } catch (localErr) {
            console.warn('Could not read local folder for Drive:', localErr);
          }
        }

        // 2. If no local folder handle or permission prompt needed:
        // ONLY show files that were explicitly selected/uploaded in CloudSync
        const userUploadedEntries = Object.entries(syncState).filter(([, item]) => {
          return !item.provider || item.provider === 'google';
        });

        if (userUploadedEntries.length > 0) {
          let driveFiles: DriveFile[] = [];
          try {
            driveFiles = await fetchDriveFiles();
          } catch {}
          const driveById = new Map<string, DriveFile>();
          const driveByName = new Map<string, DriveFile>();
          driveFiles.forEach((f) => {
            driveById.set(f.id, f);
            driveByName.set(f.name.toLowerCase(), f);
          });

          const uploadedItems: FileItem[] = userUploadedEntries
            .filter(([path]) => {
              if (!currentPath) {
                return !path.includes('/');
              }
              return path.startsWith(currentPath + '/') && !path.substring(currentPath.length + 1).includes('/');
            })
            .map(([path, item]): FileItem => {
              const fileName = path.split('/').pop() || path;
              const driveFile = (item.driveId ? driveById.get(item.driveId) : null) || driveByName.get(fileName.toLowerCase());
              return {
                id: driveFile?.id || item.driveId || path,
                name: fileName,
                type: 'file',
                isDirectory: false,
                status: driveFile ? 'Synced' : 'Not Synced',
                size: driveFile?.size ? formatBytes(parseInt(driveFile.size, 10)) : formatBytes(item.size),
                sizeBytes: driveFile?.size ? parseInt(driveFile.size, 10) : item.size,
                path: path,
                date: formatDate(driveFile ? new Date(driveFile.modifiedTime).getTime() : item.lastModified),
                modifiedTime: driveFile ? new Date(driveFile.modifiedTime).getTime() : item.lastModified,
                mimeType: driveFile?.mimeType,
                thumbnailLink: driveFile?.thumbnailLink,
                iconLink: driveFile?.iconLink,
                driveId: driveFile?.id || item.driveId,
                provider: 'google',
              };
            });

          setFiles(uploadedItems);
          setLoading(false);
          return;
        }

        // 3. No files selected or uploaded by user for Google Drive: return empty list
        setFiles([]);
        setLoading(false);
        return;
      } else {
        // Dropbox or OneDrive
        const activeFolder = activeFolderId ? folders.find(f => f.id === activeFolderId) : null;
        const folderProvider = activeFolder?.provider;

        // If the active folder is explicitly configured for another cloud provider, do NOT show files here
        if (activeFolder && folderProvider && folderProvider !== selectedCloudProvider) {
          setFiles([]);
          setLoading(false);
          return;
        }

        const provider = getProvider(selectedCloudProvider);

        if (activeFolder) {
          // 1. Reading user's active folder for this provider
          let targetHandle: any = null;
          let allLocalFiles: LocalFile[] = [];
          try {
            const entry = await getLocalFolderById(activeFolder.id);
            if (entry) {
              setFolderPermissionPrompt(false);
              targetHandle = entry.handle;
              const prefix = currentPath;
              if (currentPath !== '') {
                const parts = currentPath.split('/');
                for (const p of parts) {
                  targetHandle = await targetHandle.getDirectoryHandle(p);
                }
              }
              allLocalFiles = await readFolderChildren(targetHandle, prefix, entry.handle);
            }
          } catch (localErr) {
            console.warn(`Could not read local folder for ${selectedCloudProvider}:`, localErr);
          }

          // Query remote files inside this specific folder
          const folderTarget = selectedCloudProvider === 'dropbox'
            ? (currentPath ? `/${activeFolder.name}/${currentPath}` : `/${activeFolder.name}`)
            : (currentPath ? `${activeFolder.name}/${currentPath}` : activeFolder.name);

          let remoteItems: FileItem[] = [];
          try {
            const res = await provider.listFiles({
              folderIdOrPath: folderTarget,
              recursive: false,
            });
            remoteItems = res.items.map((item): FileItem => ({
              id: item.id,
              name: item.name,
              type: item.isDirectory ? 'folder' : 'file',
              isDirectory: item.isDirectory,
              status: 'Synced',
              size: item.isDirectory ? '--' : formatBytes(item.size),
              sizeBytes: item.size,
              path: item.path.startsWith('/') ? item.path.substring(1) : item.path,
              date: formatDate(item.modifiedTime),
              modifiedTime: item.modifiedTime,
              mimeType: item.mimeType,
              thumbnailLink: item.thumbnailUrl,
              driveId: item.id,
              provider: selectedCloudProvider,
            }));
          } catch (providerErr: any) {
            if (
              providerErr?.status === 401 ||
              providerErr?.message?.includes('401') ||
              providerErr?.message?.includes('reconnect') ||
              providerErr?.message?.includes('Not authenticated') ||
              providerErr?.message?.includes('session expired')
            ) {
              console.warn(`[${selectedCloudProvider}] Session unauthenticated or expired.`, providerErr);
            } else if (
              providerErr?.status === 403 ||
              providerErr?.message?.includes('permissions missing') ||
              providerErr?.message?.includes('not permitted') ||
              providerErr?.message?.includes('required scope')
            ) {
              console.warn(`[${selectedCloudProvider}] Missing permissions or scope:`, providerErr);
              setProviderPermissionError(providerErr.message);
            }
            // If remote folder doesn't exist yet on remote drive (404/not_found), remoteItems stays []
          }

          const syncState = await getSyncState();
          const remoteByName = new Map(remoteItems.map(i => [i.name.toLowerCase(), i]));

          const localItems: FileItem[] = allLocalFiles.map((lf): FileItem => {
            const match = remoteByName.get(lf.name.toLowerCase());
            return {
              id: lf.id,
              name: lf.name,
              type: lf.isDirectory ? 'folder' : 'file',
              isDirectory: lf.isDirectory,
              status: match ? 'Synced' : 'Local Only',
              size: lf.isDirectory ? '--' : formatBytes(lf.size),
              sizeBytes: lf.size,
              path: lf.path,
              date: formatDate(lf.lastModified),
              modifiedTime: lf.lastModified,
              mimeType: lf.mimeType,
              handle: lf.handle,
              driveId: match?.id,
              thumbnailLink: match?.thumbnailLink,
              provider: selectedCloudProvider,
            };
          });

          // Include remote-only items inside this specific folder
          const localNames = new Set(allLocalFiles.map(lf => lf.name.toLowerCase()));
          const remoteOnly = remoteItems.filter(ri => !localNames.has(ri.name.toLowerCase()));

          setFiles([...localItems, ...remoteOnly]);
          setLoading(false);
          return;
        }

        // 2. If NO local folder is selected: ONLY show files explicitly uploaded/tracked by user for this provider
        const syncState = await getSyncState();
        const userUploadedEntries = Object.entries(syncState).filter(([, item]) => {
          return item.provider === selectedCloudProvider;
        });

        if (userUploadedEntries.length > 0) {
          const uploadedItems: FileItem[] = userUploadedEntries
            .filter(([path]) => {
              if (!currentPath) {
                return !path.includes('/');
              }
              return path.startsWith(currentPath + '/') && !path.substring(currentPath.length + 1).includes('/');
            })
            .map(([path, item]): FileItem => {
              const fileName = path.split('/').pop() || path;
              return {
                id: item.remoteId || path,
                name: fileName,
                type: 'file',
                isDirectory: false,
                status: 'Synced',
                size: formatBytes(item.size),
                sizeBytes: item.size,
                path: path,
                date: formatDate(item.lastModified),
                modifiedTime: item.lastModified,
                driveId: item.remoteId,
                provider: selectedCloudProvider,
              };
            });

          setFiles(uploadedItems);
          setLoading(false);
          return;
        }

        // 3. No folder selected and no files uploaded for this provider
        setFiles([]);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      console.error(`Error loading ${selectedCloudProvider} files:`, err);
      showToast(`Failed to load ${selectedCloudProvider} files: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, currentPath, selectedCloudProvider, showToast]);

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

  const handleAddFolder = useCallback(async () => {
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

  const handleForceSync = useCallback(async () => {
    if (!isProviderAuthenticated(selectedCloudProvider)) {
      showToast(`Connect your ${selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} account first.`, 'error');
      return;
    }
    if (!activeFolderId) {
      showToast('Select a folder first.', 'error');
      return;
    }
    
    await startSync(activeFolderId, selectedCloudProvider);
  }, [activeFolderId, selectedCloudProvider, startSync, showToast]);
  handleForceSyncRef.current = handleForceSync;

  const handleAddFiles = useCallback(async () => {
    if (!isProviderAuthenticated(selectedCloudProvider)) {
      showToast(`Connect your ${selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} account first.`, 'error');
      return;
    }
    try {
      const handles = await (window as any).showOpenFilePicker({ multiple: true });
      if (!handles || handles.length === 0) return;
      
      setAddingFiles(true);
      let targetHandle: any = null;
      if (activeFolderId) {
        try {
          const entry = await getLocalFolderById(activeFolderId);
          if (entry) {
            targetHandle = entry.handle;
            if (currentPath !== '') {
              const parts = currentPath.split('/');
              for (const p of parts) {
                targetHandle = await targetHandle.getDirectoryHandle(p);
              }
            }
          }
        } catch {}
      }

      const provider = getProvider(selectedCloudProvider);
      const folderTarget = selectedCloudProvider === 'dropbox'
        ? (currentPath.startsWith('/') ? currentPath : (currentPath ? `/${currentPath}` : ''))
        : (currentPath || 'root');

      let uploadedCount = 0;
      for (const handle of handles) {
        const file = await handle.getFile();
        const uploaded = await provider.uploadFile(file, folderTarget, file.name);

        const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        await saveSyncStateEntry(fullPath, {
          lastModified: file.lastModified,
          size: file.size,
          remoteId: uploaded.id,
          remoteHash: uploaded.contentHash,
          provider: selectedCloudProvider,
        });

        if (targetHandle) {
          try {
            const newFileHandle = await targetHandle.getFileHandle(file.name, { create: true });
            const writable = await (newFileHandle as any).createWritable();
            await writable.write(file);
            await writable.close();
          } catch {}
        }
        uploadedCount++;
      }
      
      if (uploadedCount > 0) {
        showToast(`Uploaded ${uploadedCount} file(s) to ${provider.name} successfully!`, "success");
        loadFiles();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to add files', 'error');
      }
    } finally {
      setAddingFiles(false);
      setIsFabMenuOpen(false);
    }
  }, [activeFolderId, currentPath, loadFiles, selectedCloudProvider, showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

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
    
    if (!isProviderAuthenticated(selectedCloudProvider)) {
      showToast(`Connect your ${selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} account first.`, 'error');
      return;
    }

    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    try {
      let targetHandle: any = null;
      if (activeFolderId) {
        try {
          const entry = await getLocalFolderById(activeFolderId);
          if (entry) {
            targetHandle = entry.handle;
            if (currentPath !== '') {
              const parts = currentPath.split('/');
              for (const p of parts) {
                targetHandle = await targetHandle.getDirectoryHandle(p);
              }
            }
          }
        } catch {}
      }

      const provider = getProvider(selectedCloudProvider);
      const folderTarget = selectedCloudProvider === 'dropbox'
        ? (currentPath.startsWith('/') ? currentPath : (currentPath ? `/${currentPath}` : ''))
        : (currentPath || 'root');

      let uploadedCount = 0;

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
            const uploaded = await provider.uploadFile(file, folderTarget, file.name);

            const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            await saveSyncStateEntry(fullPath, {
              lastModified: file.lastModified,
              size: file.size,
              remoteId: uploaded.id,
              remoteHash: uploaded.contentHash,
              provider: selectedCloudProvider,
            });

            if (targetHandle) {
              try {
                const newFileHandle = await targetHandle.getFileHandle(file.name, { create: true });
                const writable = await (newFileHandle as any).createWritable();
                await writable.write(file);
                await writable.close();
              } catch {}
            }
            uploadedCount++;
          }
        }
      }

      if (uploadedCount > 0) {
        showToast(`Uploaded ${uploadedCount} file(s) to ${provider.name} successfully!`, "success");
        loadFiles();
      }
    } catch (err: any) {
      console.error('Drop error:', err);
      showToast(err.message || 'Failed to save dropped files', 'error');
    }
  }, [activeFolderId, currentPath, loadFiles, selectedCloudProvider, showToast]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (q) {
      return files.filter((f) => f.name.toLowerCase().includes(q) || f.date.toLowerCase().includes(q));
    }
    // readFolderChildren already returns only the current directory's children
    return files;
  }, [files, searchQuery]);

  // Column Sorting State
  type SortField = 'name' | 'status' | 'size' | 'modified';
  type SortOrder = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField]);

  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      // Folders always appear first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'size') {
        cmp = (a.sizeBytes || 0) - (b.sizeBytes || 0);
      } else if (sortField === 'modified') {
        const timeA = a.modifiedTime ?? (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.modifiedTime ?? (b.date ? new Date(b.date).getTime() : 0);
        cmp = timeA - timeB;
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredFiles, sortField, sortOrder]);

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
          if (selectedCloudProvider === 'google') {
            await deleteDriveFile(file.driveId);
          } else {
            const provider = getProvider(selectedCloudProvider);
            await provider.deleteFile(file.driveId);
          }
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
  }, [filesToDelete, selectedCloudProvider, showToast]);

  // ── Status badge config ─────────────────────────────────────────────────────
  const statusBadge: Record<SyncStatus, { cls: string; dot: string; icon: React.ReactNode; label: string }> = {
    Synced:      { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400', icon: <CheckCircle2 size={12} />, label: 'Synced' },
    Syncing:     { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',         dot: 'bg-blue-400 animate-pulse', icon: <UploadCloud size={12} className="animate-pulse" />, label: 'Syncing' },
    'Local Only':{ cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       dot: 'bg-amber-400', icon: <HardDrive size={12} />, label: 'Local Only' },
    'Not Synced':{ cls: 'bg-secondary/70 text-muted-foreground border-border/80',   dot: 'bg-muted-foreground', icon: <CloudOff size={12} />, label: 'Not Synced' },
  };

  const noFolders = folders.length === 0 && files.length === 0;
  const noAccount = !isProviderAuthenticated(selectedCloudProvider);

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
              <p className="text-neutral-400 text-sm">
                Files will be synced to {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'Microsoft OneDrive'}
              </p>
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
          <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
            {/* Cloud Provider Selector */}
            <div className="flex items-center bg-secondary/80 border border-border/80 rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedCloudProvider('google');
                  setCurrentPath('');
                  setSelectedIds(new Set());
                  setProviderPermissionError(null);
                  const match = folders.find(f => (f.provider || 'google') === 'google');
                  setActiveFolderId(match ? match.id : null);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                  selectedCloudProvider === 'google'
                    ? 'bg-background font-semibold text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Drive
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCloudProvider('dropbox');
                  setCurrentPath('');
                  setSelectedIds(new Set());
                  setProviderPermissionError(null);
                  const match = folders.find(f => f.provider === 'dropbox');
                  setActiveFolderId(match ? match.id : null);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                  selectedCloudProvider === 'dropbox'
                    ? 'bg-background font-semibold text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Dropbox
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCloudProvider('onedrive');
                  setCurrentPath('');
                  setSelectedIds(new Set());
                  setProviderPermissionError(null);
                  const match = folders.find(f => f.provider === 'onedrive');
                  setActiveFolderId(match ? match.id : null);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                  selectedCloudProvider === 'onedrive'
                    ? 'bg-background font-semibold text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                OneDrive
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-10 py-1.5 text-xs sm:text-sm bg-secondary/80 border border-border/80 text-foreground rounded-xl focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all w-28 sm:w-48 placeholder:text-muted-foreground"
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
                  className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="List view"
                >
                  <List size={15} />
                </button>
                <button
                  onClick={() => setViewMode('tree')}
                  className={`p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                    viewMode === 'tree' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="Tree view"
                  title="Folder Structure Tree"
                >
                  <FolderTree size={15} />
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
          {(() => {
            const isMatch = (f: SyncFolder) => {
              if (selectedCloudProvider === 'google') return !f.provider || f.provider === 'google';
              return f.provider === selectedCloudProvider;
            };
            const providerFolders = folders.filter(isMatch);
            const currentActiveMatches = activeFolder && isMatch(activeFolder);

            return (
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
                  className="flex items-center justify-between min-w-[170px] max-w-[240px] gap-2 px-3 py-1.5 bg-secondary/80 border border-border/80 hover:border-primary/50 rounded-xl transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Folder size={15} className="text-primary shrink-0" />
                    <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {currentActiveMatches ? activeFolder?.name : (providerFolders[0]?.name || 'Select Folder')}
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
                        className="absolute left-0 top-full mt-1.5 w-60 max-w-[calc(100vw-2rem)] bento-block !p-1.5 shadow-2xl z-50 overflow-hidden"
                      >
                        <div className="max-h-60 overflow-y-auto p-1 hide-scrollbar space-y-1">
                          {providerFolders.length === 0 ? (
                            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                              No {selectedCloudProvider === 'dropbox' ? 'Dropbox' : selectedCloudProvider === 'onedrive' ? 'OneDrive' : 'Google Drive'} folders linked
                            </div>
                          ) : (
                            providerFolders.map(folder => (
                              <button
                                key={folder.id}
                                onClick={() => {
                                  setActiveFolderId(folder.id);
                                  setIsFolderDropdownOpen(false);
                                }}
                                className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer ${
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
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}
          
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
                    className="absolute left-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] bento-block !p-1.5 shadow-2xl z-50 overflow-hidden"
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

        {/* Local Folder Permission Request Banner */}
        {folderPermissionPrompt && activeFolder && (
          <div className="mb-4 p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 text-blue-400">
              <FolderOpen size={18} className="shrink-0" />
              <span>Permission required to read local folder <strong>{activeFolder.name}</strong></span>
            </div>
            <button
              onClick={async () => {
                const rawEntry = await getLocalFolderRaw(activeFolderId!);
                if (rawEntry?.handle) {
                  try {
                    const perm = await (rawEntry.handle as any).requestPermission({ mode: 'readwrite' });
                    if (perm === 'granted') {
                      setFolderPermissionPrompt(false);
                      loadFiles();
                    }
                  } catch (err: any) {
                    showToast(err.message || 'Permission denied', 'error');
                  }
                }
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs"
            >
              Grant Access
            </button>
          </div>
        )}

        {/* No folder / no account / permission error prompts */}
        {providerPermissionError ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center animate-fadeInUp max-w-md mx-auto">
            <div className="bento-block p-8 flex flex-col items-center text-center w-full border border-amber-500/30 bg-amber-500/5">
              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-5 border border-amber-500/20">
                <AlertTriangle size={32} className="text-amber-400" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
                {selectedCloudProvider === 'dropbox' ? 'Dropbox' : selectedCloudProvider === 'onedrive' ? 'OneDrive' : 'Cloud'} Permissions Required
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-5">
                {providerPermissionError}
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {selectedCloudProvider === 'dropbox' && (
                  <a
                    href="https://www.dropbox.com/developers/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-xs sm:text-sm font-semibold rounded-xl transition-colors border border-border cursor-pointer"
                  >
                    Open Dropbox App Console
                  </a>
                )}
                <button
                  onClick={() => {
                    setProviderPermissionError(null);
                    initiateProviderOAuth(selectedCloudProvider);
                  }}
                  className="flex items-center gap-2 px-5 py-2 bg-primary hover:opacity-90 text-primary-foreground text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  Reconnect {selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'Account'}
                </button>
              </div>
            </div>
          </div>
        ) : noFolders || noAccount ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center animate-fadeInUp max-w-md mx-auto">
            {noAccount ? (
              <div className="bento-block p-8 flex flex-col items-center text-center w-full">
                <div className="w-16 h-16 bg-secondary/80 rounded-2xl flex items-center justify-center mb-5 border border-border">
                  <CloudOff size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-2">
                  {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} Not Connected
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-5">
                  Connect your {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} account to browse and sync files.
                </p>
                <button
                  onClick={() => initiateProviderOAuth(selectedCloudProvider)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:opacity-90 active:scale-[0.98] text-primary-foreground text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-md shadow-primary/20 cursor-pointer"
                >
                  <UploadCloud size={16} />
                  Connect {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'}
                </button>
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
            <div className="flex items-center justify-between mb-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {fileCounts.total} {fileCounts.total === 1 ? 'item' : 'items'}
                </span>
                {fileCounts.folderCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{fileCounts.folderCount} folder{fileCounts.folderCount !== 1 ? 's' : ''}</span>
                  </>
                )}
                {fileCounts.fileCount > 0 && (
                  <>
                    <span>·</span>
                    <span>{fileCounts.fileCount} file{fileCounts.fileCount !== 1 ? 's' : ''}</span>
                  </>
                )}
              </div>
              {selectedIds.size > 0 && (
                <span className="text-primary font-medium">
                  {selectedIds.size} of {filteredFiles.length} selected
                </span>
              )}
            </div>

            {/* Loading state */}
            {loading || (viewMode === 'tree' && loadingTree) ? (
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
            ) : viewMode === 'tree' ? (
              <motion.div
                key="tree"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full"
              >
                <FolderStructureTree
                  files={treeFiles}
                  folderName={activeFolder?.name || 'Local Folder'}
                  searchQuery={searchQuery}
                  onSelectFile={(f) => {
                    const item = files.find(file => file.path === f.path) || {
                      id: f.id,
                      name: f.name,
                      type: f.isDirectory ? 'folder' : 'file',
                      status: 'Local Only',
                      size: formatBytes(f.size),
                      sizeBytes: f.size,
                      date: new Date(f.lastModified).toLocaleDateString(),
                      modifiedTime: f.lastModified,
                      path: f.path,
                      isDirectory: f.isDirectory,
                      handle: f.handle
                    };
                    handleRowClick(item as FileItem);
                  }}
                  onPreviewFile={(f) => {
                    const item = files.find(file => file.path === f.path) || {
                      id: f.id,
                      name: f.name,
                      type: f.isDirectory ? 'folder' : 'file',
                      status: 'Local Only',
                      size: formatBytes(f.size),
                      sizeBytes: f.size,
                      date: new Date(f.lastModified).toLocaleDateString(),
                      modifiedTime: f.lastModified,
                      path: f.path,
                      isDirectory: f.isDirectory,
                      handle: f.handle
                    };
                    setPreviewFile(item as FileItem);
                  }}
                  className="min-h-[500px]"
                />
              </motion.div>
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
                  className="bento-block !p-0 overflow-hidden shadow-xs border border-border/80"
                >
                  <div className="overflow-x-auto">
                    <div className="min-w-[720px]">
                      {/* Header row */}
                      <div className="flex items-center border-b border-border/70 bg-secondary/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
                        <div className="w-12 px-3 shrink-0 flex items-center justify-center py-3">
                          <div
                            onClick={handleSelectAll}
                            className={`w-4 h-4 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
                              filteredFiles.length > 0 && selectedIds.size === filteredFiles.length
                                ? 'bg-primary border-primary text-primary-foreground shadow-xs'
                                : 'border-border/80 bg-secondary/50 text-transparent hover:border-primary/60'
                            }`}
                            title="Select all"
                          >
                            <Check size={11} strokeWidth={3} className={`transition-opacity duration-150 ${filteredFiles.length > 0 && selectedIds.size === filteredFiles.length ? 'opacity-100' : 'opacity-0'}`} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-[200px] px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                          >
                            <span>Name</span>
                            {sortField === 'name' ? (
                              sortOrder === 'asc' ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} className="text-primary" />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40" />
                            )}
                          </button>
                        </div>
                        <div className="w-32 px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleSort('status')}
                            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                          >
                            <span>Status</span>
                            {sortField === 'status' ? (
                              sortOrder === 'asc' ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} className="text-primary" />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40" />
                            )}
                          </button>
                        </div>
                        <div className="w-28 px-3 py-3 hidden sm:block">
                          <button
                            type="button"
                            onClick={() => toggleSort('size')}
                            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                          >
                            <span>Size</span>
                            {sortField === 'size' ? (
                              sortOrder === 'asc' ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} className="text-primary" />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40" />
                            )}
                          </button>
                        </div>
                        <div className="w-36 px-3 py-3 hidden md:block">
                          <button
                            type="button"
                            onClick={() => toggleSort('modified')}
                            className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
                          >
                            <span>Modified</span>
                            {sortField === 'modified' ? (
                              sortOrder === 'asc' ? <ChevronUp size={13} className="text-primary" /> : <ChevronDown size={13} className="text-primary" />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-40" />
                            )}
                          </button>
                        </div>
                        <div className="w-28 px-4 py-3 text-right">
                          Actions
                        </div>
                      </div>

                      {/* Virtualized rows */}
                      <VirtualizedListBody
                        files={sortedFiles}
                        selectedIds={selectedIds}
                        searchQuery={searchQuery}
                        statusBadge={statusBadge}
                        handleRowClick={handleRowClick}
                        handleSelectFile={handleSelectFile}
                        setShareFiles={setShareFiles}
                        onPreviewFile={(f) => setPreviewFile(f)}
                        onDeleteFile={(f) => setFilesToDelete([f])}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              </AnimatePresence>
            ) : (
              /* Empty state */
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                {!isProviderAuthenticated(selectedCloudProvider) ? (
                  <div className="bento-block p-8 flex flex-col items-center text-center max-w-sm mx-auto w-full">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-3 text-primary">
                      <UploadCloud size={24} />
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} is not connected
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 mb-5 leading-relaxed">
                      Connect your {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} account to view, upload, and sync files separately without mixing with other drives.
                    </p>
                    <button
                      onClick={() => initiateProviderOAuth(selectedCloudProvider)}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-xl transition-all shadow-sm shadow-primary/20 cursor-pointer"
                    >
                      <UploadCloud size={14} /> Connect {selectedCloudProvider === 'google' ? 'Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'}
                    </button>
                  </div>
                ) : searchQuery ? (
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
                    <p className="text-sm font-bold text-foreground">
                      {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} is empty
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
                      Upload files to {selectedCloudProvider === 'google' ? 'Google Drive' : selectedCloudProvider === 'dropbox' ? 'Dropbox' : 'OneDrive'} to get started
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={handleAddFiles} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground bg-primary hover:opacity-90 rounded-xl transition-all shadow-sm shadow-primary/20 cursor-pointer"><UploadCloud size={14} /> Upload</button>
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
                   const entry = await commitLocalFolder(pendingFolderHandle, selectedCloudProvider);
                   const infos = await getLocalFolderInfos();
                   setFolders(infos);
                   setActiveFolderId(entry.id);
                   const providerLabel = selectedCloudProvider === 'dropbox' ? 'Dropbox' : selectedCloudProvider === 'onedrive' ? 'OneDrive' : 'Google Drive';
                   showToast(`Added folder "${entry.info.name}" linked to ${providerLabel}`, 'success');
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

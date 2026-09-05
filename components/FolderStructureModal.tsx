'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  X,
  Loader2,
  Maximize2,
  Minimize2,
  HardDrive,
  FileText,
  Search,
  ExternalLink
} from 'lucide-react';
import { getLocalFolderById, readFolderFiles, LocalFile } from '../lib/localFolder';
import { getSyncState } from '../lib/syncState';
import { FolderStructureTree } from './FolderStructureTree';
import dynamic from 'next/dynamic';

const FilePreviewModal = dynamic(() => import('./FilePreviewModal').then(mod => mod.FilePreviewModal), { ssr: false });

interface FolderStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  folderName: string;
  onNavigateToFiles?: (folderId: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function FolderStructureModal({
  isOpen,
  onClose,
  folderId,
  folderName,
  onNavigateToFiles
}: FolderStructureModalProps) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [syncStatesMap, setSyncStatesMap] = useState<Map<string, any>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewFile, setPreviewFile] = useState<LocalFile | null>(null);

  useEffect(() => {
    if (!isOpen || !folderId) {
      setFiles([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    async function loadTreeData() {
      try {
        const entry = await getLocalFolderById(folderId!);
        if (!entry) return;

        // Recursively read all files up to max depth
        const treeFiles = await readFolderFiles(entry.handle);
        if (!isMounted) return;
        setFiles(treeFiles);

        // Load sync states
        const syncState = await getSyncState();
        if (syncState && isMounted) {
          const map = new Map<string, any>();
          for (const [path, item] of Object.entries(syncState)) {
            map.set(path, {
              status: (item as any).status || 'Synced',
              isSynced: (item as any).status === 'Synced' || !!(item as any).driveId
            });
          }
          setSyncStatesMap(map);
        }
      } catch (err) {
        console.error('Failed to load folder structure for modal:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTreeData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, folderId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 w-full ${
          isFullscreen
            ? 'h-[96vh] max-w-[96vw]'
            : 'h-[85vh] max-h-[750px] max-w-4xl'
        }`}
      >
        {/* ── Modal Header ── */}
        <div className="p-4 sm:p-5 border-b border-border/80 bg-secondary/30 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
              <FolderTree size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground text-base truncate">{folderName}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  Directory Tree
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Interactive folder hierarchy and live sync status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {onNavigateToFiles && folderId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToFiles(folderId);
                }}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors cursor-pointer"
                title="Open in Files Tab"
              >
                <ExternalLink size={13} />
                <span>Open in Files</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors cursor-pointer"
              title={isFullscreen ? 'Collapse' : 'Expand'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Search & Filter Bar ── */}
        <div className="px-4 py-2.5 border-b border-border/60 bg-secondary/15 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files and subdirectories in tree..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary/40 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* ── Main Content Area ── */}
        <div className="flex-1 overflow-hidden p-3 sm:p-4 bg-background/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 size={32} className="animate-spin text-primary" />
              <span className="text-sm font-medium">Scanning directory structure...</span>
            </div>
          ) : (
            <FolderStructureTree
              files={files}
              folderName={folderName}
              searchQuery={searchQuery}
              syncStates={syncStatesMap}
              onPreviewFile={(file) => setPreviewFile(file)}
              className="h-full border-none shadow-none"
            />
          )}
        </div>
      </div>

      {/* Embedded File Preview if clicked */}
      {previewFile && (
        <FilePreviewModal
          file={{
            id: previewFile.id,
            name: previewFile.name,
            path: previewFile.path,
            size: formatBytes(previewFile.size),
            sizeBytes: previewFile.size,
            date: new Date(previewFile.lastModified).toLocaleDateString(),
            status: 'Local Only',
            mimeType: previewFile.mimeType,
            isDirectory: previewFile.isDirectory,
            handle: previewFile.handle
          }}
          onClose={() => setPreviewFile(null)}
          statusBadge={{
            'Synced': { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <HardDrive size={14} />, label: 'Synced' },
            'Local Only': { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <HardDrive size={14} />, label: 'Local Only' },
            'Modified': { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <HardDrive size={14} />, label: 'Modified' },
            'Syncing': { cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: <Loader2 size={14} className="animate-spin" />, label: 'Syncing' },
          }}
        />
      )}
    </div>
  );
}

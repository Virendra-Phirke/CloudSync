'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  FileAudio,
  FileVideo,
  File as GenericFileIcon,
  Eye,
  ChevronsUpDown,
  ChevronsDownUp,
  Search,
  FolderTree as FolderTreeIcon,
  HardDrive
} from 'lucide-react';
import { LocalFile } from '../lib/localFolder';
import {
  Files,
  FolderItem,
  FolderTrigger,
  FolderPanel,
  FileItem
} from './animate-ui/components/base/files';

export interface TreeNode {
  id: string; // relative path
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  mimeType: string;
  file?: LocalFile;
  children: TreeNode[];
}

export interface FolderStructureTreeProps {
  files: LocalFile[];
  folderName?: string;
  onSelectFile?: (file: LocalFile) => void;
  onPreviewFile?: (file: LocalFile) => void;
  syncStates?: Map<string, { status: string; isSynced?: boolean; isLocalOnly?: boolean; isModified?: boolean }>;
  searchQuery?: string;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(filename: string): React.ElementType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'rs', 'go', 'c', 'cpp', 'cs', 'php', 'sql', 'sh', 'yaml', 'yml'].includes(ext)) {
    return FileCode;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif'].includes(ext)) {
    return FileImage;
  }
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'rtf'].includes(ext)) {
    return FileText;
  }
  if (['csv', 'xls', 'xlsx'].includes(ext)) {
    return FileSpreadsheet;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return FileArchive;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
    return FileAudio;
  }
  if (['mp4', 'mkv', 'mov', 'webm', 'avi'].includes(ext)) {
    return FileVideo;
  }
  return GenericFileIcon;
}

/**
 * Builds a hierarchical tree from a flat or recursive list of LocalFile objects
 */
function buildTree(files: LocalFile[]): TreeNode[] {
  const rootNodes: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort files so directories are processed first or consistently
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    const parts = file.path.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const prevPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;
      const isDir = isLast ? file.isDirectory : true;

      if (!nodeMap.has(currentPath)) {
        const node: TreeNode = {
          id: currentPath,
          name: part,
          path: currentPath,
          isDirectory: isDir,
          size: isLast ? file.size : 0,
          lastModified: isLast ? file.lastModified : Date.now(),
          mimeType: isLast ? file.mimeType : 'application/vnd.google-apps.folder',
          file: isLast ? file : undefined,
          children: []
        };
        nodeMap.set(currentPath, node);

        if (prevPath && nodeMap.has(prevPath)) {
          nodeMap.get(prevPath)!.children.push(node);
        } else if (!prevPath) {
          rootNodes.push(node);
        }
      } else if (isLast && !file.isDirectory) {
        // Update existing node if populated by directory placeholder
        const existing = nodeMap.get(currentPath)!;
        existing.isDirectory = false;
        existing.file = file;
        existing.size = file.size;
        existing.lastModified = file.lastModified;
      }
    }
  }

  // Sort children: directories first, then alphabetical
  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortRecursive(node.children);
      }
    }
  };

  sortRecursive(rootNodes);
  return rootNodes;
}

/**
 * Filter tree by search query while maintaining parent folder paths
 */
function filterTree(nodes: TreeNode[], query: string, matchedPaths: Set<string>): TreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();

  const filtered: TreeNode[] = [];

  for (const node of nodes) {
    const matchesSelf = node.name.toLowerCase().includes(q);
    const matchingChildren = node.children.length > 0
      ? filterTree(node.children, query, matchedPaths)
      : [];

    if (matchesSelf || matchingChildren.length > 0) {
      if (node.isDirectory) {
        matchedPaths.add(node.id);
      }
      filtered.push({
        ...node,
        children: matchingChildren
      });
    }
  }

  return filtered;
}

/**
 * Collect all directory IDs in the tree
 */
function collectAllFolderIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  const traverse = (list: TreeNode[]) => {
    for (const item of list) {
      if (item.isDirectory) {
        ids.push(item.id);
        if (item.children.length > 0) {
          traverse(item.children);
        }
      }
    }
  };
  traverse(nodes);
  return ids;
}

export function FolderStructureTree({
  files,
  folderName = 'Root Folder',
  onSelectFile,
  onPreviewFile,
  syncStates,
  searchQuery = '',
  className = ''
}: FolderStructureTreeProps) {
  const rawTree = useMemo(() => buildTree(files), [files]);

  const allFolderIds = useMemo(() => collectAllFolderIds(rawTree), [rawTree]);

  // Default to expanding top-level folders
  const defaultOpenIds = useMemo(() => {
    return rawTree.filter(n => n.isDirectory).map(n => n.id);
  }, [rawTree]);

  const [openFolders, setOpenFolders] = useState<string[]>(defaultOpenIds);

  // Filter tree when query changes and collect auto-opened paths
  const { filteredTree, autoOpenIds } = useMemo(() => {
    if (!searchQuery.trim()) {
      return { filteredTree: rawTree, autoOpenIds: [] };
    }
    const matched = new Set<string>();
    const tree = filterTree(rawTree, searchQuery, matched);
    return { filteredTree: tree, autoOpenIds: Array.from(matched) };
  }, [rawTree, searchQuery]);

  const effectiveOpenFolders = useMemo(() => {
    if (autoOpenIds.length === 0) return openFolders;
    return Array.from(new Set([...openFolders, ...autoOpenIds]));
  }, [openFolders, autoOpenIds]);

  const handleExpandAll = useCallback(() => {
    setOpenFolders(allFolderIds);
  }, [allFolderIds]);

  const handleCollapseAll = useCallback(() => {
    setOpenFolders([]);
  }, []);

  const getGitStatus = useCallback((node: TreeNode): 'synced' | 'modified' | 'untracked' | undefined => {
    if (node.isDirectory) return undefined;
    if (!syncStates) return undefined;

    const state = syncStates.get(node.path) || syncStates.get(node.id);
    if (!state) return 'untracked';

    if (state.status === 'Synced' || state.isSynced) return 'synced';
    if (state.status === 'Syncing' || state.isModified) return 'modified';
    return 'untracked';
  }, [syncStates]);

  const renderTreeNodes = (nodes: TreeNode[]) => {
    return nodes.map((node) => {
      if (node.isDirectory) {
        return (
          <FolderItem key={node.id} value={node.id}>
            <FolderTrigger className="text-foreground">
              <span className="truncate">{node.name}</span>
              <span className="text-[10px] text-muted-foreground ml-2 px-1.5 py-0.2 rounded-full bg-secondary/60">
                {node.children.length}
              </span>
            </FolderTrigger>
            <FolderPanel>
              {node.children.length > 0 ? (
                renderTreeNodes(node.children)
              ) : (
                <div className="p-2 text-xs text-muted-foreground italic">Empty folder</div>
              )}
            </FolderPanel>
          </FolderItem>
        );
      }

      const FileIconComponent = getFileIcon(node.name);
      const status = getGitStatus(node);

      return (
        <div
          key={node.id}
          onClick={() => {
            if (node.file && onSelectFile) onSelectFile(node.file);
          }}
          className="group/file flex items-center justify-between w-full pr-2 hover:bg-secondary/30 rounded-lg transition-colors cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            <FileItem icon={FileIconComponent} gitStatus={status}>
              <span className="truncate" title={node.path}>{node.name}</span>
            </FileItem>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0 ml-2 opacity-70 group-hover/file:opacity-100 transition-opacity">
            <span className="font-mono">{formatBytes(node.size)}</span>
            {node.file && onPreviewFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.file) onPreviewFile(node.file);
                }}
                className="p-1 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors"
                title="Preview file"
              >
                <Eye size={13} />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className={`bento-block flex flex-col h-full bg-card/60 backdrop-blur-xs border border-border/70 ${className}`}>
      {/* ── Toolbar Header ── */}
      <div className="p-3 sm:p-4 border-b border-border/60 flex flex-wrap items-center justify-between gap-3 bg-secondary/20 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <FolderTreeIcon size={16} />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm text-foreground truncate">{folderName}</h4>
            <p className="text-xs text-muted-foreground">
              {files.length} {files.length === 1 ? 'item' : 'items'} in directory tree
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={handleExpandAll}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            title="Expand All"
          >
            <ChevronsUpDown size={13} />
            <span className="hidden sm:inline">Expand All</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            title="Collapse All"
          >
            <ChevronsDownUp size={13} />
            <span className="hidden sm:inline">Collapse All</span>
          </button>
        </div>
      </div>

      {/* ── File Tree Container ── */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 min-h-[260px]">
        {filteredTree.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
            <Search size={32} className="opacity-30 mb-2" />
            <p className="text-sm font-medium">No files or folders found</p>
            {searchQuery && (
              <p className="text-xs mt-1 text-muted-foreground/80">
                No items match &quot;{searchQuery}&quot;
              </p>
            )}
          </div>
        ) : (
          <Files
            open={effectiveOpenFolders}
            onOpenChange={setOpenFolders}
            className="w-full text-foreground select-none"
          >
            {renderTreeNodes(filteredTree)}
          </Files>
        )}
      </div>

      {/* ── Tree Footer / Legend ── */}
      <div className="px-3 sm:px-4 py-2 border-t border-border/50 bg-secondary/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-400" /> Synced
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-400" /> Modified
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-blue-400" /> Local Only
          </span>
        </div>
        <div className="font-mono text-[10px]">
          Animate UI Files
        </div>
      </div>
    </div>
  );
}

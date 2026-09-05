'use client';

import * as React from 'react';
import { FolderIcon, FolderOpenIcon, FileIcon } from 'lucide-react';

import {
  Files as FilesPrimitive,
  FilesHighlight as FilesHighlightPrimitive,
  FolderItem as FolderItemPrimitive,
  FolderHeader as FolderHeaderPrimitive,
  FolderTrigger as FolderTriggerPrimitive,
  FolderHighlight as FolderHighlightPrimitive,
  Folder as FolderPrimitive,
  FolderIcon as FolderIconPrimitive,
  FileLabel as FileLabelPrimitive,
  FolderPanel as FolderPanelPrimitive,
  FileHighlight as FileHighlightPrimitive,
  File as FilePrimitive,
  FileIcon as FileIconPrimitive,
  type FilesProps as FilesPrimitiveProps,
  type FolderItemProps as FolderItemPrimitiveProps,
  type FolderPanelProps as FolderPanelPrimitiveProps,
  type FileProps as FilePrimitiveProps,
  type FileLabelProps as FileLabelPrimitiveProps,
} from '@/components/animate-ui/primitives/base/files';
import { cn } from '@/lib/utils';

type GitStatus = 'untracked' | 'modified' | 'deleted' | 'synced';

type FilesProps = FilesPrimitiveProps;

function Files({ className, children, ...props }: FilesProps) {
  return (
    <FilesPrimitive className={cn('p-2 w-full', className)} {...props}>
      <FilesHighlightPrimitive className="bg-secondary/70 border border-border/40 rounded-lg pointer-events-none">
        {children}
      </FilesHighlightPrimitive>
    </FilesPrimitive>
  );
}

type SubFilesProps = FilesProps;

function SubFiles(props: SubFilesProps) {
  return <FilesPrimitive {...props} />;
}

type FolderItemProps = FolderItemPrimitiveProps;

function FolderItem(props: FolderItemProps) {
  return <FolderItemPrimitive {...props} />;
}

type FolderTriggerProps = FileLabelPrimitiveProps & {
  gitStatus?: GitStatus;
};

function FolderTrigger({
  children,
  className,
  gitStatus,
  ...props
}: FolderTriggerProps) {
  return (
    <FolderHeaderPrimitive>
      <FolderTriggerPrimitive className="w-full text-start cursor-pointer group">
        <FolderHighlightPrimitive>
          <FolderPrimitive className="flex items-center justify-between gap-2 p-1.5 sm:p-2 pointer-events-none rounded-md group-hover:bg-secondary/40 transition-colors">
            <div
              className={cn(
                'flex items-center gap-2 min-w-0',
                gitStatus === 'untracked' && 'text-blue-400',
                gitStatus === 'modified' && 'text-amber-400',
                gitStatus === 'deleted' && 'text-red-400',
                gitStatus === 'synced' && 'text-emerald-400',
              )}
            >
              <FolderIconPrimitive
                closeIcon={<FolderIcon className="size-4 shrink-0 text-amber-400" />}
                openIcon={<FolderOpenIcon className="size-4 shrink-0 text-amber-400" />}
              />
              <FileLabelPrimitive
                className={cn('text-sm font-medium text-foreground truncate', className)}
                {...props}
              >
                {children}
              </FileLabelPrimitive>
            </div>

            {gitStatus && (
              <span
                className={cn(
                  'rounded-full size-2 shrink-0',
                  gitStatus === 'untracked' && 'bg-blue-400',
                  gitStatus === 'modified' && 'bg-amber-400',
                  gitStatus === 'deleted' && 'bg-red-400',
                  gitStatus === 'synced' && 'bg-emerald-400',
                )}
              />
            )}
          </FolderPrimitive>
        </FolderHighlightPrimitive>
      </FolderTriggerPrimitive>
    </FolderHeaderPrimitive>
  );
}

type FolderPanelProps = FolderPanelPrimitiveProps;

function FolderPanel(props: FolderPanelProps) {
  return (
    <div className="relative ml-4 sm:ml-5 before:absolute before:-left-2 before:inset-y-0 before:w-px before:h-full before:bg-border/70">
      <FolderPanelPrimitive {...props} />
    </div>
  );
}

type FileItemProps = FilePrimitiveProps & {
  icon?: React.ElementType;
  gitStatus?: GitStatus;
};

function FileItem({
  icon: Icon = FileIcon,
  className,
  children,
  gitStatus,
  ...props
}: FileItemProps) {
  return (
    <FileHighlightPrimitive>
      <FilePrimitive
        className={cn(
          'flex items-center justify-between gap-2 p-1.5 sm:p-2 pointer-events-none rounded-md group-hover:bg-secondary/40 transition-colors',
          gitStatus === 'untracked' && 'text-blue-400',
          gitStatus === 'modified' && 'text-amber-400',
          gitStatus === 'deleted' && 'text-red-400',
          gitStatus === 'synced' && 'text-emerald-400',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileIconPrimitive>
            <Icon className="size-4 shrink-0 text-muted-foreground" />
          </FileIconPrimitive>
          <FileLabelPrimitive className={cn('text-sm text-foreground/90 truncate', className)} {...props}>
            {children}
          </FileLabelPrimitive>
        </div>

        {gitStatus && (
          <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded-md bg-secondary/80 shrink-0">
            {gitStatus === 'untracked' && <span className="text-blue-400">Local</span>}
            {gitStatus === 'modified' && <span className="text-amber-400">Mod</span>}
            {gitStatus === 'deleted' && <span className="text-red-400">Del</span>}
            {gitStatus === 'synced' && <span className="text-emerald-400">Synced</span>}
          </span>
        )}
      </FilePrimitive>
    </FileHighlightPrimitive>
  );
}

export {
  Files,
  FolderItem,
  FolderTrigger,
  FolderPanel,
  FileItem,
  SubFiles,
  type FilesProps,
  type FolderItemProps,
  type FolderTriggerProps,
  type FolderPanelProps,
  type FileItemProps,
  type SubFilesProps,
};

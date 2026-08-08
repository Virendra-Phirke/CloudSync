import React from 'react';
import { AlertTriangle, HardDrive, Cloud, FileCode, CheckCircle2 } from 'lucide-react';
import { ConflictItem } from '../lib/syncBiDirectional';

interface ConflictResolverModalProps {
  isOpen: boolean;
  conflicts: ConflictItem[];
  onResolve: (resolution: 'local' | 'drive' | 'skip') => void;
}

export function ConflictResolverModal({ isOpen, conflicts, onResolve }: ConflictResolverModalProps) {
  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[0]; // Resolve one at a time for simplicity

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm" />
      
      <div className="relative bg-neutral-900 border border-amber-500/30 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-zoomIn">
        {/* Header */}
        <div className="flex items-start gap-4 p-5 border-b border-neutral-800 bg-amber-500/5">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-amber-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Sync Conflict Detected</h2>
            <p className="text-sm text-neutral-400 mt-1">
              The file <span className="font-medium text-neutral-200">"{currentConflict.path}"</span> was modified both locally and on Google Drive since the last sync.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm font-medium text-neutral-300">Which version would you like to keep?</p>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Local Version Option */}
            <button
              onClick={() => onResolve('local')}
              className="flex flex-col text-left p-4 rounded-xl border border-neutral-800 bg-neutral-950/50 hover:bg-neutral-800 hover:border-blue-500/50 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={16} className="text-blue-400" />
                <span className="font-semibold text-neutral-200">Keep Local</span>
              </div>
              <p className="text-xs text-neutral-500 mb-1">Uploads your local file to Google Drive, overwriting the cloud version.</p>
              <p className="text-xs text-blue-400/80 mt-auto">Modified: {new Date(currentConflict.localLastModified).toLocaleString()}</p>
            </button>

            {/* Drive Version Option */}
            <button
              onClick={() => onResolve('drive')}
              className="flex flex-col text-left p-4 rounded-xl border border-neutral-800 bg-neutral-950/50 hover:bg-neutral-800 hover:border-emerald-500/50 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <Cloud size={16} className="text-emerald-400" />
                <span className="font-semibold text-neutral-200">Keep Drive</span>
              </div>
              <p className="text-xs text-neutral-500 mb-1">Downloads the file from Google Drive, overwriting your local version.</p>
              <p className="text-xs text-emerald-400/80 mt-auto">Modified: {new Date(currentConflict.driveLastModified).toLocaleString()}</p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 flex justify-end gap-3 bg-neutral-900">
          <button
            onClick={() => onResolve('skip')}
            className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

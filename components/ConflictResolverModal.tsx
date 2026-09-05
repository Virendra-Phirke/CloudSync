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
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm" 
        onClick={() => onResolve('skip')}
      />
      
      <div className="relative bg-card text-card-foreground border border-amber-500/30 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-zoomIn">
        {/* Header */}
        <div className="flex items-start gap-4 p-5 sm:p-6 border-b border-border bg-amber-500/5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-amber-500" size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">Sync Conflict Detected</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              The file <span className="font-semibold text-foreground">"{currentConflict.path}"</span> was modified both locally and on Google Drive since the last sync.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Which version would you like to keep?</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Local Version Option */}
            <button
              onClick={() => onResolve('local')}
              className="flex flex-col text-left p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/70 hover:border-primary/50 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 rounded-lg bg-primary/10 text-primary">
                  <HardDrive size={16} />
                </div>
                <span className="font-bold text-foreground text-sm">Keep Local</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Uploads your local file to Google Drive, overwriting cloud version.</p>
              <p className="text-[11px] font-mono text-primary mt-auto">Modified: {new Date(currentConflict.localLastModified).toLocaleString()}</p>
            </button>

            {/* Drive Version Option */}
            <button
              onClick={() => onResolve('drive')}
              className="flex flex-col text-left p-4 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/70 hover:border-emerald-500/50 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Cloud size={16} />
                </div>
                <span className="font-bold text-foreground text-sm">Keep Drive</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Downloads the file from Google Drive, overwriting local version.</p>
              <p className="text-[11px] font-mono text-emerald-500 mt-auto">Modified: {new Date(currentConflict.driveLastModified).toLocaleString()}</p>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-border flex justify-end gap-3 bg-card/95">
          <button
            onClick={() => onResolve('skip')}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

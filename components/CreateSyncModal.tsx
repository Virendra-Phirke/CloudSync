'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Cloud, HardDrive, ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { CloudProviderType } from '../lib/providers/types';
import { getProvider } from '../lib/providers';
import { isProviderAuthenticated, getProviderUserInfo } from '../lib/oauth';
import { executeUniversalSync } from '../lib/sync/universalSync';
import { getLocalFolders, SyncFolder } from '../lib/localFolder';
import { useToast } from './ToastContext';

interface CreateSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncStarted?: () => void;
}

type SyncTarget = 'local' | CloudProviderType;

export function CreateSyncModal({ isOpen, onClose, onSyncStarted }: CreateSyncModalProps) {
  const [source, setSource] = useState<SyncTarget>('local');
  const [destination, setDestination] = useState<SyncTarget>('google');
  const [sourcePath, setSourcePath] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [localFolders, setLocalFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedLocalFolderId, setSelectedLocalFolderId] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const { showToast } = useToast();

  React.useEffect(() => {
    if (isOpen) {
      getLocalFolders().then((folders) => {
        const list = folders.map((f: any) => ({ id: f.id, name: f.info?.name || f.id }));
        setLocalFolders(list);
        if (list.length > 0 && !selectedLocalFolderId) {
          setSelectedLocalFolderId(list[0].id);
        }
      });
    }
  }, [isOpen, selectedLocalFolderId]);

  const targetOptions: Array<{ id: SyncTarget; name: string; icon: string; description: string }> = [
    { id: 'local', name: 'Local Folder', icon: 'harddrive', description: 'Local filesystem directory' },
    { id: 'google', name: 'Google Drive', icon: 'google', description: 'Google Drive cloud storage' },
    { id: 'dropbox', name: 'Dropbox', icon: 'dropbox', description: 'Dropbox cloud folder' },
    { id: 'onedrive', name: 'Microsoft OneDrive', icon: 'onedrive', description: 'Microsoft 365 / OneDrive' },
  ];

  const handleStartSync = async () => {
    if (source === destination) {
      showToast('Source and Destination cannot be the same target.', 'error');
      return;
    }

    // Verify auth
    if (source !== 'local' && !isProviderAuthenticated(source)) {
      showToast(`Please connect your ${source} account in Accounts first.`, 'error');
      return;
    }
    if (destination !== 'local' && !isProviderAuthenticated(destination)) {
      showToast(`Please connect your ${destination} account in Accounts first.`, 'error');
      return;
    }

    setIsStarting(true);
    setProgressMsg('Initializing multi-cloud sync pipeline...');

    try {
      let sourceEndpoint: any;
      let destEndpoint: any;

      if (source === 'local') {
        const folders = await getLocalFolders();
        const found = folders.find((f: any) => f.id === selectedLocalFolderId) || folders[0];
        if (!found) throw new Error('No local folder available');
        sourceEndpoint = { type: 'local', handle: found.handle, name: found.info?.name || 'Local' };
      } else {
        const provider = getProvider(source);
        sourceEndpoint = { type: 'cloud', provider, folderIdOrPath: sourcePath || 'root', name: provider.name };
      }

      if (destination === 'local') {
        const folders = await getLocalFolders();
        const found = folders.find((f: any) => f.id === selectedLocalFolderId) || folders[0];
        if (!found) throw new Error('No local folder available');
        destEndpoint = { type: 'local', handle: found.handle, name: found.info?.name || 'Local' };
      } else {
        const provider = getProvider(destination);
        destEndpoint = { type: 'cloud', provider, folderIdOrPath: destinationPath || 'root', name: provider.name };
      }

      await executeUniversalSync({
        source: sourceEndpoint,
        destination: destEndpoint,
        onProgress: (msg) => setProgressMsg(msg),
      });

      showToast(`Sync completed successfully between ${source} and ${destination}!`, 'success');
      onSyncStarted?.();
      onClose();
    } catch (err: any) {
      console.error('Multi-cloud sync error:', err);
      showToast(`Sync failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsStarting(false);
      setProgressMsg('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="relative bg-card text-card-foreground border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden p-6 z-10"
          >
            <div className="flex items-center justify-between pb-4 border-b border-border/80">
              <div>
                <h3 className="text-lg font-bold text-foreground">Create Multi-Cloud Sync</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Synchronize files between local storage, Google Drive, Dropbox, and OneDrive.
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 py-5">
              {/* Source Selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Source:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {targetOptions.map((opt) => (
                    <button
                      key={`src-${opt.id}`}
                      type="button"
                      onClick={() => setSource(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        source === opt.id
                          ? 'border-primary bg-primary/10 text-primary shadow-xs'
                          : 'border-border/70 hover:border-border bg-secondary/30 text-foreground'
                      }`}
                    >
                      <div className="font-semibold text-xs truncate">{opt.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 truncate">{opt.id}</div>
                    </button>
                  ))}
                </div>

                {source === 'local' ? (
                  <div className="mt-2.5">
                    <label className="text-[11px] text-muted-foreground block mb-1">Select Local Folder:</label>
                    <select
                      value={selectedLocalFolderId}
                      onChange={(e) => setSelectedLocalFolderId(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg bg-secondary/70 border border-border text-foreground"
                    >
                      {localFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-2.5">
                    <label className="text-[11px] text-muted-foreground block mb-1">Source Folder Path (optional):</label>
                    <input
                      type="text"
                      placeholder="e.g. /Documents or root"
                      value={sourcePath}
                      onChange={(e) => setSourcePath(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg bg-secondary/70 border border-border text-foreground outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              {/* Direction Indicator */}
              <div className="flex items-center justify-center py-1">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground">
                  <ArrowRight size={16} />
                </div>
              </div>

              {/* Destination Selection */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                  Destination:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {targetOptions.map((opt) => (
                    <button
                      key={`dst-${opt.id}`}
                      type="button"
                      onClick={() => setDestination(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        destination === opt.id
                          ? 'border-primary bg-primary/10 text-primary shadow-xs'
                          : 'border-border/70 hover:border-border bg-secondary/30 text-foreground'
                      }`}
                    >
                      <div className="font-semibold text-xs truncate">{opt.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 truncate">{opt.id}</div>
                    </button>
                  ))}
                </div>

                {destination !== 'local' && (
                  <div className="mt-2.5">
                    <label className="text-[11px] text-muted-foreground block mb-1">Destination Folder Path:</label>
                    <input
                      type="text"
                      placeholder="e.g. /Backup or root"
                      value={destinationPath}
                      onChange={(e) => setDestinationPath(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg bg-secondary/70 border border-border text-foreground outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              {progressMsg && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2 text-xs text-primary">
                  <Loader2 size={14} className="animate-spin shrink-0" />
                  <span className="truncate">{progressMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isStarting}
                className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSync}
                disabled={isStarting || source === destination}
                className="flex items-center gap-2 px-5 py-2 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-primary/20"
              >
                {isStarting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Start Sync</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

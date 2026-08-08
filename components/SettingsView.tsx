'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, HardDrive, X, Loader2, AlertTriangle, Trash2, FolderPlus, Plus } from 'lucide-react';
import {
  addLocalFolder, removeLocalFolder, clearAllLocalFolders,
  getLocalFolders, getLocalFolderById, getFolderStats,
  SyncFolderEntry, SyncFolder, FolderStats,
} from '../lib/localFolder';
import { initAuth, OAuthUser } from '../lib/oauth';
import { useToast } from './ToastContext';
import { getAppSettings, saveAppSettings, AppSettings } from '../lib/settings';
import { ConfirmDialog } from './ConfirmDialog';

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

interface FolderWithStats {
  folder: SyncFolder;
  stats: FolderStats | null;
  loading: boolean;
}

export function SettingsView() {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Multi-folder state
  const [folderEntries, setFolderEntries] = useState<FolderWithStats[]>([]);
  const [loadingPick, setLoadingPick] = useState(false);
  const [fsApiSupported, setFsApiSupported] = useState(true);

  // Confirmation dialog state
  const [folderToRemove, setFolderToRemove] = useState<{ id: string; name: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { showToast } = useToast();

  // Auth state
  useEffect(() => {
    const unsub = initAuth(
      (u) => setUser(u),
      () => setUser(null)
    );
    return () => unsub();
  }, []);

  // Load folders and settings
  const loadFolders = useCallback(async () => {
    const folders = await getLocalFolders();
    const entries: FolderWithStats[] = folders.map(f => ({
      folder: f.info,
      stats: null,
      loading: true,
    }));
    setFolderEntries(entries);

    // Load stats in parallel
    const results = await Promise.all(
      folders.map(async (f): Promise<FolderWithStats> => {
        try {
          const entry = await getLocalFolderById(f.id);
          if (entry) {
            const stats = await getFolderStats(entry.handle);
            return { folder: f.info, stats, loading: false };
          }
          return { folder: f.info, stats: null, loading: false };
        } catch {
          return { folder: f.info, stats: null, loading: false };
        }
      })
    );
    setFolderEntries(results);
  }, []);

  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setFsApiSupported(false);
      return;
    }
    loadFolders();
    getAppSettings().then(setSettings);
  }, [loadFolders]);

  const handleAddFolder = useCallback(async () => {
    setLoadingPick(true);
    try {
      const entry = await addLocalFolder();
      if (!entry) return;
      showToast(`Added folder "${entry.info.name}"`, 'success');
      await loadFolders();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to add folder', 'error');
      }
    } finally {
      setLoadingPick(false);
    }
  }, [showToast, loadFolders]);

  const confirmRemoveFolder = useCallback(async () => {
    if (!folderToRemove) return;
    await removeLocalFolder(folderToRemove.id);
    showToast(`Removed folder "${folderToRemove.name}"`, 'info');
    setFolderToRemove(null);
    await loadFolders();
  }, [folderToRemove, showToast, loadFolders]);

  const confirmClearAll = useCallback(async () => {
    await clearAllLocalFolders();
    setFolderEntries([]);
    showToast('Application data reset.', 'info');
    setShowResetConfirm(false);
  }, [showToast]);

  const updateSetting = useCallback(async (updates: Partial<AppSettings>) => {
    if (!settings) return;
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    await saveAppSettings(newSettings);
  }, [settings]);

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="px-8 max-md:pl-20 py-6 border-b border-neutral-800 sticky top-0 bg-neutral-950/95 z-10">
        <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Settings</h2>
        <p className="text-sm text-neutral-400 mt-1">Configure your sync preferences and manage folders.</p>
      </header>

      <div className="p-4 md:p-8 max-w-3xl space-y-8">

        {/* ── Sync Folders ── */}
        <section className="animate-fadeInUp">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">
              Sync Folders
            </h3>
            <button
              onClick={handleAddFolder}
              disabled={loadingPick || !fsApiSupported}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-blue-100 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all duration-200 shadow-sm shadow-blue-500/20"
            >
              {loadingPick ? (
                <><Loader2 size={14} className="animate-spin" /> Adding...</>
              ) : (
                <><Plus size={14} /> Add Folder</>
              )}
            </button>
          </div>

          {!fsApiSupported && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-sm text-amber-400">
              <AlertTriangle size={16} />
              File System API requires Chrome or Edge
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
            {folderEntries.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 bg-neutral-800/50 rounded-2xl flex items-center justify-center mb-4 border border-neutral-700/50">
                  <FolderPlus size={24} className="text-neutral-600" />
                </div>
                <p className="text-sm font-medium text-neutral-300 mb-1">No folders added</p>
                <p className="text-xs text-neutral-500 max-w-xs">
                  Add folders from your PC to sync with Google Drive. You can add multiple folders.
                </p>
                {!user && fsApiSupported && (
                  <p className="text-xs text-amber-400 mt-3 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Connect your Google account in Accounts tab first
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-neutral-800 stagger-children">
                {folderEntries.map((entry) => (
                  <div
                    key={entry.folder.id}
                    className="p-4 flex items-start justify-between gap-4 hover:bg-neutral-800/30 transition-colors duration-150"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                        <FolderOpen size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-100 text-sm">{entry.folder.name}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Added {new Date(entry.folder.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        {entry.loading ? (
                          <div className="flex items-center gap-3 mt-2 animate-pulse">
                            <div className="h-3 w-12 bg-neutral-800 rounded"></div>
                            <div className="h-3 w-12 bg-neutral-800 rounded"></div>
                            <div className="h-3 w-16 bg-neutral-800 rounded"></div>
                          </div>
                        ) : entry.stats ? (
                          <div className="flex items-center gap-3 mt-2">
                            {[
                              { label: 'Files', value: entry.stats.fileCount.toString(), color: 'text-blue-400' },
                              { label: 'Dirs', value: entry.stats.dirCount.toString(), color: 'text-purple-400' },
                              { label: 'Size', value: formatBytes(entry.stats.totalSize), color: 'text-emerald-400' },
                            ].map(({ label, value, color }) => (
                              <span key={label} className="text-xs text-neutral-500">
                                <span className={`font-semibold ${color}`}>{value}</span> {label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-600 mt-2">Permission needed to access</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setFolderToRemove({ id: entry.folder.id, name: entry.folder.name })}
                      className="p-1.5 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                      title="Remove folder"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Sync Preferences ── */}
        <section className="animate-fadeInUp" style={{ animationDelay: '50ms' }}>
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Sync Preferences</h3>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800 shadow-sm overflow-hidden">

            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/30 transition-colors duration-150">
              <div>
                <p className="font-medium text-neutral-100">Auto-Sync</p>
                <p className="text-sm text-neutral-400">Enable or disable background synchronization</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings?.autoSync || false} 
                  onChange={(e) => updateSetting({ autoSync: e.target.checked })} 
                  disabled={!settings}
                />
                <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/30 transition-colors duration-150">
              <div>
                <p className="font-medium text-neutral-100">Launch on startup</p>
                <p className="text-sm text-neutral-400">Automatically start CloudSync when you log in</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings?.launchOnStartup || false} 
                  onChange={(e) => updateSetting({ launchOnStartup: e.target.checked })}
                  disabled={!settings}
                />
                <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors duration-150">
              <div>
                <p className="font-medium text-neutral-100">Sync Interval</p>
                <p className="text-sm text-neutral-400">How often to check for changes</p>
              </div>
              <select
                disabled={!settings || !settings.autoSync}
                value={settings?.syncIntervalMin || 5}
                onChange={(e) => updateSetting({ syncIntervalMin: parseInt(e.target.value) })}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full sm:w-48 p-2.5 outline-none disabled:opacity-50"
              >
                <option value="1">Every 1 minute</option>
                <option value="5">Every 5 minutes</option>
                <option value="30">Every 30 minutes</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Advanced ── */}
        <section className="animate-fadeInUp" style={{ animationDelay: '100ms' }}>
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Advanced</h3>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/30 transition-colors duration-150">
              <div>
                <p className="font-medium text-neutral-100">Show hidden files</p>
                <p className="text-sm text-neutral-400">Include files starting with a dot (e.g. .gitignore)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/30 transition-colors duration-150">
              <div>
                <p className="font-medium text-red-500">Reset Application Data</p>
                <p className="text-sm text-neutral-400">Clears all local metadata and disconnects accounts</p>
              </div>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm shadow-red-500/20"
              >
                Factory Reset
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={!!folderToRemove}
        title="Remove Folder"
        message={<>Are you sure you want to stop syncing <strong>{folderToRemove?.name}</strong>? Local files will not be deleted, but they will no longer sync to Google Drive.</>}
        confirmText="Remove"
        isDestructive
        onConfirm={confirmRemoveFolder}
        onCancel={() => setFolderToRemove(null)}
      />

      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Factory Reset"
        message="Are you sure you want to reset all application data? This will clear all synced folders, reset settings, and disconnect your Google account. Your files will not be deleted."
        confirmText="Reset App Data"
        isDestructive
        onConfirm={confirmClearAll}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

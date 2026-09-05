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
      <header className="px-4 sm:px-6 md:px-8 py-5 border-b border-border/70 sticky top-0 bg-background/95 backdrop-blur-md z-10">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Settings</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Configure sync schedules, directory links, and system preferences.</p>
      </header>

      <div className="p-4 sm:p-6 md:p-8 max-w-5xl space-y-6 flex-1 w-full mx-auto">

        {/* ── Sync Folders Bento Block ── */}
        <div className="bento-block space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                <FolderOpen size={18} />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-foreground">
                  Monitored Folders
                </h3>
                <p className="text-xs text-muted-foreground">Directories synced bidirectionally with Google Drive</p>
              </div>
            </div>

            <button
              onClick={handleAddFolder}
              disabled={loadingPick || !fsApiSupported}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-sm shadow-primary/20"
            >
              {loadingPick ? (
                <><Loader2 size={14} className="animate-spin" /> Adding...</>
              ) : (
                <><Plus size={14} /> Add Folder</>
              )}
            </button>
          </div>

          {!fsApiSupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs sm:text-sm text-amber-400">
              <AlertTriangle size={16} className="shrink-0" />
              File System API requires Chrome or Edge browser.
            </div>
          )}

          {folderEntries.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-center bento-subcard">
              <div className="w-12 h-12 bg-secondary/80 rounded-2xl flex items-center justify-center mb-3 border border-border/60">
                <FolderPlus size={22} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">No folders linked</p>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Add folders from your PC to sync with Google Drive. Multi-folder tracking supported.
              </p>
              {!user && fsApiSupported && (
                <p className="text-xs text-amber-400 mt-3 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Connect your Google account in Accounts tab first
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/60 bento-subcard !p-0 overflow-hidden">
              {folderEntries.map((entry) => (
                <div
                  key={entry.folder.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-secondary/60 transition-colors duration-150"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                      <FolderOpen size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{entry.folder.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Added {new Date(entry.folder.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {entry.loading ? (
                        <div className="flex items-center gap-3 mt-1.5 animate-pulse">
                          <div className="h-3 w-12 bg-secondary rounded"></div>
                          <div className="h-3 w-12 bg-secondary rounded"></div>
                          <div className="h-3 w-16 bg-secondary rounded"></div>
                        </div>
                      ) : entry.stats ? (
                        <div className="flex items-center gap-3 mt-1.5">
                          {[
                            { label: 'Files', value: entry.stats.fileCount.toString(), color: 'text-blue-400' },
                            { label: 'Dirs', value: entry.stats.dirCount.toString(), color: 'text-purple-400' },
                            { label: 'Size', value: formatBytes(entry.stats.totalSize), color: 'text-emerald-400' },
                          ].map(({ label, value, color }) => (
                            <span key={label} className="text-xs text-muted-foreground">
                              <span className={`font-semibold ${color}`}>{value}</span> {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-amber-400 mt-1">Permission needed to access</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setFolderToRemove({ id: entry.folder.id, name: entry.folder.name })}
                    className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Remove folder"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sync Automation Preferences Bento Block ── */}
        <div className="bento-block space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <HardDrive size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Sync Automation</h3>
              <p className="text-xs text-muted-foreground">Control synchronization triggers and background polling</p>
            </div>
          </div>

          <div className="bento-subcard divide-y divide-border/60 !p-0 overflow-hidden">
            <div className="p-4 flex items-center justify-between hover:bg-secondary/40 transition-colors duration-150">
              <div>
                <p className="font-medium text-foreground text-sm">Background Auto-Sync</p>
                <p className="text-xs text-muted-foreground">Continuously sync changes in the background</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings?.autoSync || false}
                  onChange={(e) => updateSetting({ autoSync: e.target.checked })}
                  disabled={!settings}
                />
                <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="p-4 flex items-center justify-between hover:bg-secondary/40 transition-colors duration-150">
              <div>
                <p className="font-medium text-foreground text-sm">Launch on startup</p>
                <p className="text-xs text-muted-foreground">Initialize CloudSync background daemon automatically</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings?.launchOnStartup || false}
                  onChange={(e) => updateSetting({ launchOnStartup: e.target.checked })}
                  disabled={!settings}
                />
                <div className="w-11 h-6 bg-secondary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/40 transition-colors duration-150">
              <div>
                <p className="font-medium text-foreground text-sm">Sync Frequency Interval</p>
                <p className="text-xs text-muted-foreground">Cycle interval for checking file change updates</p>
              </div>
              <select
                disabled={!settings || !settings.autoSync}
                value={settings?.syncIntervalMin || 5}
                onChange={(e) => updateSetting({ syncIntervalMin: parseInt(e.target.value) })}
                className="bg-secondary/80 border border-border/80 text-foreground text-xs sm:text-sm rounded-xl focus:ring-1 focus:ring-primary focus:border-primary p-2.5 outline-none disabled:opacity-50 min-w-[180px]"
              >
                <option value="1">Every 1 minute (Fast)</option>
                <option value="5">Every 5 minutes (Standard)</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Danger Zone Bento Block ── */}
        <div className="bento-block border-destructive/30 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-destructive">Danger Zone</h3>
              <p className="text-xs text-muted-foreground">Reset local tracking cache and unlink accounts</p>
            </div>
          </div>

          <div className="bento-subcard p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-destructive/20 bg-destructive/5">
            <div>
              <p className="font-semibold text-foreground text-sm">Factory Reset Application</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clears all local IndexedDB metadata, removes folder handles, and disconnects Google OAuth.
              </p>
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-destructive hover:bg-destructive/90 rounded-xl transition-colors shadow-sm shrink-0"
            >
              Reset App Data
            </button>
          </div>
        </div>
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

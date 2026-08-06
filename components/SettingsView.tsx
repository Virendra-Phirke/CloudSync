'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, HardDrive, X, Loader2, AlertTriangle } from 'lucide-react';
import { pickLocalFolder, getLocalFolderInfo, clearLocalFolder, getFolderStats, getLocalFolder, FolderInfo, FolderStats } from '../lib/localFolder';
import { initAuth, OAuthUser } from '../lib/oauth';
import { useToast } from './ToastContext';

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

// ... existing imports ...
import { getAppSettings, saveAppSettings, AppSettings } from '../lib/settings';

export function SettingsView() {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const userRef = useRef<OAuthUser | null>(null);
  userRef.current = user;

  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Local PC folder state
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
  const [loadingPick, setLoadingPick] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [fsApiSupported, setFsApiSupported] = useState(true);

  const { showToast } = useToast();

  // Auth state
  useEffect(() => {
    const unsub = initAuth(
      (u) => setUser(u),
      () => setUser(null)
    );
    return () => unsub();
  }, []);

  // Check browser support + load saved folder info + settings on mount
  useEffect(() => {
    if (!('showDirectoryPicker' in window)) {
      setFsApiSupported(false);
      return;
    }
    getLocalFolderInfo().then((info) => {
      setFolderInfo(info);
      if (info) loadStats();
    });
    
    getAppSettings().then(setSettings);
  }, []);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const handle = await getLocalFolder();
      if (handle) {
        const stats = await getFolderStats(handle);
        setFolderStats(stats);
      }
    } catch {
      // Permission denied or handle gone
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const handlePickFolder = useCallback(async () => {
    setLoadingPick(true);
    try {
      const handle = await pickLocalFolder();
      if (!handle) return; // user cancelled
      const info: FolderInfo = { name: handle.name, savedAt: Date.now() };
      setFolderInfo(info);
      showToast(`Sync folder set to "${handle.name}"`, 'success');
      // Load stats after picking
      const stats = await getFolderStats(handle);
      setFolderStats(stats);
    } catch (err: any) {
      showToast(err.message || 'Failed to select folder', 'error');
    } finally {
      setLoadingPick(false);
    }
  }, [showToast]);

  const handleClearFolder = useCallback(async () => {
    await clearLocalFolder();
    setFolderInfo(null);
    setFolderStats(null);
    showToast('Sync folder cleared.', 'info');
  }, [showToast]);

  const updateSetting = useCallback(async (updates: Partial<AppSettings>) => {
    if (!settings) return;
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    await saveAppSettings(newSettings);
  }, [settings]);

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <header className="px-8 py-6 border-b border-neutral-800 sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Settings</h2>
        <p className="text-sm text-neutral-400 mt-1">Configure your sync preferences and select which PC folder to sync.</p>
      </header>

      <div className="p-8 max-w-3xl space-y-8">

        {/* ── Local PC Folder ── */}
        <section>
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
            Local Sync Folder
          </h3>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">

            {/* Main row */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${folderInfo ? 'bg-blue-500/10 text-blue-400' : 'bg-neutral-800 text-neutral-500'}`}>
                  {folderInfo ? <FolderOpen size={20} /> : <Folder size={20} />}
                </div>
                <div>
                  <p className="font-medium text-neutral-100">PC Folder to Sync</p>
                  {folderInfo ? (
                    <>
                      <p className="text-sm font-semibold text-blue-400 mt-0.5">📁 {folderInfo.name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Selected {new Date(folderInfo.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-neutral-400 mt-0.5">No folder selected — choose a folder on your PC</p>
                      {!fsApiSupported && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          File System API requires Chrome or Edge
                        </p>
                      )}
                      {!user && fsApiSupported && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Connect your Google account in Accounts tab first
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {folderInfo && (
                  <button
                    onClick={handleClearFolder}
                    className="px-3 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handlePickFolder}
                  disabled={loadingPick || !fsApiSupported}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-100 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors shadow-md shadow-blue-500/20"
                >
                  {loadingPick ? (
                    <><Loader2 size={15} className="animate-spin" /> Selecting...</>
                  ) : (
                    <><HardDrive size={15} /> {folderInfo ? 'Change Folder' : 'Select Folder'}</>
                  )}
                </button>
              </div>
            </div>

            {/* Folder stats */}
            {folderInfo && (
              <div className="px-5 pb-5">
                {loadingStats ? (
                  <div className="flex items-center gap-2 text-neutral-500 text-xs">
                    <Loader2 size={13} className="animate-spin" /> Calculating folder size...
                  </div>
                ) : folderStats ? (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Files', value: folderStats.fileCount.toString(), color: 'text-blue-400' },
                      { label: 'Folders', value: folderStats.dirCount.toString(), color: 'text-purple-400' },
                      { label: 'Total Size', value: formatBytes(folderStats.totalSize), color: 'text-emerald-400' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-neutral-800/60 rounded-xl p-3 text-center">
                        <p className={`text-base font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {/* ── Sync Preferences ── */}
        <section>
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Sync Preferences</h3>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800 shadow-sm overflow-hidden">

            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
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

            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
              <div>
                <p className="font-medium text-neutral-100">Launch on startup</p>
                <p className="text-sm text-sidebar-foreground/50">Automatically start CloudSync when you log in</p>
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

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-800/50 transition-colors">
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
        <section>
          <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Advanced</h3>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl divide-y divide-neutral-800 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
              <div>
                <p className="font-medium text-neutral-100">Show hidden files</p>
                <p className="text-sm text-neutral-400">Include files starting with a dot (e.g. .gitignore)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-neutral-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="p-5 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
              <div>
                <p className="font-medium text-red-500">Reset Application Data</p>
                <p className="text-sm text-neutral-400">Clears all local metadata and disconnects accounts</p>
              </div>
              <button
                onClick={async () => { await clearLocalFolder(); setFolderInfo(null); setFolderStats(null); showToast('Application data reset.', 'info'); }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm shadow-red-500/20"
              >
                Factory Reset
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

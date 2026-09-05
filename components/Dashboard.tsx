'use client';
import { Folder, HardDrive, Cloud, CheckCircle2, Clock, AlertCircle, UploadCloud, File as FileIcon, Download, Loader2, FolderOpen, RefreshCw, Plus, ArrowUpRight, Zap, ShieldCheck } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';

const StorageChart = dynamic(() => import('./StorageChart').then(mod => mod.StorageChart), { ssr: false });
import { fetchDriveQuota, fetchDriveFiles, DriveFile, DriveQuota } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import { getLocalFolders, getLocalFolderById, getFolderStats, getLocalFolderInfos, addLocalFolder, FolderStats, SyncFolder } from '../lib/localFolder';
import { FilePreviewModal } from './FilePreviewModal';
import { useSync } from './SyncContext';
import { useToast } from './ToastContext';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { CountingNumber } from '@/components/animate-ui/primitives/texts/counting-number';

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

function splitBytes(bytes: number, decimals = 1) {
  if (!+bytes) return { value: 0, unit: 'Bytes', decimals: 0 };
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  const dm = val >= 100 || val % 1 === 0 ? 0 : decimals;
  const factor = Math.pow(10, dm);
  const truncated = Math.round(val * factor) / factor;
  return { value: truncated, unit: sizes[i], decimals: dm };
}

interface FolderWithStats {
  folder: SyncFolder;
  stats: FolderStats | null;
  loading: boolean;
}

export const Dashboard = React.memo(function Dashboard() {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [quota, setQuota] = useState<DriveQuota | null>(null);
  const [recentFiles, setRecentFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Multi-folder state
  const [folderEntries, setFolderEntries] = useState<FolderWithStats[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [addingFolder, setAddingFolder] = useState(false);

  // Search filter & pagination for recent files
  const [activitySearch, setActivitySearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Reset to page 1 whenever user searches
  useEffect(() => {
    setCurrentPage(1);
  }, [activitySearch]);

  // File Preview Modal state
  const [previewFile, setPreviewFile] = useState<any>(null);

  const { isSyncing, syncProgressMsg, startSync, cancelSync } = useSync();
  const { showToast } = useToast();

  const loadDriveData = useCallback(async () => {
    setLoading(true);
    try {
      const [q, f] = await Promise.all([
        fetchDriveQuota(),
        fetchDriveFiles()
      ]);
      setQuota(q);

      const sorted = f.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
      setRecentFiles(sorted.slice(0, 50));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocalData = useCallback(async () => {
    setLoadingLocal(true);
    try {
      const infos = await getLocalFolderInfos();

      const entries: FolderWithStats[] = infos.map(f => ({ folder: f, stats: null, loading: true }));
      setFolderEntries(entries);

      const promises = infos.map(async (f) => {
        try {
          const entry = await getLocalFolderById(f.id);
          if (entry) {
            const stats = await getFolderStats(entry.handle);
            return { folder: f, stats, loading: false };
          }
          return { folder: f, stats: null, loading: false };
        } catch {
          return { folder: f, stats: null, loading: false };
        }
      });

      const results = await Promise.all(promises);
      setFolderEntries(results);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    loadLocalData();
    const unsubscribe = initAuth(
      (u) => {
        setUser(u);
        loadDriveData();
      },
      () => {
        setUser(null);
        setQuota(null);
        setRecentFiles([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [loadDriveData, loadLocalData]);

  const handleQuickAddFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      showToast('File System API requires Chrome or Edge', 'error');
      return;
    }
    setAddingFolder(true);
    try {
      const entry = await addLocalFolder();
      if (entry) {
        showToast(`Added folder "${entry.info.name}"`, 'success');
        await loadLocalData();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(err.message || 'Failed to add folder', 'error');
      }
    } finally {
      setAddingFolder(false);
    }
  };

  const handleQuickSync = () => {
    if (folderEntries.length === 0) {
      showToast('Add a local folder first to sync', 'info');
      return;
    }
    if (!user) {
      showToast('Connect your Google Drive account in Accounts tab', 'error');
      return;
    }
    startSync(folderEntries[0].folder.id);
  };

  const handleExport = () => {
    if (recentFiles.length === 0) return;
    const csvRows = ['File Name,Modified Time'];
    for (const file of recentFiles) {
      csvRows.push(`"${file.name.replace(/"/g, '""')}","${new Date(file.modifiedTime).toISOString()}"`);
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const dataUri = URL.createObjectURL(blob);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'activity-log.csv');
    linkElement.click();
    URL.revokeObjectURL(dataUri);
  };

  // Aggregate stats across all folders
  const aggregateStats = folderEntries.reduce((acc, e) => {
    if (e.stats) {
      acc.fileCount += e.stats.fileCount;
      acc.dirCount += e.stats.dirCount;
      acc.totalSize += e.stats.totalSize;
    }
    return acc;
  }, { fileCount: 0, dirCount: 0, totalSize: 0 });

  // Google Drive Stats
  const driveUsed = quota ? parseInt(quota.usageInDrive || '0') : 0;
  const trashUsed = quota ? parseInt(quota.usageInDriveTrash || '0') : 0;
  const cloudTotalStr = quota ? formatBytes(parseInt(quota.limit || '0')) : '0 GB';
  const cloudUsedStr = quota ? formatBytes(parseInt(quota.usage || '0')) : '0 GB';
  const cloudFreeStr = quota ? formatBytes(Math.max(0, parseInt(quota.limit || '0') - parseInt(quota.usage || '0'))) : '0 GB';
  const driveUsedStr = quota ? formatBytes(driveUsed) : '--';
  const trashUsedStr = quota ? formatBytes(trashUsed) : '--';

  const cloudUsedPercent = quota && parseInt(quota.limit || '0') > 0
    ? Math.round((parseInt(quota.usage || '0') / parseInt(quota.limit)) * 100)
    : 0;

  const driveBreakdownData = quota ? [
    { name: 'Drive', value: driveUsed, color: '#10b981' },
    { name: 'Trash', value: trashUsed, color: '#f59e0b' },
    { name: 'Free', value: Math.max(0, parseInt(quota.limit || '0') - parseInt(quota.usage || '0')), color: '#262626' },
  ] : [
    { name: 'Free', value: 1, color: '#262626' },
  ];

  const filteredRecentFiles = recentFiles.filter(f =>
    f.name.toLowerCase().includes(activitySearch.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredRecentFiles.length / ITEMS_PER_PAGE));
  const effectiveCurrentPage = Math.min(currentPage, totalPages);

  const paginatedRecentFiles = useMemo(() => {
    const startIndex = (effectiveCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecentFiles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecentFiles, effectiveCurrentPage]);

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (effectiveCurrentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, effectiveCurrentPage - 1);
      const end = Math.min(totalPages - 1, effectiveCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (effectiveCurrentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 26 } }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* ── Top Header Block ── */}
      <header className="px-4 sm:px-6 md:px-8 py-5 border-b border-border/70 sticky top-0 bg-background/95 backdrop-blur-md z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Overview</h2>
            <span className="bento-badge bg-primary/10 text-primary border border-primary/20">
              Live Sync
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Real-time synchronization metrics across local storage and cloud.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              loadDriveData();
              loadLocalData();
            }}
            disabled={loading || loadingLocal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-foreground bg-secondary/80 hover:bg-secondary border border-border/80 rounded-xl transition-all disabled:opacity-50"
            title="Refresh dashboard stats"
          >
            <RefreshCw size={14} className={loading || loadingLocal ? 'animate-spin text-primary' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleQuickSync}
            disabled={isSyncing || folderEntries.length === 0 || !user}
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-primary/20"
          >
            {isSyncing ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <UploadCloud size={15} />
                <span>Sync Now</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Bento Grid Content ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="p-4 sm:p-6 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto"
      >
        {/* ── 4 KPI Metric Bento Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* KPI 1: Local PC Storage */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Local Storage</span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <HardDrive size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight flex items-baseline">
              {loadingLocal ? (
                <div className="h-8 w-24 bg-secondary/60 rounded animate-pulse" />
              ) : (
                (() => {
                  const s = splitBytes(aggregateStats.totalSize);
                  return (
                    <>
                      <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                      <span className="text-base sm:text-lg font-medium text-muted-foreground ml-1.5">{s.unit}</span>
                    </>
                  );
                })()
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              Across <CountingNumber number={folderEntries.length} inView /> folder{folderEntries.length !== 1 ? 's' : ''}
            </p>
          </motion.div>

          {/* KPI 2: Cloud Quota */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Cloud Used</span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Cloud size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight flex items-baseline">
              {!user ? (
                '--'
              ) : loading ? (
                <div className="h-8 w-24 bg-secondary/60 rounded animate-pulse" />
              ) : (
                (() => {
                  const s = splitBytes(quota ? parseInt(quota.usage || '0') : 0);
                  return (
                    <>
                      <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                      <span className="text-base sm:text-lg font-medium text-muted-foreground ml-1.5">{s.unit}</span>
                    </>
                  );
                })()
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>{user ? `of ${cloudTotalStr}` : 'Not connected'}</span>
              {user && (
                <span className="font-semibold text-foreground">
                  <CountingNumber number={cloudUsedPercent} inView />%
                </span>
              )}
            </div>
          </motion.div>

          {/* KPI 3: Total Files */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tracked Files</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <FolderOpen size={16} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {loadingLocal ? (
                <div className="h-8 w-20 bg-secondary/60 rounded animate-pulse" />
              ) : (
                <CountingNumber number={aggregateStats.fileCount} inView />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              in <CountingNumber number={aggregateStats.dirCount} inView /> subdirectories
            </p>
          </motion.div>

          {/* KPI 4: Sync Engine Status */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Engine State</span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <Zap size={16} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : user ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
              <span className="text-base sm:text-lg font-bold text-foreground">
                {isSyncing ? 'Synchronizing' : user ? 'Operational' : 'Idle'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {isSyncing ? syncProgressMsg || 'Transferring...' : user ? 'Continuous sync ready' : 'Connect account to sync'}
            </p>
          </motion.div>
        </div>

        {/* ── Main Bento Grid (12-column layout) ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">

          {/* Bento Card 1: Local PC Folders (6 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-6 bento-block flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl">
                    <Folder size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Local PC Folders</h3>
                    <p className="text-xs text-muted-foreground">Monitored source folders on device</p>
                  </div>
                </div>

                <button
                  onClick={handleQuickAddFolder}
                  disabled={addingFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors disabled:opacity-50"
                >
                  {addingFolder ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  <span>Add Folder</span>
                </button>
              </div>

              {loadingLocal ? (
                <div className="space-y-3 animate-pulse py-2">
                  <div className="h-12 bg-secondary/50 rounded-xl" />
                  <div className="h-16 bg-secondary/30 rounded-xl" />
                </div>
              ) : folderEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-8 px-4 bento-subcard">
                  <FolderOpen className="w-10 h-10 text-muted-foreground/60 mb-2.5" />
                  <p className="text-sm font-semibold text-foreground">No folders linked yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Link directories from your computer to automatically mirror changes to Google Drive.
                  </p>
                  <button
                    onClick={handleQuickAddFolder}
                    className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-xl transition-all"
                  >
                    <Plus size={14} />
                    <span>Select Local Directory</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Aggregate stats banner */}
                  <div className="bento-subcard grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Total Size</p>
                      <p className="text-base font-bold text-foreground mt-0.5">
                        {(() => {
                          const s = splitBytes(aggregateStats.totalSize);
                          return (
                            <>
                              <CountingNumber number={s.value} decimalPlaces={s.decimals} inView /> {s.unit}
                            </>
                          );
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Files</p>
                      <p className="text-base font-bold text-foreground mt-0.5">
                        <CountingNumber number={aggregateStats.fileCount} inView />
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase font-semibold">Sources</p>
                      <p className="text-base font-bold text-foreground mt-0.5">
                        <CountingNumber number={folderEntries.length} inView />
                      </p>
                    </div>
                  </div>

                  {/* Individual Folder Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[160px] overflow-y-auto pr-1">
                    {folderEntries.map((entry) => (
                      <div
                        key={entry.folder.id}
                        className="bento-subcard flex items-center justify-between gap-2 p-3 hover:border-border transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FolderOpen size={16} className="text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate" title={entry.folder.name}>
                              {entry.folder.name}
                            </p>
                            {entry.loading ? (
                              <div className="h-2.5 w-16 bg-secondary rounded animate-pulse mt-1" />
                            ) : entry.stats ? (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {entry.stats.fileCount} files · {formatBytes(entry.stats.totalSize)}
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-400 mt-0.5">Permission needed</p>
                            )}
                          </div>
                        </div>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Connected" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Bento Card 2: Google Drive Storage (6 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-6 bento-block flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Cloud size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Google Drive Storage</h3>
                    <p className="text-xs text-muted-foreground">Connected cloud quota & distribution</p>
                  </div>
                </div>

                {user && (
                  <span className="bento-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                )}
              </div>

              {!user ? (
                <div className="flex flex-col items-center justify-center text-center py-8 px-4 bento-subcard">
                  <Cloud className="w-10 h-10 text-muted-foreground/60 mb-2.5" />
                  <p className="text-sm font-semibold text-foreground">Google Drive Not Connected</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Link your Google account to track drive storage and enable two-way cloud sync.
                  </p>
                </div>
              ) : loading ? (
                <div className="animate-pulse space-y-4 py-3">
                  <div className="h-6 w-36 bg-secondary/60 rounded" />
                  <div className="h-2 w-full bg-secondary/50 rounded" />
                  <div className="h-20 bg-secondary/30 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-bold text-foreground">{cloudUsedStr}</span>
                      <span className="text-xs text-muted-foreground ml-1.5 font-medium">used of {cloudTotalStr}</span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">{cloudFreeStr} free</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-700 ease-out ${
                        cloudUsedPercent > 80 ? 'bg-red-500' : cloudUsedPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(cloudUsedPercent, 100)}%` }}
                    />
                  </div>

                  {/* Breakdown Legend and Chart */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="grid grid-cols-1 gap-2 flex-1 text-xs">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span className="text-muted-foreground">In Drive</span>
                        </div>
                        <span className="font-semibold text-foreground">{driveUsedStr}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <span className="text-muted-foreground">In Trash</span>
                        </div>
                        <span className="font-semibold text-foreground">{trashUsedStr}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
                          <span className="text-muted-foreground">Free Space</span>
                        </div>
                        <span className="font-semibold text-foreground">{cloudFreeStr}</span>
                      </div>
                    </div>

                    <div className="h-28 w-28 shrink-0 hidden sm:block">
                      <StorageChart data={driveBreakdownData} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Bento Card 3: Quick Action Hub (4 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-4 bento-block flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Action Hub</h3>
                    <p className="text-xs text-muted-foreground">Instant synchronization tools</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                <button
                  onClick={handleQuickSync}
                  disabled={isSyncing || folderEntries.length === 0}
                  className="bento-subcard flex items-center justify-between p-3 text-left hover:border-primary/50 group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <UploadCloud size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        Synchronize All
                      </p>
                      <p className="text-[11px] text-muted-foreground">Two-way delta sync</p>
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>

                <button
                  onClick={handleQuickAddFolder}
                  disabled={addingFolder}
                  className="bento-subcard flex items-center justify-between p-3 text-left hover:border-blue-500/50 group transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                      <FolderOpen size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground group-hover:text-blue-400 transition-colors">
                        Add Directory
                      </p>
                      <p className="text-[11px] text-muted-foreground">Choose local folder</p>
                    </div>
                  </div>
                  <Plus size={14} className="text-muted-foreground group-hover:text-blue-400 transition-colors" />
                </button>

                <button
                  onClick={handleExport}
                  disabled={recentFiles.length === 0}
                  className="bento-subcard flex items-center justify-between p-3 text-left hover:border-emerald-500/50 group transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Download size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                        Export Activity
                      </p>
                      <p className="text-[11px] text-muted-foreground">Download CSV report</p>
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400" />
                End-to-end Local PKCE
              </span>
              <span className="font-mono text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">v1.0</span>
            </div>
          </motion.div>

          {/* Bento Card 4: Recent Drive Activity (8 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-8 bento-block flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Recent Drive Activity</h3>
                    <p className="text-xs text-muted-foreground">Recently modified items in Google Drive</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter activity..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-secondary/70 border border-border/70 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all w-32 sm:w-44"
                  />
                  <button
                    onClick={handleExport}
                    disabled={recentFiles.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground bg-secondary/80 hover:bg-secondary border border-border/80 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Download size={13} />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
              </div>

              {!user ? (
                <div className="p-8 text-center bento-subcard">
                  <Cloud className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">Drive Not Connected</p>
                  <p className="text-xs text-muted-foreground mt-1">Connect your Google account to view recent activity.</p>
                </div>
              ) : loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-secondary rounded-lg" />
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-36 bg-secondary rounded" />
                          <div className="h-2.5 w-20 bg-secondary/60 rounded" />
                        </div>
                      </div>
                      <div className="h-3 w-16 bg-secondary/60 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredRecentFiles.length > 0 ? (
                <div className="space-y-4">
                  <div className="divide-y divide-border/60 bento-subcard !p-0 overflow-hidden">
                    {paginatedRecentFiles.map((item, i) => (
                      <div
                        key={item.id || i}
                        onClick={() => {
                          setPreviewFile({
                            id: item.id,
                            name: item.name,
                            path: item.name,
                            mimeType: item.mimeType,
                            size: formatBytes(parseInt(item.size || '0')),
                            sizeBytes: parseInt(item.size || '0'),
                            date: new Date(item.modifiedTime).toLocaleDateString(),
                            status: 'Synced',
                            driveId: item.id,
                            isDirectory: item.mimeType === 'application/vnd.google-apps.folder',
                            thumbnailLink: item.thumbnailLink,
                            iconLink: item.iconLink,
                          });
                        }}
                        className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-secondary/70 transition-colors duration-150 cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                            {item.iconLink ? (
                              <img src={item.iconLink} alt="Icon" className="w-4 h-4 object-contain group-hover:scale-110 transition-transform" />
                            ) : (
                              <FileIcon size={16} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground text-xs sm:text-sm truncate group-hover:text-primary transition-colors" title={item.name}>
                              {item.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <CheckCircle2 size={11} className="text-emerald-400" />
                              Synced to Cloud
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                          {new Date(item.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* ── Shadcn Pagination Bar ── */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                    <div className="text-[11px] sm:text-xs">
                      Showing <span className="font-semibold text-foreground">{(effectiveCurrentPage - 1) * ITEMS_PER_PAGE + 1}</span>–<span className="font-semibold text-foreground">{Math.min(effectiveCurrentPage * ITEMS_PER_PAGE, filteredRecentFiles.length)}</span> of <span className="font-semibold text-foreground"><CountingNumber number={filteredRecentFiles.length} inView /></span> items
                    </div>

                    {totalPages > 1 && (
                      <Pagination className="mx-0 w-auto justify-end">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              disabled={effectiveCurrentPage <= 1}
                              className={effectiveCurrentPage <= 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                            />
                          </PaginationItem>

                          {getPageNumbers().map((page, idx) => (
                            <PaginationItem key={idx}>
                              {page === 'ellipsis' ? (
                                <PaginationEllipsis />
                              ) : (
                                <PaginationLink
                                  isActive={page === effectiveCurrentPage}
                                  onClick={() => setCurrentPage(page)}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              )}
                            </PaginationItem>
                          ))}

                          <PaginationItem>
                            <PaginationNext
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              disabled={effectiveCurrentPage >= totalPages}
                              className={effectiveCurrentPage >= totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bento-subcard">
                  <Clock className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">No recent activity</p>
                  <p className="text-xs text-muted-foreground mt-1">Files synced to Google Drive will appear here.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── File Preview Modal ── */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          statusBadge={{
            'Synced': { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <Cloud size={14} />, label: 'Synced' },
            'Local Only': { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <HardDrive size={14} />, label: 'Local Only' },
            'Modified': { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <AlertCircle size={14} />, label: 'Modified' },
            'Syncing': { cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: <Loader2 size={14} className="animate-spin" />, label: 'Syncing' },
            'Error': { cls: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle size={14} />, label: 'Error' },
          }}
        />
      )}
    </div>
  );
});


'use client';
import {
  Folder, HardDrive, Cloud, CheckCircle2, Clock, AlertCircle, UploadCloud,
  File as FileIcon, Download, Loader2, FolderOpen, RefreshCw, Plus, ArrowUpRight,
  Zap, ShieldCheck, FolderTree, Check, ChevronRight, Layers, ExternalLink,
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'motion/react';

const StorageChart = dynamic(() => import('./StorageChart').then(mod => mod.StorageChart), { ssr: false });
const FolderStructureModal = dynamic(() => import('./FolderStructureModal').then(mod => mod.FolderStructureModal), { ssr: false });

import { fetchDriveQuota, fetchDriveFiles, DriveFile, DriveQuota } from '../lib/drive';
import {
  initAuth,
  OAuthUser,
  isProviderAuthenticated,
  fetchCloudConnections,
  initiateProviderOAuth,
  CloudProviderType,
} from '../lib/oauth';
import { getProvider } from '../lib/providers';
import { CloudItem, CloudQuota } from '../lib/providers/types';
import {
  getLocalFolders,
  getLocalFolderById,
  getFolderStats,
  getLocalFolderInfos,
  addLocalFolder,
  FolderStats,
  SyncFolder,
} from '../lib/localFolder';
import { isDesktop } from '../lib/desktopAdapter';
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

// ─── Cloud Provider Icons ──────────────────────────────────────────────────────

function GoogleDriveIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 127.3" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M58.3 127.3H29L0 77.1 29.2 26.8h29.2L87.3 77z" fill="#ffffff" fillOpacity="0.1" />
      <path d="M57.6 126H28.4L0 76.8 28.4 27.6h29.2L86.8 76.8z" fill="#ffffff" fillOpacity="0.1" />
      <path d="M58.3 126H29.1L0 75.8l29.2-50.2h29.2l28.9 50.2z" fill="#1fa463" />
      <path d="M19.4 58.9l-9.7 16.9 29.2 50.2h19.3z" fill="#137333" />
      <path d="M29.1 0L0 50.2l9.7 16.9L48.5 16.9z" fill="#ffcc4d" />
      <path d="M29.1 0l-9.7 16.9h58.3l9.6-16.9z" fill="#ea4335" />
      <path d="M29.1 0L19.4 16.9l29.1 50.2 9.6-16.9z" fill="#c5221f" />
    </svg>
  );
}

function DropboxIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M6 3L0 7.5L6 12L12 7.5L6 3Z" fill="#0061FF" />
      <path d="M18 3L12 7.5L18 12L24 7.5L18 3Z" fill="#0061FF" />
      <path d="M0 16.5L6 21L12 16.5L6 12L0 16.5Z" fill="#0061FF" />
      <path d="M24 16.5L18 21L12 16.5L18 12L24 16.5Z" fill="#0061FF" />
      <path d="M6 22.5L12 18L18 22.5L12 26.5L6 22.5Z" fill="#0061FF" />
    </svg>
  );
}

function OneDriveIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="#0078D4"
      />
    </svg>
  );
}

function ProviderLogo({ provider, size = 16, className = '' }: { provider: CloudProviderType; size?: number; className?: string }) {
  if (provider === 'dropbox') return <DropboxIcon size={size} className={className} />;
  if (provider === 'onedrive') return <OneDriveIcon size={size} className={className} />;
  return <GoogleDriveIcon size={size} className={className} />;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface FolderWithStats {
  folder: SyncFolder;
  stats: FolderStats | null;
  loading: boolean;
}

interface DashboardCloudItem {
  id: string;
  name: string;
  path: string;
  mimeType?: string;
  size: string;
  sizeBytes: number;
  date: string;
  modifiedTime: number;
  status: string;
  driveId?: string;
  isDirectory: boolean;
  thumbnailLink?: string;
  iconLink?: string;
  provider: CloudProviderType;
}

interface ProviderAccountState {
  connected: boolean;
  user?: OAuthUser;
  quota: CloudQuota | null;
  driveDetails?: {
    driveUsed: number;
    trashUsed: number;
  };
  loading: boolean;
}

const PROVIDER_METAS: Record<CloudProviderType, { name: string; shortName: string; color: string; badgeCls: string; description: string }> = {
  google: {
    name: 'Google Drive',
    shortName: 'Drive',
    color: '#10b981',
    badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    description: 'Sync files with Google Drive cloud storage.',
  },
  dropbox: {
    name: 'Dropbox',
    shortName: 'Dropbox',
    color: '#0061FF',
    badgeCls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    description: 'Fast differential block syncing and team storage.',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    shortName: 'OneDrive',
    color: '#0078D4',
    badgeCls: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    description: 'Sync files with Microsoft 365 and OneDrive.',
  },
};

export const Dashboard = React.memo(function Dashboard() {
  // Multi-Cloud Provider State
  const [cloudProviders, setCloudProviders] = useState<Record<CloudProviderType, ProviderAccountState>>({
    google: { connected: false, quota: null, loading: true },
    dropbox: { connected: false, quota: null, loading: true },
    onedrive: { connected: false, quota: null, loading: true },
  });
  const [recentFiles, setRecentFiles] = useState<DashboardCloudItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab view states
  const [selectedStorageTab, setSelectedStorageTab] = useState<'all' | CloudProviderType>('all');
  const [activityProviderFilter, setActivityProviderFilter] = useState<'all' | CloudProviderType>('all');

  // Multi-folder state
  const [folderEntries, setFolderEntries] = useState<FolderWithStats[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [addingFolder, setAddingFolder] = useState(false);

  // Search filter & pagination for recent files
  const [activitySearch, setActivitySearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Folder Structure Modal
  const [selectedStructureFolder, setSelectedStructureFolder] = useState<{ id: string; name: string } | null>(null);

  // File Preview Modal state
  const [previewFile, setPreviewFile] = useState<any>(null);

  // Reset to page 1 whenever user searches or changes filter
  useEffect(() => {
    setCurrentPage(1);
  }, [activitySearch, activityProviderFilter]);

  const { isSyncing, syncProgressMsg, startSync } = useSync();
  const { showToast } = useToast();

  // ─── Fetch Cloud Providers & Quotas & Recent Files ──────────────────────────

  const loadCloudData = useCallback(async (currentFolderInfos?: SyncFolder[]) => {
    setLoading(true);
    try {
      // 1. Fetch connection statuses
      const connections = await fetchCloudConnections();
      const googleConn = connections.find(c => c.provider === 'google');
      const dropboxConn = connections.find(c => c.provider === 'dropbox');
      const onedriveConn = connections.find(c => c.provider === 'onedrive');

      const nextProviders: Record<CloudProviderType, ProviderAccountState> = {
        google: { connected: Boolean(googleConn?.connected), user: googleConn?.user, quota: null, loading: true },
        dropbox: { connected: Boolean(dropboxConn?.connected), user: dropboxConn?.user, quota: null, loading: true },
        onedrive: { connected: Boolean(onedriveConn?.connected), user: onedriveConn?.user, quota: null, loading: true },
      };

      // 2. Fetch Quotas concurrently across connected providers
      const quotaTasks: Promise<void>[] = [];

      // Google Drive Quota
      if (nextProviders.google.connected) {
        quotaTasks.push(
          (async () => {
            try {
              const q = await fetchDriveQuota();
              if (q) {
                const limit = parseInt(q.limit || '0', 10);
                const usage = parseInt(q.usage || '0', 10);
                nextProviders.google.quota = {
                  totalBytes: limit,
                  usedBytes: usage,
                  freeBytes: Math.max(0, limit - usage),
                };
                nextProviders.google.driveDetails = {
                  driveUsed: parseInt(q.usageInDrive || '0', 10),
                  trashUsed: parseInt(q.usageInDriveTrash || '0', 10),
                };
              }
            } catch (err) {
              console.warn('Failed to fetch Google Drive quota:', err);
            } finally {
              nextProviders.google.loading = false;
            }
          })()
        );
      } else {
        nextProviders.google.loading = false;
      }

      // Dropbox Quota
      if (nextProviders.dropbox.connected) {
        quotaTasks.push(
          (async () => {
            try {
              const q = await getProvider('dropbox').getQuota();
              nextProviders.dropbox.quota = q;
            } catch (err) {
              console.warn('Failed to fetch Dropbox quota:', err);
            } finally {
              nextProviders.dropbox.loading = false;
            }
          })()
        );
      } else {
        nextProviders.dropbox.loading = false;
      }

      // OneDrive Quota
      if (nextProviders.onedrive.connected) {
        quotaTasks.push(
          (async () => {
            try {
              const q = await getProvider('onedrive').getQuota();
              nextProviders.onedrive.quota = q;
            } catch (err) {
              console.warn('Failed to fetch OneDrive quota:', err);
            } finally {
              nextProviders.onedrive.loading = false;
            }
          })()
        );
      } else {
        nextProviders.onedrive.loading = false;
      }

      await Promise.allSettled(quotaTasks);
      setCloudProviders({ ...nextProviders });

      // 3. Fetch Recent Cloud Activity across all connected providers
      const allFiles: DashboardCloudItem[] = [];
      const folders = currentFolderInfos || (await getLocalFolderInfos());
      const fileTasks: Promise<void>[] = [];

      // Google Drive Files
      if (nextProviders.google.connected) {
        fileTasks.push(
          (async () => {
            try {
              const gFiles = await fetchDriveFiles();
              for (const f of gFiles) {
                allFiles.push({
                  id: f.id,
                  name: f.name,
                  path: f.name,
                  mimeType: f.mimeType,
                  size: formatBytes(parseInt(f.size || '0', 10)),
                  sizeBytes: parseInt(f.size || '0', 10),
                  date: new Date(f.modifiedTime).toLocaleDateString(),
                  modifiedTime: new Date(f.modifiedTime).getTime(),
                  status: 'Synced',
                  driveId: f.id,
                  isDirectory: f.mimeType === 'application/vnd.google-apps.folder',
                  thumbnailLink: f.thumbnailLink,
                  iconLink: f.iconLink,
                  provider: 'google',
                });
              }
            } catch (err) {
              console.warn('Failed to fetch Google Drive files for dashboard:', err);
            }
          })()
        );
      }

      // Dropbox Files
      if (nextProviders.dropbox.connected) {
        fileTasks.push(
          (async () => {
            try {
              const dbxProvider = getProvider('dropbox');
              const dbxFolders = folders.filter(f => f.provider === 'dropbox');
              if (dbxFolders.length > 0) {
                for (const f of dbxFolders) {
                  try {
                    const res = await dbxProvider.listFiles({ folderIdOrPath: `/${f.name}` });
                    for (const item of res.items) {
                      allFiles.push({
                        id: item.id,
                        name: item.name,
                        path: item.path,
                        mimeType: item.mimeType,
                        size: item.isDirectory ? '--' : formatBytes(item.size),
                        sizeBytes: item.size,
                        date: new Date(item.modifiedTime).toLocaleDateString(),
                        modifiedTime: item.modifiedTime,
                        status: 'Synced',
                        driveId: item.id,
                        isDirectory: item.isDirectory,
                        thumbnailLink: item.thumbnailUrl,
                        provider: 'dropbox',
                      });
                    }
                  } catch {}
                }
              } else {
                const res = await dbxProvider.listFiles({ folderIdOrPath: '' });
                for (const item of res.items) {
                  allFiles.push({
                    id: item.id,
                    name: item.name,
                    path: item.path,
                    mimeType: item.mimeType,
                    size: item.isDirectory ? '--' : formatBytes(item.size),
                    sizeBytes: item.size,
                    date: new Date(item.modifiedTime).toLocaleDateString(),
                    modifiedTime: item.modifiedTime,
                    status: 'Synced',
                    driveId: item.id,
                    isDirectory: item.isDirectory,
                    thumbnailLink: item.thumbnailUrl,
                    provider: 'dropbox',
                  });
                }
              }
            } catch (err) {
              console.warn('Failed to fetch Dropbox files for dashboard:', err);
            }
          })()
        );
      }

      // OneDrive Files
      if (nextProviders.onedrive.connected) {
        fileTasks.push(
          (async () => {
            try {
              const oneProvider = getProvider('onedrive');
              const oneFolders = folders.filter(f => f.provider === 'onedrive');
              if (oneFolders.length > 0) {
                for (const f of oneFolders) {
                  try {
                    const res = await oneProvider.listFiles({ folderIdOrPath: f.name });
                    for (const item of res.items) {
                      allFiles.push({
                        id: item.id,
                        name: item.name,
                        path: item.path,
                        mimeType: item.mimeType,
                        size: item.isDirectory ? '--' : formatBytes(item.size),
                        sizeBytes: item.size,
                        date: new Date(item.modifiedTime).toLocaleDateString(),
                        modifiedTime: item.modifiedTime,
                        status: 'Synced',
                        driveId: item.id,
                        isDirectory: item.isDirectory,
                        thumbnailLink: item.thumbnailUrl,
                        provider: 'onedrive',
                      });
                    }
                  } catch {}
                }
              } else {
                const res = await oneProvider.listFiles({ folderIdOrPath: 'root' });
                for (const item of res.items) {
                  allFiles.push({
                    id: item.id,
                    name: item.name,
                    path: item.path,
                    mimeType: item.mimeType,
                    size: item.isDirectory ? '--' : formatBytes(item.size),
                    sizeBytes: item.size,
                    date: new Date(item.modifiedTime).toLocaleDateString(),
                    modifiedTime: item.modifiedTime,
                    status: 'Synced',
                    driveId: item.id,
                    isDirectory: item.isDirectory,
                    thumbnailLink: item.thumbnailUrl,
                    provider: 'onedrive',
                  });
                }
              }
            } catch (err) {
              console.warn('Failed to fetch OneDrive files for dashboard:', err);
            }
          })()
        );
      }

      await Promise.allSettled(fileTasks);

      allFiles.sort((a, b) => b.modifiedTime - a.modifiedTime);
      setRecentFiles(allFiles.slice(0, 100));
    } catch (err) {
      console.error('Failed to load multi-cloud dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch Local Folder Data ────────────────────────────────────────────────

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
      return infos;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  useEffect(() => {
    loadLocalData().then((infos) => {
      loadCloudData(infos);
    });

    const unsubscribe = initAuth(
      () => {
        loadCloudData();
      },
      () => {
        loadCloudData();
      }
    );
    return () => unsubscribe();
  }, [loadCloudData, loadLocalData]);

  // ─── User Actions ────────────────────────────────────────────────────────────

  const handleQuickAddFolder = async () => {
    if (!isDesktop() && !('showDirectoryPicker' in window)) {
      showToast('File System API requires Chrome or Edge', 'error');
      return;
    }
    setAddingFolder(true);
    try {
      const entry = await addLocalFolder();
      if (entry) {
        showToast(`Added folder "${entry.info.name}"`, 'success');
        const infos = await loadLocalData();
        await loadCloudData(infos);
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
    const targetFolder = folderEntries[0].folder;
    const provider = targetFolder.provider || 'google';
    if (!isProviderAuthenticated(provider)) {
      const provName = PROVIDER_METAS[provider].name;
      showToast(`Connect your ${provName} account in Accounts tab to sync`, 'error');
      return;
    }
    startSync(targetFolder.id, provider);
  };

  const handleConnectProvider = (provider: CloudProviderType) => {
    initiateProviderOAuth(provider);
  };

  // ─── Computed Metrics & Storage Aggregation ─────────────────────────────────

  const connectedProviders = useMemo(() => {
    const list: CloudProviderType[] = [];
    if (cloudProviders.google.connected) list.push('google');
    if (cloudProviders.dropbox.connected) list.push('dropbox');
    if (cloudProviders.onedrive.connected) list.push('onedrive');
    return list;
  }, [cloudProviders]);

  const connectedCount = connectedProviders.length;
  const anyConnected = connectedCount > 0;

  // Aggregate local storage stats
  const aggregateLocalStats = useMemo(() => {
    return folderEntries.reduce((acc, e) => {
      if (e.stats) {
        acc.fileCount += e.stats.fileCount;
        acc.dirCount += e.stats.dirCount;
        acc.totalSize += e.stats.totalSize;
      }
      return acc;
    }, { fileCount: 0, dirCount: 0, totalSize: 0 });
  }, [folderEntries]);

  // Aggregate Multi-Cloud Quota
  const googleUsed = cloudProviders.google.quota?.usedBytes || 0;
  const dropboxUsed = cloudProviders.dropbox.quota?.usedBytes || 0;
  const onedriveUsed = cloudProviders.onedrive.quota?.usedBytes || 0;

  const totalCloudCapacity = (cloudProviders.google.quota?.totalBytes || 0) +
                             (cloudProviders.dropbox.quota?.totalBytes || 0) +
                             (cloudProviders.onedrive.quota?.totalBytes || 0);

  const totalCloudUsed = googleUsed + dropboxUsed + onedriveUsed;
  const totalCloudFree = Math.max(0, totalCloudCapacity - totalCloudUsed);

  const overallPercent = totalCloudCapacity > 0
    ? Math.round((totalCloudUsed / totalCloudCapacity) * 100)
    : 0;

  // Pie chart datasets
  const allCloudsChartData = useMemo(() => {
    const data: Array<{ name: string; value: number; color: string }> = [];
    if (googleUsed > 0) data.push({ name: 'Google Drive', value: googleUsed, color: '#10b981' });
    if (dropboxUsed > 0) data.push({ name: 'Dropbox', value: dropboxUsed, color: '#0061FF' });
    if (onedriveUsed > 0) data.push({ name: 'OneDrive', value: onedriveUsed, color: '#0078D4' });
    if (totalCloudFree > 0 || data.length === 0) {
      data.push({ name: 'Free Space', value: totalCloudFree > 0 ? totalCloudFree : 1, color: '#262626' });
    }
    return data;
  }, [googleUsed, dropboxUsed, onedriveUsed, totalCloudFree]);

  const googleChartData = useMemo(() => {
    const g = cloudProviders.google.quota;
    const gDetails = cloudProviders.google.driveDetails;
    if (!g) return [{ name: 'Free', value: 1, color: '#262626' }];
    const drive = gDetails?.driveUsed || g.usedBytes;
    const trash = gDetails?.trashUsed || 0;
    const free = g.freeBytes ?? Math.max(0, g.totalBytes - g.usedBytes);
    return [
      { name: 'In Drive', value: drive, color: '#10b981' },
      { name: 'In Trash', value: trash, color: '#f59e0b' },
      { name: 'Free', value: free, color: '#262626' },
    ];
  }, [cloudProviders.google]);

  const dropboxChartData = useMemo(() => {
    const d = cloudProviders.dropbox.quota;
    if (!d) return [{ name: 'Free', value: 1, color: '#262626' }];
    return [
      { name: 'Dropbox Used', value: d.usedBytes, color: '#0061FF' },
      { name: 'Free', value: d.freeBytes ?? Math.max(0, d.totalBytes - d.usedBytes), color: '#262626' },
    ];
  }, [cloudProviders.dropbox]);

  const onedriveChartData = useMemo(() => {
    const o = cloudProviders.onedrive.quota;
    if (!o) return [{ name: 'Free', value: 1, color: '#262626' }];
    return [
      { name: 'OneDrive Used', value: o.usedBytes, color: '#0078D4' },
      { name: 'Free', value: o.freeBytes ?? Math.max(0, o.totalBytes - o.usedBytes), color: '#262626' },
    ];
  }, [cloudProviders.onedrive]);

  const activeChartData = useMemo(() => {
    switch (selectedStorageTab) {
      case 'google': return googleChartData;
      case 'dropbox': return dropboxChartData;
      case 'onedrive': return onedriveChartData;
      case 'all':
      default: return allCloudsChartData;
    }
  }, [selectedStorageTab, googleChartData, dropboxChartData, onedriveChartData, allCloudsChartData]);

  // ─── Filtered Recent Files & Pagination ─────────────────────────────────────

  const filteredRecentFiles = useMemo(() => {
    return recentFiles.filter(f => {
      const matchesProvider = activityProviderFilter === 'all' || f.provider === activityProviderFilter;
      const matchesSearch = f.name.toLowerCase().includes(activitySearch.toLowerCase());
      return matchesProvider && matchesSearch;
    });
  }, [recentFiles, activityProviderFilter, activitySearch]);

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

  const handleExport = () => {
    if (filteredRecentFiles.length === 0) return;
    const csvRows = ['File Name,Cloud Provider,Size,Modified Time'];
    for (const file of filteredRecentFiles) {
      const provName = PROVIDER_METAS[file.provider]?.name || file.provider;
      csvRows.push(`"${file.name.replace(/"/g, '""')}","${provName}","${file.size}","${new Date(file.modifiedTime).toISOString()}"`);
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const dataUri = URL.createObjectURL(blob);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `cloud-activity-${activityProviderFilter}.csv`);
    linkElement.click();
    URL.revokeObjectURL(dataUri);
  };

  // Provider counts for recent files
  const providerFileCounts = useMemo(() => {
    const counts: Record<CloudProviderType, number> = { google: 0, dropbox: 0, onedrive: 0 };
    for (const file of recentFiles) {
      if (file.provider in counts) counts[file.provider]++;
    }
    return counts;
  }, [recentFiles]);

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
              Multi-Cloud Live
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Unified synchronization metrics across local directories, Google Drive, Dropbox, and OneDrive.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              loadLocalData().then(infos => loadCloudData(infos));
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
            disabled={isSyncing || folderEntries.length === 0 || !anyConnected}
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
        {/* ── 6 KPI Metric Bento Row (Shows Each Drive Separately!) ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {/* KPI 1: Local PC Storage */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Local PC</span>
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                <HardDrive size={15} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-baseline">
              {loadingLocal ? (
                <div className="h-7 w-20 bg-secondary/60 rounded animate-pulse" />
              ) : (
                (() => {
                  const s = splitBytes(aggregateLocalStats.totalSize);
                  return (
                    <>
                      <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                      <span className="text-xs sm:text-sm font-medium text-muted-foreground ml-1">{s.unit}</span>
                    </>
                  );
                })()
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              <CountingNumber number={folderEntries.length} inView /> monitored folder{folderEntries.length !== 1 ? 's' : ''}
            </p>
          </motion.div>

          {/* KPI 2: Google Drive Storage */}
          <motion.div
            variants={itemVariants}
            onClick={() => setSelectedStorageTab('google')}
            className="bento-block bento-block-interactive cursor-pointer group hover:border-emerald-500/40 transition-all flex flex-col justify-between"
            title="Google Drive Storage — click to inspect"
          >
            <div>
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-emerald-400 transition-colors truncate">
                  Google Drive
                </span>
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <GoogleDriveIcon size={14} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-baseline">
                {!cloudProviders.google.connected ? (
                  <span className="text-sm sm:text-base font-semibold text-muted-foreground">Not linked</span>
                ) : loading ? (
                  <div className="h-7 w-20 bg-secondary/60 rounded animate-pulse" />
                ) : (
                  (() => {
                    const s = splitBytes(googleUsed);
                    return (
                      <>
                        <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground ml-1">{s.unit}</span>
                      </>
                    );
                  })()
                )}
              </div>
            </div>
            <div className="mt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                {cloudProviders.google.connected ? (
                  <>
                    <span className="truncate">of {formatBytes(cloudProviders.google.quota?.totalBytes || 0)}</span>
                    <span className="font-semibold text-emerald-400 shrink-0 ml-1">
                      <CountingNumber
                        number={cloudProviders.google.quota?.totalBytes ? Math.round((googleUsed / cloudProviders.google.quota.totalBytes) * 100) : 0}
                        inView
                      />%
                    </span>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConnectProvider('google');
                    }}
                    className="text-emerald-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Connect Drive</span>
                    <ArrowUpRight size={11} />
                  </button>
                )}
              </div>
              <div className="w-full bg-secondary rounded-full h-1 mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: cloudProviders.google.connected && cloudProviders.google.quota?.totalBytes
                      ? `${Math.min(100, Math.round((googleUsed / cloudProviders.google.quota.totalBytes) * 100))}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </motion.div>

          {/* KPI 3: Dropbox Storage */}
          <motion.div
            variants={itemVariants}
            onClick={() => setSelectedStorageTab('dropbox')}
            className="bento-block bento-block-interactive cursor-pointer group hover:border-blue-500/40 transition-all flex flex-col justify-between"
            title="Dropbox Storage — click to inspect"
          >
            <div>
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-blue-400 transition-colors truncate">
                  Dropbox
                </span>
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                  <DropboxIcon size={14} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-baseline">
                {!cloudProviders.dropbox.connected ? (
                  <span className="text-sm sm:text-base font-semibold text-muted-foreground">Not linked</span>
                ) : loading ? (
                  <div className="h-7 w-20 bg-secondary/60 rounded animate-pulse" />
                ) : (
                  (() => {
                    const s = splitBytes(dropboxUsed);
                    return (
                      <>
                        <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground ml-1">{s.unit}</span>
                      </>
                    );
                  })()
                )}
              </div>
            </div>
            <div className="mt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                {cloudProviders.dropbox.connected ? (
                  <>
                    <span className="truncate">of {formatBytes(cloudProviders.dropbox.quota?.totalBytes || 0)}</span>
                    <span className="font-semibold text-blue-400 shrink-0 ml-1">
                      <CountingNumber
                        number={cloudProviders.dropbox.quota?.totalBytes ? Math.round((dropboxUsed / cloudProviders.dropbox.quota.totalBytes) * 100) : 0}
                        inView
                      />%
                    </span>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConnectProvider('dropbox');
                    }}
                    className="text-blue-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Connect Dropbox</span>
                    <ArrowUpRight size={11} />
                  </button>
                )}
              </div>
              <div className="w-full bg-secondary rounded-full h-1 mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#0061FF] transition-all duration-500"
                  style={{
                    width: cloudProviders.dropbox.connected && cloudProviders.dropbox.quota?.totalBytes
                      ? `${Math.min(100, Math.round((dropboxUsed / cloudProviders.dropbox.quota.totalBytes) * 100))}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </motion.div>

          {/* KPI 4: Microsoft OneDrive Storage */}
          <motion.div
            variants={itemVariants}
            onClick={() => setSelectedStorageTab('onedrive')}
            className="bento-block bento-block-interactive cursor-pointer group hover:border-sky-500/40 transition-all flex flex-col justify-between"
            title="Microsoft OneDrive Storage — click to inspect"
          >
            <div>
              <div className="flex items-center justify-between text-muted-foreground mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-sky-400 transition-colors truncate">
                  OneDrive
                </span>
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                  <OneDriveIcon size={14} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-baseline">
                {!cloudProviders.onedrive.connected ? (
                  <span className="text-sm sm:text-base font-semibold text-muted-foreground">Not linked</span>
                ) : loading ? (
                  <div className="h-7 w-20 bg-secondary/60 rounded animate-pulse" />
                ) : (
                  (() => {
                    const s = splitBytes(onedriveUsed);
                    return (
                      <>
                        <CountingNumber number={s.value} decimalPlaces={s.decimals} inView />
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground ml-1">{s.unit}</span>
                      </>
                    );
                  })()
                )}
              </div>
            </div>
            <div className="mt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                {cloudProviders.onedrive.connected ? (
                  <>
                    <span className="truncate">of {formatBytes(cloudProviders.onedrive.quota?.totalBytes || 0)}</span>
                    <span className="font-semibold text-sky-400 shrink-0 ml-1">
                      <CountingNumber
                        number={cloudProviders.onedrive.quota?.totalBytes ? Math.round((onedriveUsed / cloudProviders.onedrive.quota.totalBytes) * 100) : 0}
                        inView
                      />%
                    </span>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConnectProvider('onedrive');
                    }}
                    className="text-sky-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <span>Connect OneDrive</span>
                    <ArrowUpRight size={11} />
                  </button>
                )}
              </div>
              <div className="w-full bg-secondary rounded-full h-1 mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-[#0078D4] transition-all duration-500"
                  style={{
                    width: cloudProviders.onedrive.connected && cloudProviders.onedrive.quota?.totalBytes
                      ? `${Math.min(100, Math.round((onedriveUsed / cloudProviders.onedrive.quota.totalBytes) * 100))}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </motion.div>

          {/* KPI 5: Tracked Files */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Files</span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                <FolderOpen size={15} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              {loadingLocal ? (
                <div className="h-7 w-16 bg-secondary/60 rounded animate-pulse" />
              ) : (
                <CountingNumber number={aggregateLocalStats.fileCount} inView />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              in <CountingNumber number={aggregateLocalStats.dirCount} inView /> subdirectories
            </p>
          </motion.div>

          {/* KPI 6: Sync Engine Status */}
          <motion.div variants={itemVariants} className="bento-block bento-block-interactive">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">Engine</span>
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Zap size={15} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSyncing ? 'bg-amber-400 animate-pulse' : anyConnected ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
              <span className="text-base sm:text-lg font-bold text-foreground truncate">
                {isSyncing ? 'Syncing' : anyConnected ? 'Operational' : 'Idle'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {isSyncing ? syncProgressMsg || 'Transferring...' : anyConnected ? `${connectedCount} cloud${connectedCount > 1 ? 's' : ''} active` : 'Connect drive'}
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
                    <p className="text-xs text-muted-foreground">Monitored source folders and their assigned cloud drive</p>
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
                    Link directories from your computer to automatically mirror changes to Google Drive, Dropbox, or OneDrive.
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
                          const s = splitBytes(aggregateLocalStats.totalSize);
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
                        <CountingNumber number={aggregateLocalStats.fileCount} inView />
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[175px] overflow-y-auto pr-1">
                    {folderEntries.map((entry) => {
                      const prov = entry.folder.provider || 'google';
                      const provMeta = PROVIDER_METAS[prov];
                      return (
                        <div
                          key={entry.folder.id}
                          className="bento-subcard flex items-center justify-between gap-2 p-3 hover:border-border transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FolderOpen size={16} className="text-blue-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-foreground truncate" title={entry.folder.name}>
                                  {entry.folder.name}
                                </p>
                                {/* Cloud Drive Badge */}
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${provMeta.badgeCls}`} title={`Assigned to ${provMeta.name}`}>
                                  <ProviderLogo provider={prov} size={10} />
                                  <span className="hidden sm:inline">{provMeta.shortName}</span>
                                </span>
                              </div>
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setSelectedStructureFolder({ id: entry.folder.id, name: entry.folder.name })}
                              className="px-2 py-1 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer border border-border/50"
                              title="Inspect Folder Structure"
                            >
                              <FolderTree size={12} className="text-blue-400" />
                              <span className="hidden sm:inline">Tree</span>
                            </button>
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${cloudProviders[prov].connected ? 'bg-emerald-400' : 'bg-neutral-600'}`}
                              title={cloudProviders[prov].connected ? `${provMeta.name} Connected` : `${provMeta.name} Disconnected`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Bento Card 2: Multi-Cloud Storage Distribution (6 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-6 bento-block flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Cloud size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Cloud Storage</h3>
                    <p className="text-xs text-muted-foreground">Multi-cloud quota & storage breakdown</p>
                  </div>
                </div>

                {/* Cloud Provider Indicator Badges */}
                <div className="flex items-center gap-1.5">
                  {(['google', 'dropbox', 'onedrive'] as CloudProviderType[]).map((p) => {
                    const isConn = cloudProviders[p].connected;
                    return (
                      <span
                        key={p}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${
                          isConn
                            ? PROVIDER_METAS[p].badgeCls
                            : 'bg-secondary/40 text-muted-foreground/60 border-border/40'
                        }`}
                        title={`${PROVIDER_METAS[p].name}: ${isConn ? 'Connected' : 'Not Connected'}`}
                      >
                        <ProviderLogo provider={p} size={12} />
                        <span className="hidden sm:inline text-[11px]">{PROVIDER_METAS[p].shortName}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${isConn ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Provider Selection Tabs */}
              <div className="flex items-center gap-1 p-1 bg-secondary/50 rounded-xl mb-4 border border-border/50 text-xs overflow-x-auto">
                <button
                  onClick={() => setSelectedStorageTab('all')}
                  className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                    selectedStorageTab === 'all'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers size={13} />
                  <span>All Clouds</span>
                </button>

                {(['google', 'dropbox', 'onedrive'] as CloudProviderType[]).map((prov) => {
                  const meta = PROVIDER_METAS[prov];
                  const isConn = cloudProviders[prov].connected;
                  const isActive = selectedStorageTab === prov;
                  return (
                    <button
                      key={prov}
                      onClick={() => setSelectedStorageTab(prov)}
                      className={`flex-1 min-w-[75px] py-1.5 px-2 rounded-lg font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                        isActive
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ProviderLogo provider={prov} size={13} />
                      <span className="truncate">{meta.shortName}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConn ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              {loading ? (
                <div className="animate-pulse space-y-4 py-3">
                  <div className="h-6 w-36 bg-secondary/60 rounded" />
                  <div className="h-2 w-full bg-secondary/50 rounded" />
                  <div className="h-20 bg-secondary/30 rounded-xl" />
                </div>
              ) : selectedStorageTab === 'all' ? (
                // ── ALL CLOUDS VIEW ──
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-bold text-foreground">
                        {anyConnected ? formatBytes(totalCloudUsed) : '0 Bytes'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1.5 font-medium">
                        used of {anyConnected ? formatBytes(totalCloudCapacity) : '0 GB'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {anyConnected ? `${formatBytes(totalCloudFree)} free` : 'No storage'}
                    </span>
                  </div>

                  {/* Multi-segmented Progress Bar */}
                  <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden flex">
                    {totalCloudCapacity > 0 ? (
                      <>
                        <div
                          className="h-full bg-emerald-500 transition-all duration-700"
                          style={{ width: `${(googleUsed / totalCloudCapacity) * 100}%` }}
                          title={`Google Drive: ${formatBytes(googleUsed)}`}
                        />
                        <div
                          className="h-full bg-[#0061FF] transition-all duration-700"
                          style={{ width: `${(dropboxUsed / totalCloudCapacity) * 100}%` }}
                          title={`Dropbox: ${formatBytes(dropboxUsed)}`}
                        />
                        <div
                          className="h-full bg-[#0078D4] transition-all duration-700"
                          style={{ width: `${(onedriveUsed / totalCloudCapacity) * 100}%` }}
                          title={`OneDrive: ${formatBytes(onedriveUsed)}`}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-neutral-800" />
                    )}
                  </div>

                  {/* Provider Breakdown Cards + Storage Donut Chart */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="grid grid-cols-1 gap-2 flex-1 text-xs">
                      {/* Google Drive Row */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40 hover:border-emerald-500/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <GoogleDriveIcon size={14} />
                          <span className="font-medium text-foreground">Google Drive</span>
                        </div>
                        {cloudProviders.google.connected ? (
                          <span className="font-semibold text-foreground">
                            {formatBytes(googleUsed)}
                            <span className="text-[11px] text-muted-foreground font-normal ml-1">
                              / {formatBytes(cloudProviders.google.quota?.totalBytes || 0)}
                            </span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConnectProvider('google')}
                            className="text-[11px] text-emerald-400 hover:underline font-medium"
                          >
                            Connect
                          </button>
                        )}
                      </div>

                      {/* Dropbox Row */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40 hover:border-blue-500/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <DropboxIcon size={14} />
                          <span className="font-medium text-foreground">Dropbox</span>
                        </div>
                        {cloudProviders.dropbox.connected ? (
                          <span className="font-semibold text-foreground">
                            {formatBytes(dropboxUsed)}
                            <span className="text-[11px] text-muted-foreground font-normal ml-1">
                              / {formatBytes(cloudProviders.dropbox.quota?.totalBytes || 0)}
                            </span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConnectProvider('dropbox')}
                            className="text-[11px] text-blue-400 hover:underline font-medium"
                          >
                            Connect
                          </button>
                        )}
                      </div>

                      {/* OneDrive Row */}
                      <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40 hover:border-sky-500/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <OneDriveIcon size={14} />
                          <span className="font-medium text-foreground">Microsoft OneDrive</span>
                        </div>
                        {cloudProviders.onedrive.connected ? (
                          <span className="font-semibold text-foreground">
                            {formatBytes(onedriveUsed)}
                            <span className="text-[11px] text-muted-foreground font-normal ml-1">
                              / {formatBytes(cloudProviders.onedrive.quota?.totalBytes || 0)}
                            </span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConnectProvider('onedrive')}
                            className="text-[11px] text-sky-400 hover:underline font-medium"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Donut Chart */}
                    <div className="h-28 w-28 shrink-0 hidden sm:block">
                      <StorageChart data={activeChartData} />
                    </div>
                  </div>
                </div>
              ) : (
                // ── INDIVIDUAL CLOUD VIEW (Google Drive, Dropbox, OneDrive) ──
                (() => {
                  const prov = selectedStorageTab;
                  const meta = PROVIDER_METAS[prov];
                  const state = cloudProviders[prov];
                  const isConnected = state.connected;
                  const quota = state.quota;

                  if (!isConnected) {
                    return (
                      <div className="flex flex-col items-center justify-center text-center py-6 px-4 bento-subcard">
                        <div className="p-3 rounded-2xl bg-secondary/70 mb-2.5">
                          <ProviderLogo provider={prov} size={32} />
                        </div>
                        <p className="text-sm font-semibold text-foreground">{meta.name} Not Connected</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{meta.description}</p>
                        <button
                          onClick={() => handleConnectProvider(prov)}
                          className="mt-4 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-xl transition-all shadow-sm hover:opacity-90"
                          style={{ backgroundColor: meta.color }}
                        >
                          <ProviderLogo provider={prov} size={14} />
                          <span>Connect {meta.shortName}</span>
                          <ExternalLink size={12} />
                        </button>
                      </div>
                    );
                  }

                  const used = quota?.usedBytes || 0;
                  const total = quota?.totalBytes || 0;
                  const free = quota?.freeBytes ?? Math.max(0, total - used);
                  const pct = total > 0 ? Math.round((used / total) * 100) : 0;

                  return (
                    <div className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-2xl font-bold text-foreground">{formatBytes(used)}</span>
                          <span className="text-xs text-muted-foreground ml-1.5 font-medium">used of {formatBytes(total)}</span>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">{formatBytes(free)} free</span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: meta.color,
                          }}
                        />
                      </div>

                      {/* Breakdown Legend and Chart */}
                      <div className="flex items-center justify-between gap-4 pt-1">
                        <div className="grid grid-cols-1 gap-2 flex-1 text-xs">
                          {prov === 'google' && state.driveDetails ? (
                            <>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                  <span className="text-muted-foreground">In Drive</span>
                                </div>
                                <span className="font-semibold text-foreground">
                                  {formatBytes(state.driveDetails.driveUsed)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                                <div className="flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                  <span className="text-muted-foreground">In Trash</span>
                                </div>
                                <span className="font-semibold text-foreground">
                                  {formatBytes(state.driveDetails.trashUsed)}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                                <span className="text-muted-foreground">Used Storage</span>
                              </div>
                              <span className="font-semibold text-foreground">{formatBytes(used)}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/40 border border-border/40">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
                              <span className="text-muted-foreground">Available Space</span>
                            </div>
                            <span className="font-semibold text-foreground">{formatBytes(free)}</span>
                          </div>

                          {state.user && (
                            <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/30 text-[11px] text-muted-foreground">
                              <span>Account:</span>
                              <span className="font-medium text-foreground truncate max-w-[150px]">{state.user.email || state.user.name}</span>
                            </div>
                          )}
                        </div>

                        <div className="h-28 w-28 shrink-0 hidden sm:block">
                          <StorageChart data={activeChartData} />
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </motion.div>

          {/* Bento Card 3: Action Hub (4 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-4 bento-block flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Action Hub</h3>
                    <p className="text-xs text-muted-foreground">Instant multi-cloud sync tools</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
                <button
                  onClick={handleQuickSync}
                  disabled={isSyncing || folderEntries.length === 0 || !anyConnected}
                  className="bento-subcard flex items-center justify-between p-3 text-left hover:border-primary/50 group transition-all disabled:opacity-50"
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
                  disabled={filteredRecentFiles.length === 0}
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
                Multi-Cloud PKCE
              </span>
              <span className="font-mono text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">v1.2</span>
            </div>
          </motion.div>

          {/* Bento Card 4: Recent Cloud Activity (8 cols) */}
          <motion.div variants={itemVariants} className="md:col-span-12 lg:col-span-8 bento-block flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base">Recent Cloud Activity</h3>
                    <p className="text-xs text-muted-foreground">Recently modified items across your cloud drives</p>
                  </div>
                </div>

                {/* Filter and Export Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter activity..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="px-2.5 py-1 text-xs bg-secondary/70 border border-border/70 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all w-32 sm:w-40"
                  />
                  <button
                    onClick={handleExport}
                    disabled={filteredRecentFiles.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-foreground bg-secondary/80 hover:bg-secondary border border-border/80 rounded-lg transition-colors disabled:opacity-40"
                  >
                    <Download size={13} />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
              </div>

              {/* Provider Filter Badges */}
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setActivityProviderFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                    activityProviderFilter === 'all'
                      ? 'bg-foreground text-background'
                      : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers size={12} />
                  <span>All ({recentFiles.length})</span>
                </button>

                {(['google', 'dropbox', 'onedrive'] as CloudProviderType[]).map((prov) => {
                  const meta = PROVIDER_METAS[prov];
                  const count = providerFileCounts[prov];
                  const isSelected = activityProviderFilter === prov;
                  return (
                    <button
                      key={prov}
                      onClick={() => setActivityProviderFilter(prov)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                        isSelected
                          ? 'bg-foreground text-background'
                          : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <ProviderLogo provider={prov} size={12} />
                      <span>{meta.shortName} ({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Activity List */}
              {!anyConnected ? (
                <div className="p-8 text-center bento-subcard">
                  <Cloud className="w-10 h-10 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">No Cloud Accounts Connected</p>
                  <p className="text-xs text-muted-foreground mt-1">Connect Google Drive, Dropbox, or OneDrive to view recent activity.</p>
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
                    {paginatedRecentFiles.map((item, i) => {
                      const meta = PROVIDER_METAS[item.provider] || PROVIDER_METAS.google;
                      return (
                        <div
                          key={item.id || i}
                          onClick={() => {
                            setPreviewFile({
                              id: item.id,
                              name: item.name,
                              path: item.path || item.name,
                              mimeType: item.mimeType,
                              size: item.size,
                              sizeBytes: item.sizeBytes,
                              date: item.date,
                              status: 'Synced',
                              driveId: item.driveId || item.id,
                              isDirectory: item.isDirectory,
                              thumbnailLink: item.thumbnailLink,
                              iconLink: item.iconLink,
                            });
                          }}
                          className="p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-secondary/70 transition-colors duration-150 cursor-pointer group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-secondary/80 text-muted-foreground group-hover:text-foreground shrink-0">
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
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium ${meta.badgeCls}`}>
                                  <ProviderLogo provider={item.provider} size={10} />
                                  {meta.name}
                                </span>
                                <span>·</span>
                                <span>{item.size}</span>
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-medium shrink-0">
                            {new Date(item.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
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
                  <p className="text-sm font-semibold text-foreground">No matching cloud activity</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activitySearch
                      ? 'No files found matching your search filter.'
                      : 'Files synced to your cloud drives will appear here.'}
                  </p>
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

      {/* ── Folder Structure Modal ── */}
      {selectedStructureFolder && (
        <FolderStructureModal
          isOpen={!!selectedStructureFolder}
          onClose={() => setSelectedStructureFolder(null)}
          folderId={selectedStructureFolder.id}
          folderName={selectedStructureFolder.name}
        />
      )}
    </div>
  );
});

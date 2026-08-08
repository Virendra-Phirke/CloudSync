'use client';
import { Folder, HardDrive, Cloud, FileText, CheckCircle2, Clock, AlertCircle, UploadCloud, File as FileIcon, Download, Loader2, FolderOpen } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fetchDriveQuota, fetchDriveFiles, DriveFile, DriveQuota } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import { getLocalFolders, getLocalFolderById, getFolderStats, getLocalFolderInfos, FolderStats, SyncFolder } from '../lib/localFolder';
import { FilePreviewModal } from './FilePreviewModal';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  // Truncate instead of round to prevent 4.999 TB showing as 5 TB
  const factor = Math.pow(10, dm);
  const truncated = Math.floor(val * factor) / factor;
  return `${truncated} ${sizes[i]}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const val = typeof payload[0].value === 'number' && payload[0].value > 1000 
      ? formatBytes(payload[0].value) 
      : `${payload[0].value} GB`;
    return (
      <div className="bg-neutral-800 border border-neutral-700 p-2 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-neutral-200">{`${payload[0].name}: ${val}`}</p>
      </div>
    );
  }
  return null;
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

  // File Preview Modal state
  const [previewFile, setPreviewFile] = useState<any>(null);

  const loadDriveData = useCallback(async () => {
    setLoading(true);
    try {
      const [q, f] = await Promise.all([
        fetchDriveQuota(),
        fetchDriveFiles()
      ]);
      setQuota(q);
      
      const sorted = f.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
      setRecentFiles(sorted.slice(0, 5));
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
      
      // Initialize entries with loading state
      const entries: FolderWithStats[] = infos.map(f => ({ folder: f, stats: null, loading: true }));
      setFolderEntries(entries);
      
      // Load stats for each folder in parallel
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

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <header className="px-8 max-md:pl-20 py-6 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-950/95 z-10">
        <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Dashboard</h2>
      </header>
      
      <div className="p-4 md:p-8 space-y-8 flex-1">
        
        {/* ── Storage Stats ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeInUp">
          
          {/* Local Folders Storage (Aggregate) */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <Folder size={20} />
                </div>
                <h3 className="font-medium text-neutral-300">Local PC Folders</h3>
              </div>
              {folderEntries.length > 0 && (
                <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">
                  {folderEntries.length} folder{folderEntries.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {loadingLocal ? (
              <div className="animate-pulse">
                <div className="flex items-baseline gap-2 mb-1">
                  <div className="h-8 w-32 bg-neutral-800 rounded-lg"></div>
                  <div className="h-4 w-40 bg-neutral-800/50 rounded"></div>
                </div>
                <div className="bg-neutral-800/30 rounded-xl p-4 grid grid-cols-3 gap-4 mt-4 mb-5">
                  <div className="space-y-2">
                    <div className="h-3 w-10 bg-neutral-800/50 rounded"></div>
                    <div className="h-6 w-16 bg-neutral-800 rounded"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-12 bg-neutral-800/50 rounded"></div>
                    <div className="h-6 w-16 bg-neutral-800 rounded"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-14 bg-neutral-800/50 rounded"></div>
                    <div className="h-6 w-12 bg-neutral-800 rounded"></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="shrink-0 bg-neutral-800/20 border border-neutral-800/50 rounded-xl px-3.5 py-2.5 w-[140px] h-[52px]"></div>
                  ))}
                </div>
              </div>
            ) : folderEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-6">
                <HardDrive className="w-10 h-10 text-neutral-700 mb-2" />
                <p className="text-sm font-medium text-neutral-300">No folders added</p>
                <p className="text-xs text-neutral-500 mt-1">Go to Files tab to add a folder</p>
              </div>
            ) : (
              <>
                {/* Aggregate stats */}
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-neutral-100">{formatBytes(aggregateStats.totalSize)}</span>
                  <span className="text-neutral-400 font-medium">total across all folders</span>
                </div>

                <div className="bg-neutral-800/50 rounded-xl p-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Files</p>
                    <p className="text-xl font-semibold text-neutral-200">{aggregateStats.fileCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Folders</p>
                    <p className="text-xl font-semibold text-neutral-200">{aggregateStats.dirCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Sources</p>
                    <p className="text-xl font-semibold text-neutral-200">{folderEntries.length}</p>
                  </div>
                </div>
                
                {/* Per-folder breakdown (horizontal scroll) */}
                <div className="flex gap-2 overflow-x-auto pb-1 mt-1 stagger-children">
                  {folderEntries.map((entry) => (
                    <div
                      key={entry.folder.id}
                      className="shrink-0 bg-neutral-800/40 border border-neutral-700/50 rounded-xl px-3.5 py-2.5 min-w-[140px]"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <FolderOpen size={13} className="text-blue-400 shrink-0" />
                        <p className="text-xs font-medium text-neutral-300 truncate">{entry.folder.name}</p>
                      </div>
                      {entry.loading ? (
                        <div className="h-3 w-20 bg-neutral-800 rounded animate-pulse" />
                      ) : entry.stats ? (
                        <p className="text-[11px] text-neutral-500">
                          {entry.stats.fileCount} files · {formatBytes(entry.stats.totalSize)}
                        </p>
                      ) : (
                        <p className="text-[11px] text-neutral-600">No access</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Google Drive Storage */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 w-full min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <Cloud size={20} />
                </div>
                <h3 className="font-medium text-neutral-300">Google Drive Storage</h3>
              </div>

              {!user ? (
                <p className="text-sm text-neutral-500 py-6">Connect your Google account to see storage details</p>
              ) : loading ? (
                <div className="animate-pulse py-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="h-8 w-24 bg-neutral-800 rounded-lg"></div>
                    <div className="h-4 w-32 bg-neutral-800/50 rounded"></div>
                  </div>
                  <div className="w-full bg-neutral-800/50 rounded-full h-1.5 mt-4 mb-3"></div>
                  <div className="flex justify-between mt-3">
                    <div className="h-3 w-20 bg-neutral-800/50 rounded"></div>
                    <div className="h-3 w-16 bg-neutral-800/50 rounded"></div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold text-neutral-100">{cloudUsedStr}</span>
                    <span className="text-neutral-400 font-medium">of {cloudTotalStr} used</span>
                  </div>

                  <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-3 mb-3 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ease-out ${cloudUsedPercent > 80 ? 'bg-red-500' : cloudUsedPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(cloudUsedPercent, 100)}%` }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 text-xs text-neutral-400 mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>In Drive: <span className="text-neutral-200">{driveUsedStr}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>In Trash: <span className="text-neutral-200">{trashUsedStr}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-neutral-700" />
                      <span>Free Space: <span className="text-neutral-200">{cloudFreeStr}</span></span>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {user && !loading && (
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={driveBreakdownData}
                      innerRadius={38}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {driveBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* ── Activity Log ── */}
        <section className="animate-fadeInUp" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-100">Recent Drive Activity</h3>
            <button 
              onClick={handleExport}
              disabled={recentFiles.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              Export
            </button>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
            {!user ? (
               <div className="p-12 text-center">
                 <Cloud className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                 <p className="text-sm font-medium text-neutral-300">Not connected</p>
                 <p className="text-xs text-neutral-500 mt-1">Connect your Google account to see recent activity</p>
               </div>
            ) : loadingRecent ? (
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-transparent animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-neutral-800 rounded-xl" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-neutral-800 rounded" />
                      <div className="h-3 w-24 bg-neutral-800/50 rounded" />
                    </div>
                  </div>
                  <div className="h-3 w-16 bg-neutral-800/50 rounded" />
                </div>
              ))}
            </div>
          ) : recentFiles.length > 0 ? (
              <div className="divide-y divide-neutral-800 stagger-children">
                {recentFiles.map((item, i) => (
                  <div 
                    key={i} 
                    className="p-4 flex items-center justify-between hover:bg-neutral-800/50 transition-colors duration-150 cursor-pointer group"
                    onClick={() => {
                      setPreviewFile({
                        id: item.id,
                        name: item.name,
                        path: item.name, // Path is mocked as name since we don't have local folder structure
                        mimeType: item.mimeType,
                        size: formatBytes(parseInt(item.size || '0')),
                        sizeBytes: parseInt(item.size || '0'),
                        date: new Date(item.modifiedTime).toLocaleDateString(),
                        status: 'Synced', // Assume synced since it's in recent drive activity
                        driveId: item.id,
                        isDirectory: item.mimeType === 'application/vnd.google-apps.folder',
                        thumbnailLink: item.thumbnailLink,
                        iconLink: item.iconLink,
                      });
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-emerald-500/10 text-emerald-400`}>
                        {item.iconLink ? (
                          <img src={item.iconLink} alt="Icon" className="w-[18px] h-[18px] object-contain group-hover:scale-110 transition-transform" />
                        ) : (
                          <FileIcon size={18} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-200 text-sm truncate max-w-[200px] group-hover:text-emerald-400 transition-colors" title={item.name}>{item.name}</p>
                        <p className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          Modified in Cloud
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-neutral-500 font-medium group-hover:text-neutral-400 transition-colors">
                      {new Date(item.modifiedTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="flex flex-col items-center justify-center text-neutral-500">
                  <Clock className="w-10 h-10 mb-3 text-neutral-700" />
                  <p className="text-sm font-medium text-neutral-300">No recent activity</p>
                  <p className="text-xs mt-1">Files modified in Drive will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

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

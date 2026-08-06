'use client';
import { Folder, HardDrive, Cloud, FileText, CheckCircle2, Clock, AlertCircle, UploadCloud, File as FileIcon, Download, Loader2 } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fetchDriveQuota, fetchDriveFiles, DriveFile, DriveQuota } from '../lib/drive';
import { initAuth, OAuthUser } from '../lib/oauth';
import { getLocalFolder, getFolderStats, getLocalFolderInfo, FolderStats, FolderInfo } from '../lib/localFolder';

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

export const Dashboard = React.memo(function Dashboard() {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [quota, setQuota] = useState<DriveQuota | null>(null);
  const [recentFiles, setRecentFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Local folder state
  const [localFolderInfo, setLocalFolderInfo] = useState<FolderInfo | null>(null);
  const [localStats, setLocalStats] = useState<FolderStats | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);

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
      const info = await getLocalFolderInfo();
      setLocalFolderInfo(info);
      if (info) {
        const handle = await getLocalFolder();
        if (handle) {
          const stats = await getFolderStats(handle);
          setLocalStats(stats);
        }
      }
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
      <header className="px-8 py-6 border-b border-neutral-800 flex items-center justify-between sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Dashboard</h2>
      </header>
      
      <div className="p-8 space-y-8 flex-1">
        
        {/* ── Storage Stats ── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Local Folder Storage */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <Folder size={20} />
                </div>
                <h3 className="font-medium text-neutral-300">Local PC Folder</h3>
              </div>
            </div>

            {loadingLocal ? (
              <div className="flex items-center gap-2 text-neutral-400 py-8 justify-center">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading local folder...</span>
              </div>
            ) : !localFolderInfo ? (
              <div className="flex flex-col items-center justify-center text-center py-6">
                <HardDrive className="w-10 h-10 text-neutral-700 mb-2" />
                <p className="text-sm font-medium text-neutral-300">No folder selected</p>
                <p className="text-xs text-neutral-500 mt-1">Go to Settings to pick a PC folder</p>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-neutral-100">{localStats ? formatBytes(localStats.totalSize) : '--'}</span>
                  <span className="text-neutral-400 font-medium">total size</span>
                </div>
                
                <p className="text-xs text-blue-400 font-medium truncate mb-4">
                  📁 {localFolderInfo.name}
                </p>

                <div className="bg-neutral-800/50 rounded-xl p-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Files</p>
                    <p className="text-xl font-semibold text-neutral-200">{localStats?.fileCount ?? '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Folders</p>
                    <p className="text-xl font-semibold text-neutral-200">{localStats?.dirCount ?? '--'}</p>
                  </div>
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
                <div className="flex items-center gap-2 text-neutral-400 py-6">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading Drive stats...</span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl font-bold text-neutral-100">{cloudUsedStr}</span>
                    <span className="text-neutral-400 font-medium">of {cloudTotalStr} used</span>
                  </div>

                  <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-3 mb-3 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all ${cloudUsedPercent > 80 ? 'bg-red-500' : cloudUsedPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
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
        <section>
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
            ) : loading ? (
               <div className="p-12 text-center">
                 <Loader2 size={32} className="text-blue-500 animate-spin mx-auto mb-3" />
                 <p className="text-sm font-medium text-neutral-300">Loading activity...</p>
               </div>
            ) : recentFiles.length > 0 ? (
              <div className="divide-y divide-neutral-800">
                {recentFiles.map((item, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-neutral-800/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg bg-emerald-500/10 text-emerald-400`}>
                        {item.iconLink ? (
                          <img src={item.iconLink} alt="Icon" className="w-[18px] h-[18px] object-contain" />
                        ) : (
                          <FileIcon size={18} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-neutral-200 text-sm truncate max-w-[200px]" title={item.name}>{item.name}</p>
                        <p className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 size={12} className="text-emerald-400" />
                          Modified in Cloud
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-neutral-500 font-medium">
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
    </div>
  );
});

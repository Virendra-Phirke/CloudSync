'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle, HardDrive, Cloud, FileCode, CheckCircle2,
  Columns, AlignLeft, Maximize2, Minimize2, X, Loader2,
  ImageIcon, FileText, ArrowRight, Check, Eye
} from 'lucide-react';
import { ConflictItem } from '../lib/syncBiDirectional';
import { getDriveFileBlob } from '../lib/drive';
import {
  computeDiff, isDiffableText, isImageFile,
  DiffResult, SideBySideRow, UnifiedRow
} from '../lib/diffUtils';

interface ConflictResolverModalProps {
  isOpen: boolean;
  conflicts: ConflictItem[];
  onResolve: (resolution: 'local' | 'drive' | 'skip') => void;
}

type ViewMode = 'split' | 'unified' | 'summary';

function formatBytes(bytes: number) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function ConflictResolverModal({ isOpen, conflicts, onResolve }: ConflictResolverModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localText, setLocalText] = useState<string | null>(null);
  const [driveText, setDriveText] = useState<string | null>(null);
  const [localImgUrl, setLocalImgUrl] = useState<string | null>(null);
  const [driveImgUrl, setDriveImgUrl] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const currentConflict = conflicts.length > 0 ? conflicts[0] : null;

  // Synchronized scrolling for split view
  const handleScroll = (source: 'left' | 'right') => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    const master = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const slave = source === 'left' ? rightScrollRef.current : leftScrollRef.current;

    if (master && slave) {
      slave.scrollTop = master.scrollTop;
      slave.scrollLeft = master.scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // Load contents when conflict changes
  useEffect(() => {
    if (!isOpen || !currentConflict) {
      setLocalText(null);
      setDriveText(null);
      setLocalImgUrl(null);
      setDriveImgUrl(null);
      setDiffResult(null);
      return;
    }

    let isMounted = true;
    const filename = currentConflict.path.split('/').pop() || currentConflict.path;
    const isText = isDiffableText(filename, currentConflict.mimeType);
    const isImage = isImageFile(filename, currentConflict.mimeType);

    async function loadContents() {
      setLoading(true);
      try {
        let driveBlob: Blob | null = null;
        if (currentConflict?.driveFileId) {
          try {
            driveBlob = await getDriveFileBlob(currentConflict.driveFileId);
          } catch (e) {
            console.warn('Failed to fetch drive blob:', e);
          }
        }

        if (!isMounted) return;

        if (isText) {
          // Read local text
          let lText = '';
          if (currentConflict?.localFile) {
            lText = await currentConflict.localFile.text();
          }

          // Read drive text
          let dText = '';
          if (driveBlob) {
            dText = await driveBlob.text();
          }

          if (isMounted) {
            setLocalText(lText);
            setDriveText(dText);
            const diff = computeDiff(lText, dText);
            setDiffResult(diff);
            setViewMode('split');
          }
        } else if (isImage) {
          if (currentConflict?.localFile) {
            setLocalImgUrl(URL.createObjectURL(currentConflict.localFile));
          }
          if (driveBlob) {
            setDriveImgUrl(URL.createObjectURL(driveBlob));
          }
          setViewMode('summary');
        } else {
          setViewMode('summary');
        }
      } catch (err) {
        console.error('Error loading conflict files:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadContents();

    return () => {
      isMounted = false;
      if (localImgUrl) URL.revokeObjectURL(localImgUrl);
      if (driveImgUrl) URL.revokeObjectURL(driveImgUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentConflict]);

  if (!isOpen || !currentConflict) return null;

  const filename = currentConflict.path.split('/').pop() || currentConflict.path;
  const isText = isDiffableText(filename, currentConflict.mimeType);
  const isImage = isImageFile(filename, currentConflict.mimeType);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/85 backdrop-blur-md"
        onClick={() => onResolve('skip')}
      />

      {/* Modal Window */}
      <div
        className={`relative bg-card text-card-foreground border border-border shadow-2xl overflow-hidden flex flex-col transition-all duration-200 z-10 ${
          isFullscreen
            ? 'fixed inset-2 sm:inset-4 rounded-2xl'
            : isText
              ? 'w-full max-w-6xl h-[88vh] rounded-2xl'
              : 'w-full max-w-2xl max-h-[85vh] rounded-2xl'
        }`}
      >
        {/* ── Modal Header ── */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-border bg-card/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate">
                <h2 className="text-sm sm:text-base font-bold text-foreground truncate" title={currentConflict.path}>
                  Conflict: {filename}
                </h2>
                {conflicts.length > 1 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    1 of {conflicts.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate" title={currentConflict.path}>
                {currentConflict.path}
              </p>
            </div>
          </div>

          {/* Controls: Mode toggle + Fullscreen + Close */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {isText && diffResult && (
              <div className="hidden sm:flex items-center gap-1 bg-secondary/80 border border-border/80 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'split'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Side-by-side split view"
                >
                  <Columns size={13} />
                  <span>Split</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('unified')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'unified'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Unified patch view"
                >
                  <AlignLeft size={13} />
                  <span>Unified</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'summary'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Summary view"
                >
                  <FileText size={13} />
                  <span>Summary</span>
                </button>
              </div>
            )}

            {isText && diffResult && (
              <div className="hidden md:flex items-center gap-1 text-[11px] font-mono font-medium px-2 py-1 rounded-lg bg-secondary/60 border border-border/60">
                <span className="text-emerald-500">+{diffResult.stats.additions}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-destructive">-{diffResult.stats.deletions}</span>
              </div>
            )}

            {isText && (
              <button
                type="button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={isFullscreen ? 'Restore' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}

            <button
              type="button"
              onClick={() => onResolve('skip')}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Modal Body ── */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-background/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-12">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Comparing local file with cloud version...</p>
            </div>
          ) : isText && diffResult && viewMode === 'split' ? (
            /* ═══════════ SIDE-BY-SIDE SPLIT VIEW ═══════════ */
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Column Headers */}
              <div className="grid grid-cols-2 border-b border-border bg-secondary/40 shrink-0 text-xs font-medium">
                {/* Left: Local Header */}
                <div className="p-3 border-r border-border flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <div className="p-1 rounded-md bg-primary/10 text-primary">
                      <HardDrive size={14} />
                    </div>
                    <span className="font-bold text-foreground">Local Version</span>
                    <span className="text-muted-foreground text-[11px] truncate hidden sm:inline">
                      {new Date(currentConflict.localLastModified).toLocaleTimeString()} · {formatBytes(currentConflict.localSize || 0)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolve('local')}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:opacity-90 rounded-lg transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    Keep Local
                  </button>
                </div>

                {/* Right: Drive Header */}
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
                      <Cloud size={14} />
                    </div>
                    <span className="font-bold text-foreground">Drive (Cloud) Version</span>
                    <span className="text-muted-foreground text-[11px] truncate hidden sm:inline">
                      {new Date(currentConflict.driveLastModified).toLocaleTimeString()} · {formatBytes(currentConflict.driveSize || 0)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolve('drive')}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    Keep Drive
                  </button>
                </div>
              </div>

              {/* Synchronized Diff Rows */}
              <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-border font-mono text-xs overflow-hidden">
                {/* Left Pane */}
                <div
                  ref={leftScrollRef}
                  onScroll={() => handleScroll('left')}
                  className="overflow-auto h-full hide-scrollbar select-text"
                >
                  <table className="w-full border-collapse">
                    <tbody>
                      {diffResult.sideBySide.map((row) => {
                        const cell = row.left;
                        const isDel = cell.type === 'delete';
                        const isMod = cell.type === 'modify';
                        const isEmpty = cell.type === 'empty';

                        return (
                          <tr
                            key={row.id}
                            className={`leading-5 ${
                              isDel
                                ? 'bg-red-500/15 text-red-300'
                                : isMod
                                  ? 'bg-amber-500/15 text-amber-200'
                                  : isEmpty
                                    ? 'bg-secondary/20 text-transparent select-none'
                                    : 'text-foreground/90 hover:bg-secondary/30'
                            }`}
                          >
                            <td className="w-10 px-2 py-0.5 text-right text-[11px] text-muted-foreground/60 select-none border-r border-border/40 font-sans">
                              {cell.lineNum ?? ''}
                            </td>
                            <td className="px-3 py-0.5 whitespace-pre font-mono break-all">
                              {isMod && cell.charDiffs ? (
                                cell.charDiffs.map((chunk, idx) => (
                                  <span
                                    key={idx}
                                    className={chunk.changed ? 'bg-red-500/30 rounded px-0.5 underline decoration-red-400' : ''}
                                  >
                                    {chunk.text}
                                  </span>
                                ))
                              ) : (
                                cell.text || (isEmpty ? ' ' : '')
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Right Pane */}
                <div
                  ref={rightScrollRef}
                  onScroll={() => handleScroll('right')}
                  className="overflow-auto h-full hide-scrollbar select-text"
                >
                  <table className="w-full border-collapse">
                    <tbody>
                      {diffResult.sideBySide.map((row) => {
                        const cell = row.right;
                        const isIns = cell.type === 'insert';
                        const isMod = cell.type === 'modify';
                        const isEmpty = cell.type === 'empty';

                        return (
                          <tr
                            key={row.id}
                            className={`leading-5 ${
                              isIns
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : isMod
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : isEmpty
                                    ? 'bg-secondary/20 text-transparent select-none'
                                    : 'text-foreground/90 hover:bg-secondary/30'
                            }`}
                          >
                            <td className="w-10 px-2 py-0.5 text-right text-[11px] text-muted-foreground/60 select-none border-r border-border/40 font-sans">
                              {cell.lineNum ?? ''}
                            </td>
                            <td className="px-3 py-0.5 whitespace-pre font-mono break-all">
                              {isMod && cell.charDiffs ? (
                                cell.charDiffs.map((chunk, idx) => (
                                  <span
                                    key={idx}
                                    className={chunk.changed ? 'bg-emerald-500/30 rounded px-0.5 font-bold' : ''}
                                  >
                                    {chunk.text}
                                  </span>
                                ))
                              ) : (
                                cell.text || (isEmpty ? ' ' : '')
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : isText && diffResult && viewMode === 'unified' ? (
            /* ═══════════ UNIFIED DIFF VIEW ═══════════ */
            <div className="flex-1 min-h-0 overflow-auto font-mono text-xs select-text">
              <table className="w-full border-collapse">
                <tbody>
                  {diffResult.unified.map((row) => {
                    const isAdd = row.type === 'insert';
                    const isDel = row.type === 'delete';

                    return (
                      <tr
                        key={row.id}
                        className={`leading-5 ${
                          isAdd
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : isDel
                              ? 'bg-red-500/15 text-red-300'
                              : 'text-foreground/90 hover:bg-secondary/30'
                        }`}
                      >
                        <td className="w-10 px-2 py-0.5 text-right text-[11px] text-muted-foreground/60 select-none border-r border-border/40 font-sans">
                          {row.oldLineNum ?? ''}
                        </td>
                        <td className="w-10 px-2 py-0.5 text-right text-[11px] text-muted-foreground/60 select-none border-r border-border/40 font-sans">
                          {row.newLineNum ?? ''}
                        </td>
                        <td className="w-6 text-center select-none font-bold">
                          {isAdd ? '+' : isDel ? '-' : ' '}
                        </td>
                        <td className="px-3 py-0.5 whitespace-pre font-mono break-all">
                          {row.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : isImage ? (
            /* ═══════════ IMAGE COMPARISON VIEW ═══════════ */
            <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex flex-col justify-center">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
                {/* Local Image */}
                <div className="bento-subcard p-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-foreground">
                    <HardDrive size={15} className="text-primary" />
                    <span>Local Version</span>
                  </div>
                  <div className="w-full aspect-video bg-secondary/50 rounded-xl overflow-hidden flex items-center justify-center border border-border mb-3">
                    {localImgUrl ? (
                      <img src={localImgUrl} alt="Local version" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Preview unavailable</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Modified: {new Date(currentConflict.localLastModified).toLocaleString()}
                    {currentConflict.localSize ? ` · ${formatBytes(currentConflict.localSize)}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => onResolve('local')}
                    className="w-full py-2 px-3 bg-primary hover:opacity-90 text-primary-foreground font-semibold rounded-xl text-xs transition-all cursor-pointer shadow-xs"
                  >
                    Keep Local Image
                  </button>
                </div>

                {/* Drive Image */}
                <div className="bento-subcard p-4 flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-3 font-semibold text-sm text-foreground">
                    <Cloud size={15} className="text-emerald-500" />
                    <span>Google Drive Version</span>
                  </div>
                  <div className="w-full aspect-video bg-secondary/50 rounded-xl overflow-hidden flex items-center justify-center border border-border mb-3">
                    {driveImgUrl ? (
                      <img src={driveImgUrl} alt="Cloud version" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Preview unavailable</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Modified: {new Date(currentConflict.driveLastModified).toLocaleString()}
                    {currentConflict.driveSize ? ` · ${formatBytes(currentConflict.driveSize)}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => onResolve('drive')}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-all cursor-pointer shadow-xs"
                  >
                    Keep Drive Image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ═══════════ SUMMARY / METADATA COMPARISON ═══════════ */
            <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 flex flex-col justify-center">
              <div className="max-w-2xl mx-auto w-full space-y-4">
                <div className="text-center mb-6">
                  <h3 className="text-base font-bold text-foreground">Review Conflict Details</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Both versions were updated concurrently. Choose which source to preserve.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Local Card */}
                  <div
                    onClick={() => onResolve('local')}
                    className="bento-subcard p-4 flex flex-col justify-between hover:border-primary/50 transition-all cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                          <HardDrive size={16} />
                        </div>
                        <span className="font-bold text-foreground text-sm">Keep Local File</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        Overwrites the cloud copy with your local machine version.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/50 text-[11px] font-mono text-muted-foreground space-y-1">
                      <div>Modified: {new Date(currentConflict.localLastModified).toLocaleString()}</div>
                      {currentConflict.localSize ? <div>Size: {formatBytes(currentConflict.localSize)}</div> : null}
                    </div>
                  </div>

                  {/* Drive Card */}
                  <div
                    onClick={() => onResolve('drive')}
                    className="bento-subcard p-4 flex flex-col justify-between hover:border-emerald-500/50 transition-all cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                          <Cloud size={16} />
                        </div>
                        <span className="font-bold text-foreground text-sm">Keep Drive File</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        Downloads Google Drive version, replacing your local copy.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border/50 text-[11px] font-mono text-muted-foreground space-y-1">
                      <div>Modified: {new Date(currentConflict.driveLastModified).toLocaleString()}</div>
                      {currentConflict.driveSize ? <div>Size: {formatBytes(currentConflict.driveSize)}</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="p-3.5 sm:p-4 border-t border-border bg-card/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-muted-foreground">
            {diffResult ? (
              <span>
                Comparison: <strong className="text-foreground">{diffResult.stats.totalOldLines}</strong> local lines vs{' '}
                <strong className="text-foreground">{diffResult.stats.totalNewLines}</strong> drive lines
              </span>
            ) : (
              <span>Select the version you want to preserve for this sync.</span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => onResolve('skip')}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors cursor-pointer"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={() => onResolve('local')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-primary hover:opacity-90 text-primary-foreground rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <HardDrive size={13} />
              <span>Keep Local</span>
            </button>
            <button
              type="button"
              onClick={() => onResolve('drive')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Cloud size={13} />
              <span>Keep Drive</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight,
  Download, ExternalLink, FileText, Image as ImageIcon,
  Film, Music, FileCode, FileArchive, File as FileIcon,
  Folder, Maximize2, Minimize2, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { getDriveFileBlob, updateDriveFile } from '../lib/drive';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FilePreviewProps {
  file: {
    id: string;
    name: string;
    path: string;
    mimeType?: string;
    size: string;
    sizeBytes: number;
    date: string;
    status: string;
    driveId?: string;
    isDirectory: boolean;
    handle?: any;
    thumbnailLink?: string;
    iconLink?: string;
  };
  onClose: () => void;
  statusBadge: Record<string, { cls: string; icon: React.ReactNode; label: string }>;
}

import {
  getFileExtension, detectViewerType, getFileTypeInfo, ViewerType
} from '../lib/fileUtils';

// ─── Accessible Icon Button ────────────────────────────────────────────────────

function IconButton({
  onClick, disabled, label, children, className = '',
}: {
  onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
        disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-neutral-800 active:scale-95 text-neutral-300 hover:text-neutral-100'
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ─── PDF Viewer (Fixed) ────────────────────────────────────────────────────────

function PdfViewer({ file }: { file: File }) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1.0);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

        const arrayBuf = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) }).promise;

        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        if (!cancelled) {
          setError(err.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [file]);

  // Render current page — triggers whenever doc loads, page changes, or scale changes
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current || loading) return;

    let cancelled = false;

    async function renderPage() {
      // Cancel any in-progress render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }

      setRendering(true);
      try {
        const doc = pdfDocRef.current;
        const page = await doc.getPage(currentPage);

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Account for device pixel ratio for crisp rendering on HiDPI screens
        const dpr = window.devicePixelRatio || 1;
        const baseViewport = page.getViewport({ scale: 1 });
        const desiredScale = scale * 1.5; // Base multiplier for readability
        const viewport = page.getViewport({ scale: desiredScale * dpr });

        // Set canvas physical size to match the viewport at device pixel ratio
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Set CSS display size (scaled down by dpr so it looks correct)
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (!cancelled) setRendering(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException' && !cancelled) {
          console.error('PDF render error:', err);
          setRendering(false);
        }
      }
    }

    renderPage();
    return () => { cancelled = true; };
  }, [currentPage, scale, loading, numPages]);

  // Keyboard navigation for PDF
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(numPages, p + 1));
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale(s => Math.min(3, s + 0.25));
      } else if (e.key === '-') {
        e.preventDefault();
        setScale(s => Math.max(0.5, s - 0.25));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [numPages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Loading PDF">
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 size={32} className="animate-spin text-red-400" />
          <span className="text-sm text-neutral-400">Loading PDF...</span>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center" role="alert">
        <motion.div
          className="flex flex-col items-center gap-3 text-center px-6"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <AlertCircle size={36} className="text-red-400" />
          <p className="text-neutral-300 font-medium">Failed to load PDF</p>
          <p className="text-neutral-500 text-sm max-w-xs">{error}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" role="document" aria-label={`PDF viewer, page ${currentPage} of ${numPages}`}>
      {/* PDF Controls */}
      <motion.div
        className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900/90"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <nav className="flex items-center gap-1" aria-label="Page navigation">
          <IconButton onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} label="Previous page">
            <ChevronLeft size={18} />
          </IconButton>
          <span className="text-sm text-neutral-300 font-medium min-w-[80px] text-center select-none" aria-live="polite">
            {currentPage} / {numPages}
          </span>
          <IconButton onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages} label="Next page">
            <ChevronRight size={18} />
          </IconButton>
        </nav>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom controls">
          <IconButton onClick={() => setScale(s => Math.max(0.5, s - 0.25))} label="Zoom out">
            <ZoomOut size={16} />
          </IconButton>
          <span className="text-xs text-neutral-400 min-w-[44px] text-center select-none" aria-live="polite">{Math.round(scale * 100)}%</span>
          <IconButton onClick={() => setScale(s => Math.min(3, s + 0.25))} label="Zoom in">
            <ZoomIn size={16} />
          </IconButton>
        </div>
      </motion.div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-6 bg-neutral-950 relative">
        {rendering && (
          <div className="absolute top-4 right-4 z-10">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="bg-neutral-800/90 rounded-full px-3 py-1.5 flex items-center gap-2"
            >
              <Loader2 size={12} className="animate-spin text-blue-400" />
              <span className="text-xs text-neutral-400">Rendering...</span>
            </motion.div>
          </div>
        )}
        <motion.canvas
          ref={canvasRef}
          className="rounded-lg shadow-2xl"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          aria-label={`PDF page ${currentPage}`}
          role="img"
        />
      </div>
    </div>
  );
}

// ─── Image Viewer ──────────────────────────────────────────────────────────────

function ImageViewer({ url, name }: { url: string; name: string }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setScale(s => Math.min(5, s + 0.25)); }
      else if (e.key === '-') { e.preventDefault(); setScale(s => Math.max(0.25, s - 0.25)); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setRotation(r => (r + 90) % 360); }
      else if (e.key === '0') { e.preventDefault(); setScale(1); setRotation(0); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" role="img" aria-label={`Image: ${name}`}>
      {/* Image Controls */}
      <motion.div
        className="flex items-center justify-center gap-1 px-4 py-2 border-b border-neutral-800 bg-neutral-900/90"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <div className="flex items-center gap-1" role="group" aria-label="Image controls">
          <IconButton onClick={() => setScale(s => Math.max(0.25, s - 0.25))} label="Zoom out (-)">
            <ZoomOut size={16} />
          </IconButton>
          <span className="text-xs text-neutral-400 min-w-[44px] text-center select-none">{Math.round(scale * 100)}%</span>
          <IconButton onClick={() => setScale(s => Math.min(5, s + 0.25))} label="Zoom in (+)">
            <ZoomIn size={16} />
          </IconButton>
          <div className="w-px h-4 bg-neutral-700 mx-1" aria-hidden="true" />
          <IconButton onClick={() => setRotation(r => (r + 90) % 360)} label="Rotate 90° (R)">
            <RotateCw size={16} />
          </IconButton>
          <IconButton onClick={() => { setScale(1); setRotation(0); }} label="Reset view (0)">
            <Maximize2 size={16} />
          </IconButton>
        </div>
      </motion.div>

      {/* Image Display */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-950">
        {!loaded && (
          <motion.div
            className="absolute flex flex-col items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Loader2 size={24} className="animate-spin text-purple-400" />
            <span className="text-xs text-neutral-500">Loading image...</span>
          </motion.div>
        )}
        <motion.img
          src={url}
          alt={name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 0.92 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ─── Video Viewer ──────────────────────────────────────────────────────────────

function VideoViewer({ url, mimeType }: { url: string; mimeType: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-neutral-950" role="region" aria-label="Video player">
      <motion.video
        controls
        autoPlay={false}
        className="max-w-full max-h-full rounded-xl shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <source src={url} type={mimeType} />
        Your browser does not support video playback.
      </motion.video>
    </div>
  );
}

// ─── Audio Viewer ──────────────────────────────────────────────────────────────

function AudioViewer({ url, name, mimeType }: { url: string; name: string; mimeType: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950 gap-6" role="region" aria-label="Audio player">
      <motion.div
        className="w-32 h-32 rounded-3xl bg-gradient-to-br from-orange-500/20 to-pink-500/20 border border-orange-500/20 flex items-center justify-center"
        initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Music size={48} className="text-orange-400" />
        </motion.div>
      </motion.div>
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35 }}
      >
        <p className="text-neutral-200 font-medium text-lg mb-1">{name}</p>
        <p className="text-neutral-500 text-sm">Audio File</p>
      </motion.div>
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
      >
        <audio controls className="w-full" aria-label={`Audio: ${name}`}>
          <source src={url} type={mimeType} />
          Your browser does not support audio playback.
        </audio>
      </motion.div>
    </div>
  );
}

// ─── DOCX Viewer ───────────────────────────────────────────────────────────────

function DocxViewer({ file }: { file: File }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function convert() {
      setLoading(true);
      try {
        const mammoth = await import('mammoth');
        const arrayBuf = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
        if (!cancelled) { setHtml(result.value); setLoading(false); }
      } catch (err: any) {
        if (!cancelled) { setError(err.message || 'Failed to render document'); setLoading(false); }
      }
    }
    convert();
    return () => { cancelled = true; };
  }, [file]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status">
        <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Loader2 size={32} className="animate-spin text-blue-400" />
          <span className="text-sm text-neutral-400">Rendering document...</span>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center" role="alert">
        <div className="text-center">
          <FileText size={48} className="text-neutral-600 mx-auto mb-3" />
          <p className="text-neutral-300 font-medium">Unable to render</p>
          <p className="text-neutral-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="flex-1 overflow-auto p-6 bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      role="document"
      aria-label="Word document content"
    >
      <div
        className="max-w-3xl mx-auto prose prose-sm text-black"
        style={{ color: '#1a1a1a', fontFamily: 'Georgia, serif', lineHeight: 1.8 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </motion.div>
  );
}

// ─── Text/Code Viewer ──────────────────────────────────────────────────────────

function TextViewer({ file, onSave }: { file: File; onSave?: (content: string) => Promise<void> }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const text = await file.text();
        if (!cancelled) { setContent(text); setLoading(false); }
      } catch {
        if (!cancelled) { setContent('Unable to read file contents.'); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [file]);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(content);
      setIsEditing(false);
    } catch (err) {
      alert('Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" role="status">
        <Loader2 size={24} className="animate-spin text-emerald-400" />
      </div>
    );
  }

  const lines = content.split('\n');

  return (
    <motion.div
      className="flex-1 flex flex-col bg-neutral-950 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      role="document"
    >
      {/* Editor Toolbar */}
      {onSave && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-neutral-800 bg-neutral-900 shrink-0 gap-2">
          {isEditing ? (
            <>
              <button onClick={() => setIsEditing(false)} disabled={saving} className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded transition-colors">
              <FileCode size={14} /> Edit
            </button>
          )}
        </div>
      )}
      
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div className="select-none text-right pr-4 pl-4 py-4 text-neutral-600 text-xs font-mono leading-6 border-r border-neutral-800 bg-neutral-900/50 shrink-0 overflow-hidden" aria-hidden="true">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* Code Content */}
        {isEditing ? (
          <textarea
            className="flex-1 p-4 bg-transparent text-neutral-200 text-sm font-mono leading-6 resize-none focus:outline-none whitespace-pre overflow-auto"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <pre className="flex-1 p-4 text-neutral-200 text-sm font-mono leading-6 overflow-auto whitespace-pre" tabIndex={0}>
            {content}
          </pre>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main FilePreviewModal ─────────────────────────────────────────────────────

export const FilePreviewModal = React.memo(function FilePreviewModal({
  file,
  onClose,
  statusBadge,
}: FilePreviewProps) {
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const viewerType = useMemo(() => detectViewerType(file.name, file.mimeType), [file.name, file.mimeType]);
  const typeInfo = useMemo(() => getFileTypeInfo(file.name, file.mimeType, file.isDirectory), [file.name, file.mimeType, file.isDirectory]);
  const Icon = typeInfo.icon;
  const badge = statusBadge[file.status];

  // Load the actual file from handle
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    async function loadFile() {
      if (file.isDirectory) {
        setLoading(false);
        return;
      }
      
      // Google Workspace documents cannot be downloaded directly via alt=media
      const isGoogleWorkspace = file.mimeType?.startsWith('application/vnd.google-apps.');
      
      setLoading(true);
      try {
        let f: File;
        if (file.handle) {
          f = await file.handle.getFile();
        } else if (file.driveId && !isGoogleWorkspace) {
          const blob = await getDriveFileBlob(file.driveId);
          f = new File([blob], file.name, { type: file.mimeType || 'application/octet-stream' });
        } else {
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setLocalFile(f);
        if (['image', 'video', 'audio'].includes(viewerType)) {
          url = URL.createObjectURL(f);
          setObjectUrl(url);
        }
      } catch (err: any) {
        // Silently catch fetch errors for previews so it doesn't trigger Next.js error overlays
        if (err.message !== 'Failed to fetch file contents') {
          console.warn('Could not read file for preview:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFile();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.handle, file.isDirectory, viewerType, file.driveId, file.mimeType, file.name]);

  // Handle Save for text files
  const handleSaveText = useCallback(async (newContent: string) => {
    if (!localFile) return;
    try {
      if (file.handle) {
        const writable = await file.handle.createWritable();
        await writable.write(newContent);
        await writable.close();
      }
      if (file.driveId) {
        const newBlob = new Blob([newContent], { type: file.mimeType || 'text/plain' });
        const newFileObj = new File([newBlob], file.name, { type: file.mimeType || 'text/plain' });
        await updateDriveFile(file.driveId, newFileObj);
      }
      
      const updatedBlob = new Blob([newContent], { type: file.mimeType || 'text/plain' });
      setLocalFile(new File([updatedBlob], file.name, { type: file.mimeType || 'text/plain' }));
    } catch (err) {
      console.error('Failed to save file:', err);
      throw err;
    }
  }, [file, localFile]);

  // Focus trap + ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);

    // Focus modal on open
    modalRef.current?.focus();

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleDownload = useCallback(() => {
    if (!localFile) return;
    const url = URL.createObjectURL(localFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [localFile, file.name]);

  const needsViewer = viewerType !== 'fallback' && !file.isDirectory;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-label={`File preview: ${file.name}`}
      >
        {/* Overlay - NO backdrop-filter */}
        <motion.div
          className="absolute inset-0 bg-black/80"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
        />

        {/* Modal */}
        <motion.div
          ref={modalRef}
          tabIndex={-1}
          className={`relative bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col outline-none ${
            isFullscreen ? 'w-full h-full rounded-none' : needsViewer ? 'w-full max-w-5xl h-[85vh]' : 'w-full max-w-md'
          }`}
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <motion.div
            className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-900 shrink-0"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.25 }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <motion.div
                className={`p-1.5 rounded-lg ${typeInfo.bg} shrink-0`}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Icon size={18} className={typeInfo.color} />
              </motion.div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-neutral-100 truncate" id="preview-title">{file.name}</h3>
                <p className="text-xs text-neutral-500">{typeInfo.label} • {file.size}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {needsViewer && (
                <IconButton
                  onClick={() => setIsFullscreen(f => !f)}
                  label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </IconButton>
              )}
              <IconButton onClick={onClose} label="Close preview (Esc)">
                <X size={18} />
              </IconButton>
            </div>
          </motion.div>

          {/* Content Area */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16" role="status" aria-label="Loading file">
              <motion.div
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Loader2 size={28} className="animate-spin text-blue-400" />
                <span className="text-sm text-neutral-400">Loading file...</span>
              </motion.div>
            </div>
          ) : needsViewer && localFile ? (
            <>
              {viewerType === 'pdf' && <PdfViewer file={localFile} />}
              {viewerType === 'image' && objectUrl && <ImageViewer url={objectUrl} name={file.name} />}
              {viewerType === 'video' && objectUrl && <VideoViewer url={objectUrl} mimeType={localFile.type} />}
              {viewerType === 'audio' && objectUrl && <AudioViewer url={objectUrl} name={file.name} mimeType={localFile.type} />}
              {viewerType === 'docx' && <DocxViewer file={localFile} />}
              {viewerType === 'text' && <TextViewer file={localFile} onSave={handleSaveText} />}
            </>
          ) : (
            /* Fallback: File details card */
            <motion.div
              className="p-6 flex flex-col items-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              {file.thumbnailLink ? (
                <motion.div
                  className="w-full aspect-video bg-neutral-950 rounded-xl mb-6 overflow-hidden flex items-center justify-center border border-neutral-800"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <img src={file.thumbnailLink} alt={file.name} className="w-full h-full object-cover" />
                </motion.div>
              ) : (
                <motion.div
                  className={`w-24 h-24 rounded-2xl ${typeInfo.bg} border ${typeInfo.borderColor} flex items-center justify-center mb-6`}
                  initial={{ scale: 0.7, opacity: 0, rotate: -5 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Icon size={40} className={typeInfo.color} />
                </motion.div>
              )}

              <div className="w-full space-y-3">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Name</p>
                  <p className="text-neutral-200 font-medium truncate" title={file.name}>{file.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Type</p>
                    <p className="text-neutral-200 text-sm truncate">{file.isDirectory ? 'Folder' : typeInfo.label}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Size</p>
                    <p className="text-neutral-200 text-sm">{file.size}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Modified</p>
                    <p className="text-neutral-200 text-sm">{file.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Status</p>
                    {badge && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
                        {badge.icon} {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                {file.driveId && (
                  <div>
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Drive ID</p>
                    <p className="text-neutral-400 text-xs font-mono truncate">{file.driveId}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Footer */}
          <motion.div
            className="px-5 py-3 border-t border-neutral-800 bg-neutral-900/90 flex justify-between items-center shrink-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.25 }}
          >
            <div className="flex items-center gap-2">
              {badge && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
                  {badge.icon} {badge.label}
                </span>
              )}
              <span className="text-xs text-neutral-500">{file.date}</span>
            </div>
            <div className="flex items-center gap-2">
              {localFile && (
                <button
                  onClick={handleDownload}
                  aria-label={`Download ${file.name}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Download size={14} /> Save
                </button>
              )}
              {file.driveId && (
                <a
                  href={`https://drive.google.com/file/d/${file.driveId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${file.name} in Google Drive`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ExternalLink size={14} /> Open in Drive
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

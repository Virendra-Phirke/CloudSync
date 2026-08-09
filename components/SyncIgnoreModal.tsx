'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Loader2, EyeOff, Info, RotateCcw, Search, Maximize2, Minimize2 } from 'lucide-react';

// Default patterns that are always ignored (hardcoded in localFolder.ts / syncBiDirectional.ts)
const DEFAULT_IGNORES = ['.syncignore', '.git', 'node_modules', '.DS_Store'];

const DEFAULT_SYNCIGNORE_TEMPLATE = `# Default OmniSync Ignore Patterns

# Core Ignores
.syncignore
.git
node_modules
.DS_Store

# Build outputs
dist/
build/
out/
.next/

# Environment files
.env
.env.local
.env.*.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Editor directories and files
.idea
.vscode
*.swp
*.swo

# OS generated files
Thumbs.db
`;

interface SyncIgnoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  onSaved?: () => void;
}

export function SyncIgnoreModal({ isOpen, onClose, folderHandle, folderName, onSaved }: SyncIgnoreModalProps) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const renderHighlightedText = (text: string, search: string) => {
    if (!text) return null;
    
    return text.split('\n').map((line, i) => {
      let lineClass = 'text-neutral-200';
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        lineClass = 'text-neutral-500 italic';
      } else if (trimmed.endsWith('/')) {
        lineClass = 'text-blue-400';
      } else if (line.includes('*')) {
        lineClass = 'text-amber-400';
      }

      let content: React.ReactNode = line;
      if (search && line.toLowerCase().includes(search.toLowerCase())) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = line.split(new RegExp(`(${escapedSearch})`, 'gi'));
        content = parts.map((part, j) => 
          part.toLowerCase() === search.toLowerCase() ? 
            <span key={j} className="search-match bg-yellow-500/40 text-yellow-100 rounded-sm">{part}</span> : 
            part
        );
      }

      return <span key={i} className={lineClass}>{content}{i < text.split('\n').length - 1 ? '\n' : ''}</span>;
    });
  };

  // Load .syncignore content when modal opens
  useEffect(() => {
    if (!isOpen || !folderHandle) return;

    const loadIgnoreFile = async () => {
      setLoading(true);
      setError('');
      try {
        const fileHandle = await folderHandle.getFileHandle('.syncignore');
        const file = await fileHandle.getFile();
        const text = await file.text();
        setContent(text);
        setOriginalContent(text);
      } catch {
        // No .syncignore file exists yet — start with an empty template
        setContent(DEFAULT_SYNCIGNORE_TEMPLATE);
        setOriginalContent('');
      } finally {
        setLoading(false);
      }
    };

    loadIgnoreFile();
  }, [isOpen, folderHandle]);

  useEffect(() => {
    setHasChanges(content !== originalContent);
  }, [content, originalContent]);

  // Auto-scroll to search match
  useEffect(() => {
    if (searchTerm && highlightRef.current && textareaRef.current) {
      const firstMatch = highlightRef.current.querySelector('.search-match') as HTMLElement;
      if (firstMatch) {
        // Offset by 40px so it's not glued to the very top edge of the textarea
        const targetTop = Math.max(0, firstMatch.offsetTop - 40);
        textareaRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    }
  }, [searchTerm, content]);

  const handleSave = useCallback(async () => {
    if (!folderHandle) return;
    setSaving(true);
    setError('');
    try {
      const fileHandle = await folderHandle.getFileHandle('.syncignore', { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(content);
      await writable.close();
      setOriginalContent(content);
      setHasChanges(false);
      onSaved?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save .syncignore');
    } finally {
      setSaving(false);
    }
  }, [folderHandle, content, onSaved]);

  const handleReset = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  const handleAddPattern = useCallback((pattern: string) => {
    setContent(prev => {
      const trimmed = prev.trimEnd();
      const lines = trimmed.split('\n');
      // Don't add if already present
      if (lines.some(l => l.trim() === pattern)) return prev;
      return trimmed + '\n' + pattern + '\n';
    });
  }, []);

  if (!isOpen) return null;

  // Count active patterns (non-empty, non-comment lines)
  const activePatterns = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`bg-neutral-900 border border-neutral-800 shadow-2xl flex flex-col transition-all duration-300 ${
          isFullscreen ? 'w-screen h-screen rounded-none' : 'rounded-2xl w-full max-w-4xl h-[85vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <EyeOff size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-100">.syncignore</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{folderName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Info bar */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-start gap-2.5 p-3 bg-neutral-800/50 border border-neutral-700/50 rounded-xl">
            <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-400 leading-relaxed">
              Files matching these patterns will be excluded from sync. Uses <span className="text-neutral-200 font-medium">.gitignore</span> syntax.
              Default ignores: <span className="text-neutral-300">{DEFAULT_IGNORES.join(', ')}</span>
            </p>
          </div>
        </div>

        {/* Quick add buttons & Search */}
        <div className="px-5 py-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-neutral-500 mr-1 self-center">Quick add:</span>
            {['*.log', '*.tmp', 'dist/', 'build/', '.env', '*.bak', 'thumbs.db', '*.cache'].map(pattern => (
              <button
                key={pattern}
                onClick={() => handleAddPattern(pattern)}
                className="px-2 py-0.5 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 rounded-md border border-neutral-700/50 transition-colors"
              >
                {pattern}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search patterns..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-48 bg-neutral-950 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-neutral-600"
            />
          </div>
        </div>

        {/* Editor */}
        <div className="px-5 py-3 flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 size={20} className="animate-spin text-neutral-500" />
            </div>
          ) : (
            <div className="relative flex-1 w-full bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
              {/* Syntax Highlight Overlay */}
              <div 
                ref={highlightRef}
                className="absolute inset-0 p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words overflow-auto pointer-events-none hide-scrollbar text-left"
                aria-hidden="true"
              >
                {renderHighlightedText(content, searchTerm)}
                {/* Zero-width space to ensure trailing newlines render their height */}
                &#8203;
              </div>
              
              {/* Actual Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                onScroll={handleScroll}
                spellCheck={false}
                className="absolute inset-0 w-full h-full p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words resize-none outline-none bg-transparent text-transparent caret-neutral-200 hide-scrollbar"
                placeholder="# Add patterns here, one per line..."
              />
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="px-5 pb-2">
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-neutral-800">
          <span className="text-xs text-neutral-500">
            {activePatterns} active pattern{activePatterns !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <RotateCcw size={12} />
                Undo Changes
              </button>
            )}
            <button
              onClick={() => setContent(DEFAULT_SYNCIGNORE_TEMPLATE)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded-lg transition-colors border border-blue-500/20"
              title="Load the comprehensive default template"
            >
              Load Default Template
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-500/20"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

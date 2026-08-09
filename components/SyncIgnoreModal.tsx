import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Copy, X, Plus, Check } from 'lucide-react';

const COLORS = {
  sky: { dot: 'bg-sky-400', text: 'text-sky-300', soft: 'text-sky-400/60' },
  lime: { dot: 'bg-lime-400', text: 'text-lime-300', soft: 'text-lime-400/60' },
  yellow: { dot: 'bg-yellow-400', text: 'text-yellow-300', soft: 'text-yellow-400/60' },
  orange: { dot: 'bg-orange-400', text: 'text-orange-300', soft: 'text-orange-400/60' },
  emerald: { dot: 'bg-emerald-400', text: 'text-emerald-300', soft: 'text-emerald-400/60' },
  cyan: { dot: 'bg-cyan-400', text: 'text-cyan-300', soft: 'text-cyan-400/60' },
  violet: { dot: 'bg-violet-400', text: 'text-violet-300', soft: 'text-violet-400/60' },
  slate: { dot: 'bg-slate-400', text: 'text-slate-300', soft: 'text-slate-400/60' },
  red: { dot: 'bg-red-400', text: 'text-red-300', soft: 'text-red-400/60' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-300', soft: 'text-amber-400/60' },
  pink: { dot: 'bg-pink-400', text: 'text-pink-300', soft: 'text-pink-400/60' },
  stone: { dot: 'bg-stone-400', text: 'text-stone-300', soft: 'text-stone-400/60' },
} as const;

type ColorKey = keyof typeof COLORS;
const PALETTE = Object.keys(COLORS) as ColorKey[];

interface Domain {
  id: string;
  name: string;
  color: ColorKey;
  on: boolean;
  patterns: string[];
}

const mk = (id: string, name: string, color: ColorKey, on: boolean, patterns: string[]): Domain => ({ id, name, color, on, patterns });

function getDefaults(): Domain[] {
  return [
    mk('web', 'Web / React / Next.js', 'sky', true, ['.next/', 'out/', 'build/', 'dist/', '.cache/', '.nuxt/', '.svelte-kit/', '.angular/', '.parcel-cache/', '.turbo/', '.vite/', '.astro/']),
    mk('node', 'Node.js', 'lime', true, ['node_modules/', '.npm/', '.yarn/', '.pnpm-store/', 'npm-debug.log*', 'yarn-debug.log*', 'pnpm-debug.log*', '.nyc_output/', 'coverage/', '.eslintcache', '*.tsbuildinfo']),
    mk('python', 'Python', 'yellow', false, ['__pycache__/', '*.py[cod]', '.venv/', 'venv/', 'env/', '*.egg-info/', '.pytest_cache/', '.coverage', 'htmlcov/', '.tox/', '.mypy_cache/', '.ruff_cache/', '.ipynb_checkpoints/']),
    mk('java', 'Java / Gradle', 'orange', false, ['*.class', '*.jar', '*.war', '*.ear', 'target/', 'out/', '.gradle/', 'hs_err_pid*']),
    mk('android', 'Android', 'emerald', false, ['.idea/', '*.iml', 'local.properties', '.cxx/', 'captures/', '*/build/', '*.jks', '*.keystore', 'google-services.json']),
    mk('docker', 'Docker / DevOps', 'cyan', false, ['docker-compose.override.yml', '.env', '.terraform/', '*.tfstate', '*.tfstate.*', '.serverless/', '.aws-sam/']),
    mk('ide', 'IDE / Editors', 'violet', true, ['.idea/', '*.iml', '.vscode/*', '!.vscode/settings.json', '.vim/', '.emacs.d/']),
    mk('os', 'Operating System', 'slate', true, ['.DS_Store', 'Thumbs.db', 'desktop.ini', '*.lnk', '*~', '.Trash-*']),
    mk('secrets', 'Secrets / Credentials', 'red', true, ['.env', '.env.*', '!.env.example', 'secrets/', '*.pem', '*.key', 'credentials.json']),
    mk('database', 'Database / Local Data', 'amber', false, ['*.db', '*.sqlite', '*.sqlite3', '*.db-shm', '*.db-wal']),
    mk('testing', 'Testing / E2E', 'pink', false, ['test-results/', 'playwright-report/', 'cypress/videos/', 'coverage/', 'storybook-static/']),
    mk('general', 'General Temp Files', 'stone', true, ['*.log', 'logs/', '*.tmp', '*.swp', '*.bak', 'tmp/']),
  ];
}

function parseSyncIgnore(text: string): Domain[] {
  if (!text.trim()) return getDefaults();

  const lines = text.split('\n');
  const parsedDomains: Domain[] = [];
  
  let currentDomain: Domain | null = null;
  let customCount = 1;
  const defaultDefs = getDefaults();
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(/^#\s*[─]+\s*(.+?)\s*[─]+$/);
    if (match) {
      if (currentDomain) parsedDomains.push(currentDomain);
      
      const domainName = match[1];
      const def = defaultDefs.find(d => d.name === domainName);
      
      if (def) {
        currentDomain = { ...def, on: true, patterns: [] };
      } else {
        currentDomain = mk(`custom${customCount++}`, domainName, PALETTE[parsedDomains.length % PALETTE.length], true, []);
      }
    } else {
      if (!currentDomain) {
        currentDomain = mk(`custom${customCount++}`, 'Custom / Uncategorized', 'slate', true, []);
      }
      currentDomain.patterns.push(trimmed);
    }
  }
  
  if (currentDomain) parsedDomains.push(currentDomain);
  
  for (const def of defaultDefs) {
    if (!parsedDomains.some(d => d.id === def.id)) {
      parsedDomains.push({ ...def, on: false, patterns: def.patterns });
    }
  }
  
  return parsedDomains;
}

function compileSyncIgnore(domains: Domain[]): string {
  const active = domains.filter(d => d.on);
  if (!active.length) return '';
  return active.map(c => `# ─── ${c.name} ───\n${c.patterns.join('\n')}`).join('\n\n') + '\n';
}

interface SyncIgnoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  onSaved?: () => void;
}

export function SyncIgnoreModal({ isOpen, onClose, folderHandle, folderName, onSaved }: SyncIgnoreModalProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [newPatterns, setNewPatterns] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !folderHandle) return;

    const loadIgnoreFile = async () => {
      setLoading(true);
      setError('');
      try {
        const fileHandle = await folderHandle.getFileHandle('.syncignore');
        const file = await fileHandle.getFile();
        const text = await file.text();
        setDomains(parseSyncIgnore(text));
      } catch {
        setDomains(getDefaults());
      } finally {
        setLoading(false);
      }
    };

    loadIgnoreFile();
  }, [isOpen, folderHandle]);

  const handleSave = async () => {
    if (!folderHandle) return;
    setSaving(true);
    setError('');
    try {
      const fileHandle = await folderHandle.getFileHandle('.syncignore', { create: true });
      const writable = await (fileHandle as any).createWritable();
      const compiled = compileSyncIgnore(domains);
      await writable.write(compiled);
      await writable.close();
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save .syncignore');
    } finally {
      setSaving(false);
    }
  };

  const activeDomains = domains.filter(d => d.on);
  const totalLines = activeDomains.reduce((acc, d) => acc + d.patterns.length, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm text-[13px] font-mono">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#181818] text-zinc-200 border border-neutral-800 shadow-2xl flex flex-col rounded-xl overflow-hidden w-[95vw] max-w-[1000px] h-[85vh]"
      >
        <div className="flex flex-col md:flex-row h-full min-h-0">
          
          {/* Sidebar */}
          <aside className="w-full md:w-72 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-zinc-800/70 bg-[#181818] max-h-48 md:max-h-none">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/70">
              <span className="text-[11px] tracking-widest text-zinc-500 font-sans font-semibold">SYNCIGNORE</span>
              <div className="flex gap-1.5">
                <button onClick={() => setDomains(d => d.map(x => ({ ...x, on: true })))} className="text-[10px] px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5 uppercase tracking-wide">All</button>
                <button onClick={() => setDomains(d => d.map(x => ({ ...x, on: false })))} className="text-[10px] px-2 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/5 uppercase tracking-wide">None</button>
              </div>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto py-2 px-1">
              {domains.map(c => {
                const C = COLORS[c.color];
                return (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 mx-1 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      checked={c.on} 
                      onChange={e => setDomains(ds => ds.map(d => d.id === c.id ? { ...d, on: e.target.checked } : d))}
                      className="w-3.5 h-3.5 accent-sky-500 shrink-0 cursor-pointer"
                    />
                    <span className={`w-2 h-2 rounded-full ${C.dot} shrink-0`}></span>
                    <span className="flex-1 truncate text-[12px] text-zinc-300 font-sans">{c.name}</span>
                    <span className="text-[10px] text-zinc-600 tabular-nums">{c.patterns.length}</span>
                  </label>
                );
              })}
            </div>
            
            <div className="border-t border-zinc-800/70 p-3 flex items-center justify-between">
              <button 
                onClick={() => {
                  const id = `custom${Date.now()}`;
                  setDomains([...domains, mk(id, 'New Domain', PALETTE[domains.length % PALETTE.length], true, [])]);
                }}
                className="text-[11px] text-zinc-400 hover:text-zinc-100 flex items-center gap-1 font-sans uppercase tracking-wide"
              >
                <Plus size={12} /> Domain
              </button>
              <button onClick={() => setDomains(getDefaults())} className="text-[10px] text-zinc-600 hover:text-red-400 uppercase tracking-wide">
                Reset
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#1e1e1e]">
            {/* Top Toolbar */}
            <div className="h-11 flex items-center border-b border-zinc-800/70 bg-[#181818] px-3 gap-2 shrink-0">
              <div className="flex items-center gap-1.5 h-full px-4 bg-[#1e1e1e] border-t-2 border-sky-400 rounded-t-md mt-0.5">
                <span className="text-zinc-200 text-[12px]">.syncignore</span>
              </div>
              <div className="flex-1 text-xs text-zinc-500 font-sans ml-2 truncate">
                {folderName}
              </div>
              
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(compileSyncIgnore(domains));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-[11px] px-3 py-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-zinc-100 flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button 
                onClick={onClose}
                className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 min-h-0 overflow-y-auto py-4">
              {loading ? (
                <div className="h-full flex items-center justify-center text-zinc-500">Loading...</div>
              ) : activeDomains.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-700 gap-3 select-none">
                  <div className="text-4xl opacity-50">∅</div>
                  <div className="text-[13px] text-zinc-500 font-sans">No domains selected</div>
                  <div className="text-[11px] font-sans">Tick a domain in the sidebar to start editing</div>
                </div>
              ) : (
                <div className="pb-8">
                  {(() => {
                    let globalLineNumber = 0;
                    return activeDomains.map(c => {
                      const C = COLORS[c.color];
                      globalLineNumber++;
                      
                      return (
                        <div key={c.id} className="mb-4">
                          {/* Domain Header */}
                          <div className="group flex items-center gap-3 px-6 pt-3 pb-2 hover:bg-white/[.02]">
                            <span className="w-8 shrink-0 text-right text-zinc-700 select-none text-[11px] tabular-nums">{globalLineNumber}</span>
                            <span className={`${C.soft} select-none`}>#</span>
                            <input 
                              value={c.name}
                              onChange={e => setDomains(ds => ds.map(d => d.id === c.id ? { ...d, name: e.target.value } : d))}
                              className={`flex-1 min-w-0 bg-transparent outline-none ${C.text} font-semibold text-[11.5px] tracking-widest uppercase focus:bg-white/5 px-1 rounded`}
                            />
                            <span className="text-[10px] text-zinc-700 tabular-nums">{c.patterns.length} rules</span>
                            <button 
                              onClick={() => setDomains(ds => ds.filter(d => d.id !== c.id))}
                              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs px-2"
                              title="Delete Domain"
                            >
                              ✕
                            </button>
                          </div>
                          
                          {/* Patterns */}
                          {c.patterns.map((p, idx) => {
                            globalLineNumber++;
                            return (
                              <div key={idx} className="group flex items-center gap-3 px-6 hover:bg-white/[.04] leading-relaxed py-0.5">
                                <span className="w-8 shrink-0 text-right text-zinc-700 select-none text-[11px] tabular-nums">{globalLineNumber}</span>
                                <input 
                                  value={p}
                                  onChange={e => {
                                    const newVal = e.target.value;
                                    setDomains(ds => ds.map(d => {
                                      if (d.id !== c.id) return d;
                                      const newPatterns = [...d.patterns];
                                      newPatterns[idx] = newVal;
                                      return { ...d, patterns: newPatterns };
                                    }));
                                  }}
                                  className={`flex-1 min-w-0 bg-transparent outline-none ${C.text} text-[13px] focus:bg-white/5 px-1 rounded`}
                                />
                                <button 
                                  onClick={() => setDomains(ds => ds.map(d => {
                                    if (d.id !== c.id) return d;
                                    const newPatterns = [...d.patterns];
                                    newPatterns.splice(idx, 1);
                                    return { ...d, patterns: newPatterns };
                                  }))}
                                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 text-xs px-2"
                                  title="Remove Pattern"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                          
                          {/* Add Pattern Row */}
                          <div className="flex items-center gap-3 px-6 leading-relaxed py-1 opacity-50 focus-within:opacity-100 transition-opacity">
                            <span className="w-8 shrink-0 text-right text-zinc-800 select-none text-[11px]">+</span>
                            <input 
                              value={newPatterns[c.id] || ''}
                              onChange={e => setNewPatterns({ ...newPatterns, [c.id]: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && newPatterns[c.id]?.trim()) {
                                  e.preventDefault();
                                  const v = newPatterns[c.id].trim();
                                  setDomains(ds => ds.map(d => d.id === c.id ? { ...d, patterns: [...d.patterns, v] } : d));
                                  setNewPatterns({ ...newPatterns, [c.id]: '' });
                                }
                              }}
                              placeholder="add pattern, press Enter" 
                              className="flex-1 min-w-0 bg-transparent outline-none text-zinc-500 placeholder-zinc-700 italic text-[12.5px] focus:bg-white/5 px-1 rounded"
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Error Bar */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs font-sans flex justify-between items-center shrink-0">
                <span>{error}</span>
                <button onClick={() => setError('')}><X size={12} /></button>
              </div>
            )}

            {/* Status Bar */}
            <div className="h-9 shrink-0 bg-sky-700/80 text-sky-100 text-[11px] flex items-center px-4 gap-6 select-none font-sans">
              <span className="flex items-center gap-1.5"><Check size={12} /> Sync Engine</span>
              <span>{activeDomains.length} domains</span>
              <span>{totalLines} rules</span>
              <div className="flex-1"></div>
              
              <button 
                onClick={onClose}
                className="px-3 py-1 hover:bg-white/10 rounded transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
}

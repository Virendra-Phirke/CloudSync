import React, { useState } from 'react';
import { X, Link as LinkIcon, Loader2, Check, Globe, Copy } from 'lucide-react';
import { shareDriveFile } from '../lib/drive';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: { id: string; name: string; driveId?: string }[];
}

export function ShareModal({ isOpen, onClose, files }: ShareModalProps) {
  const [role, setRole] = useState<'reader' | 'writer'>('reader');
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<{ name: string; link: string }[] | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const validFiles = files.filter(f => f.driveId);
  const hasInvalid = validFiles.length < files.length;

  const handleGenerateLink = async () => {
    if (validFiles.length === 0) {
      setError('None of the selected items are synced to Drive yet.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const generated: { name: string; link: string }[] = [];
      await Promise.all(validFiles.map(async (f) => {
        const link = await shareDriveFile(f.driveId!, role);
        generated.push({ name: f.name, link });
      }));
      setLinks(generated);
    } catch (err: any) {
      setError(err.message || 'Failed to generate links');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (link: string, idx: number) => {
    navigator.clipboard.writeText(link);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };
  
  const handleCopyAll = () => {
    if (links) {
       const text = links.map(l => `${l.name}: ${l.link}`).join('\n');
       navigator.clipboard.writeText(text);
       setCopiedIndex(-1);
       setTimeout(() => setCopiedIndex(null), 2000);
    }
  }

  const title = files.length === 1 ? `Share "${files[0].name}"` : `Share ${files.length} items`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-card text-card-foreground border border-border shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-zoomIn flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border shrink-0 bg-card/95">
          <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2.5 truncate">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
              <Globe size={18} />
            </div>
            <span className="truncate">{title}</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto hide-scrollbar">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
          
          {!links && hasInvalid && (
             <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm">
              {files.length - validFiles.length} item(s) are not synced to Drive and will be skipped.
            </div>
          )}

          {!links ? (
            <>
              <div className="space-y-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">General access</label>
                <div className="flex flex-col gap-2 p-1.5 bg-secondary/40 rounded-xl border border-border">
                  <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${role === 'reader' ? 'bg-background shadow-sm border border-primary/30' : 'hover:bg-secondary/70 border border-transparent'}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="reader" 
                      checked={role === 'reader'} 
                      onChange={() => setRole('reader')}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Viewer</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Anyone with the link can view</p>
                    </div>
                    {role === 'reader' && <Check size={16} className="text-primary" />}
                  </label>
                  
                  <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${role === 'writer' ? 'bg-background shadow-sm border border-primary/30' : 'hover:bg-secondary/70 border border-transparent'}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="writer" 
                      checked={role === 'writer'} 
                      onChange={() => setRole('writer')}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Editor</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Anyone with the link can edit</p>
                    </div>
                    {role === 'writer' && <Check size={16} className="text-primary" />}
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGenerateLink}
                  disabled={loading || validFiles.length === 0}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-primary hover:opacity-90 active:scale-[0.99] text-primary-foreground font-semibold rounded-xl transition-all shadow-sm shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Generating...</>
                  ) : (
                    <><LinkIcon size={18} /> Generate Link{validFiles.length > 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 py-2 animate-fadeIn">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-2.5 text-emerald-500">
                  <Check size={24} />
                </div>
                <h3 className="text-base font-bold text-foreground">Link{links.length > 1 ? 's' : ''} Generated!</h3>
                <p className="text-xs text-muted-foreground mt-1">Anyone with the link can now {role === 'reader' ? 'view' : 'edit'}.</p>
              </div>
              
              <div className="space-y-3">
                {links.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    {links.length > 1 && <span className="text-xs font-medium text-muted-foreground truncate pl-1">{item.name}</span>}
                    <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-xl border border-border">
                      <input 
                        type="text" 
                        readOnly 
                        value={item.link} 
                        className="flex-1 bg-transparent text-xs sm:text-sm text-foreground px-2 outline-none w-full"
                      />
                      <button
                        onClick={() => handleCopy(item.link, idx)}
                        className="flex items-center justify-center w-8 h-8 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors shrink-0"
                        title="Copy link"
                      >
                        {copiedIndex === idx ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {links.length > 1 && (
                <div className="pt-2">
                  <button
                    onClick={handleCopyAll}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl transition-colors"
                  >
                    {copiedIndex === -1 ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    {copiedIndex === -1 ? 'Copied All Links!' : 'Copy All Links'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

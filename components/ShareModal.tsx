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
        className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-neutral-900 border border-neutral-800 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-zoomIn flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2 truncate">
            <Globe className="text-blue-400 shrink-0" size={20} />
            <span className="truncate">{title}</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors shrink-0 ml-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto hide-scrollbar">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {!links && hasInvalid && (
             <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
              {files.length - validFiles.length} item(s) are not synced to Drive and will be skipped.
            </div>
          )}

          {!links ? (
            <>
              <div className="space-y-3">
                <label className="text-sm font-medium text-neutral-300">General access</label>
                <div className="flex flex-col gap-2 p-1 bg-neutral-950/50 rounded-xl border border-neutral-800">
                  <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${role === 'reader' ? 'bg-neutral-800/80 ring-1 ring-blue-500/30' : 'hover:bg-neutral-800/40'}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="reader" 
                      checked={role === 'reader'} 
                      onChange={() => setRole('reader')}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-200">Viewer</p>
                      <p className="text-xs text-neutral-500 mt-0.5">Anyone with the link can view</p>
                    </div>
                    {role === 'reader' && <Check size={16} className="text-blue-400" />}
                  </label>
                  
                  <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${role === 'writer' ? 'bg-neutral-800/80 ring-1 ring-blue-500/30' : 'hover:bg-neutral-800/40'}`}>
                    <input 
                      type="radio" 
                      name="role" 
                      value="writer" 
                      checked={role === 'writer'} 
                      onChange={() => setRole('writer')}
                      className="hidden"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-200">Editor</p>
                      <p className="text-xs text-neutral-500 mt-0.5">Anyone with the link can edit</p>
                    </div>
                    {role === 'writer' && <Check size={16} className="text-blue-400" />}
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleGenerateLink}
                  disabled={loading || validFiles.length === 0}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2 text-emerald-400">
                  <Check size={24} />
                </div>
                <h3 className="text-lg font-medium text-neutral-100">Link{links.length > 1 ? 's' : ''} Generated!</h3>
                <p className="text-sm text-neutral-400">Anyone with the link can now {role === 'reader' ? 'view' : 'edit'}.</p>
              </div>
              
              <div className="space-y-3">
                {links.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5">
                    {links.length > 1 && <span className="text-xs font-medium text-neutral-400 truncate pl-1">{item.name}</span>}
                    <div className="flex items-center gap-2 p-2 bg-neutral-950 rounded-xl border border-neutral-800">
                      <input 
                        type="text" 
                        readOnly 
                        value={item.link} 
                        className="flex-1 bg-transparent text-sm text-neutral-300 px-2 outline-none w-full"
                      />
                      <button
                        onClick={() => handleCopy(item.link, idx)}
                        className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors shrink-0"
                        title="Copy link"
                      >
                        {copiedIndex === idx ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {links.length > 1 && (
                <div className="pt-2">
                  <button
                    onClick={handleCopyAll}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium rounded-xl transition-colors"
                  >
                    {copiedIndex === -1 ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
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

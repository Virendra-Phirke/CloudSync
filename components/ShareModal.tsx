import React, { useState } from 'react';
import { X, Link as LinkIcon, Loader2, Check, Globe } from 'lucide-react';
import { shareDriveFile } from '../lib/drive';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: { id: string; name: string; driveId?: string };
}

export function ShareModal({ isOpen, onClose, file }: ShareModalProps) {
  const [role, setRole] = useState<'reader' | 'writer'>('reader');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    if (!file.driveId) {
      setError('File is not synced to Drive yet.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const webViewLink = await shareDriveFile(file.driveId, role);
      setLink(webViewLink);
    } catch (err: any) {
      setError(err.message || 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-neutral-900 border border-neutral-800 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-zoomIn">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
            <Globe className="text-blue-400" size={20} />
            Share "{file.name}"
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {!link ? (
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
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Generating...</>
                  ) : (
                    <><LinkIcon size={18} /> Generate Link</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4 py-2 text-center animate-fadeIn">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2 text-emerald-400">
                <Check size={24} />
              </div>
              <h3 className="text-lg font-medium text-neutral-100">Link Generated!</h3>
              <p className="text-sm text-neutral-400 mb-4">Anyone with this link can now {role === 'reader' ? 'view' : 'edit'} this file.</p>
              
              <div className="flex items-center gap-2 p-2 bg-neutral-950 rounded-xl border border-neutral-800">
                <input 
                  type="text" 
                  readOnly 
                  value={link} 
                  className="flex-1 bg-transparent text-sm text-neutral-300 px-2 outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium rounded-lg transition-colors"
                >
                  {copied ? <Check size={16} className="text-emerald-400" /> : <LinkIcon size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

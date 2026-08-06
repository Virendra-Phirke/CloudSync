import { Plus, Check } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { getUserInfo, initiateOAuth, logout, initAuth, OAuthUser } from '../lib/oauth';
import { useToast } from './ToastContext';

export const AccountsView = React.memo(function AccountsView() {
  const [user, setUser] = useState<OAuthUser | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribe = initAuth(
      (u) => setUser(u),
      () => setUser(null)
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleConnect = useCallback(() => {
    setIsLoggingIn(true);
    // Full-page redirect to /api/auth/google — no error to catch here
    initiateOAuth();
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      await logout();
      setUser(null);
      showToast('Disconnected from Google Drive', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to disconnect', 'error');
    }
  }, [showToast]);

  return (
    <div className="h-full flex flex-col">
      <header className="px-8 py-6 border-b border-neutral-800 sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <h2 className="text-2xl font-semibold text-neutral-100 tracking-tight">Cloud Accounts</h2>
        <p className="text-sm text-neutral-400 mt-1">Manage your connected cloud storage providers.</p>
      </header>
      
      <div className="p-8 max-w-4xl">
        <div className="grid gap-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-neutral-800 rounded-xl flex items-center justify-center shrink-0">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-14 h-14 rounded-xl object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <svg width="28" height="28" viewBox="0 0 87.3 127.3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M58.3 127.3H29L0 77.1 29.2 26.8h29.2L87.3 77z" fill="#ffffff" fillOpacity="0.1"/>
                    <path d="M57.6 126H28.4L0 76.8 28.4 27.6h29.2L86.8 76.8z" fill="#ffffff" fillOpacity="0.1"/>
                    <path d="M58.3 126H29.1L0 75.8l29.2-50.2h29.2l28.9 50.2z" fill="#1fa463"/>
                    <path d="M19.4 58.9l-9.7 16.9 29.2 50.2h19.3z" fill="#137333"/>
                    <path d="M29.1 0L0 50.2l9.7 16.9L48.5 16.9z" fill="#ffcc4d"/>
                    <path d="M29.1 0l-9.7 16.9h58.3l9.6-16.9z" fill="#ea4335"/>
                    <path d="M29.1 0L19.4 16.9l29.1 50.2 9.6-16.9z" fill="#c5221f"/>
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-100">Google Drive</h3>
                {user ? (
                  <>
                    <p className="text-sm text-neutral-400">{user.email}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{user.name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                        <Check size={12} /> Connected
                      </span>
                      <span className="text-xs text-neutral-500">Workspace connected via OAuth 2.0</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-neutral-400">Not connected</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-neutral-500">Connect to sync folders</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user ? (
                <button onClick={handleDisconnect} className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors">
                  Disconnect
                </button>
              ) : (
                <button onClick={handleGoogleConnect} disabled={isLoggingIn} className="px-4 py-2 text-sm font-medium text-blue-100 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors shadow-md shadow-blue-500/20">
                  {isLoggingIn ? 'Redirecting...' : 'Connect'}
                </button>
              )}
            </div>
          </div>

          {/* Add Account Card */}
          <button className="w-full border-2 border-dashed border-neutral-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-neutral-500 hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all group">
            <div className="w-12 h-12 bg-neutral-800 group-hover:bg-blue-500/10 rounded-full flex items-center justify-center transition-colors">
              <Plus size={24} />
            </div>
            <div className="text-center">
              <p className="font-medium text-neutral-400 group-hover:text-blue-400">Add Cloud Provider</p>
              <p className="text-sm mt-1">Connect Dropbox, OneDrive, or AWS S3</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

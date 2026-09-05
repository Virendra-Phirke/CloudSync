import { Plus, Check, ShieldCheck, Lock, ExternalLink, Cloud, Loader2, Sparkles } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import { initiateOAuth, logout, initAuth, OAuthUser } from '../lib/oauth';
import { useToast } from './ToastContext';
import { motion } from 'motion/react';

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

  const upcomingProviders = [
    {
      name: 'Microsoft OneDrive',
      tagline: 'Personal & Business Vault',
      description: 'Sync files seamlessly with Microsoft 365 and OneDrive for Business.',
      badge: 'Coming Soon',
      color: 'from-blue-600/20 to-sky-600/10',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" fill="#0078D4"/>
        </svg>
      )
    },
    {
      name: 'Dropbox',
      tagline: 'Cloud Storage & Workspace',
      description: 'Lightning-fast block-level differential syncing with Dropbox folders.',
      badge: 'Coming Soon',
      color: 'from-indigo-600/20 to-blue-600/10',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3L0 7.5L6 12L12 7.5L6 3Z" fill="#0061FF"/>
          <path d="M18 3L12 7.5L18 12L24 7.5L18 3Z" fill="#0061FF"/>
          <path d="M0 16.5L6 21L12 16.5L6 12L0 16.5Z" fill="#0061FF"/>
          <path d="M24 16.5L18 21L12 16.5L18 12L24 16.5Z" fill="#0061FF"/>
          <path d="M6 22.5L12 18L18 22.5L12 26.5L6 22.5Z" fill="#0061FF"/>
        </svg>
      )
    },
    {
      name: 'AWS S3 / Cloudflare R2',
      tagline: 'Enterprise Object Storage',
      description: 'Direct high-throughput bucket synchronization with S3-compatible endpoints.',
      badge: 'Beta Planning',
      color: 'from-amber-600/20 to-orange-600/10',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#FF9900"/>
          <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }
  ];

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <header className="px-4 sm:px-6 md:px-8 py-5 border-b border-border/70 sticky top-0 bg-background/95 backdrop-blur-md z-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Cloud Accounts</h2>
              <span className="bento-badge bg-primary/10 text-primary border border-primary/20">
                {user ? '1 Connected' : '0 Connected'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Connect and manage multi-cloud synchronization targets.
            </p>
          </div>
        </div>
      </header>
      
      <div className="p-4 sm:p-6 md:p-8 max-w-6xl space-y-6 flex-1 w-full mx-auto">
        {/* Active Provider Bento Card */}
        <div className="bento-block flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 bg-secondary/70 border border-border/80 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-14 h-14 rounded-2xl object-cover" referrerPolicy="no-referrer" />
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
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-foreground">Google Drive</h3>
                {user && (
                  <span className="bento-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] py-0.5">
                    <Check size={11} /> Primary Target
                  </span>
                )}
              </div>
              {user ? (
                <>
                  <p className="text-sm text-foreground/90 font-medium truncate mt-0.5">{user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/50">
                      OAuth 2.0 PKCE Secure
                    </span>
                    <span className="text-[11px] text-muted-foreground">Direct browser-to-Drive API</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mt-0.5">Not connected</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">Sign in with Google to enable two-way cloud sync</span>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            {user ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors border border-destructive/20"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleGoogleConnect}
                disabled={isLoggingIn}
                className="flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-primary/20"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Cloud size={15} />
                    <span>Connect Google Drive</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Upcoming Cloud Providers Bento Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Additional Cloud Connectors
            </h3>
            <span className="text-xs text-muted-foreground">Multi-destination roadmap</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {upcomingProviders.map((provider) => (
              <div
                key={provider.name}
                className="bento-block flex flex-col justify-between p-5 space-y-4 hover:border-border transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-secondary/80 border border-border/60">
                      {provider.icon}
                    </div>
                    <span className="bento-badge bg-secondary text-muted-foreground text-[10px] border border-border/60">
                      {provider.badge}
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground text-sm">{provider.name}</h4>
                  <p className="text-[11px] font-medium text-primary mt-0.5">{provider.tagline}</p>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    {provider.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Sparkles size={12} className="text-primary" /> Supported in v1.2
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Architecture Bento Block */}
        <div className="bento-block p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-foreground">Local-First Architecture & Zero Data Leakage</h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                CloudSync operates with a strict local-first paradigm. File payloads are streamed directly between your browser File System Access handles and the Google Drive REST API endpoints via verified OAuth 2.0 PKCE tokens.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">No Third-Party Relays</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Files never transit or get stored on external intermediary proxy servers.</p>
                </div>
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">Encrypted Tokens</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">OAuth credentials are stored locally in isolated browser storage.</p>
                </div>
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">SHA-256 Checksums</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Hash validation prevents data corruption or redundant duplicate transfers.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});


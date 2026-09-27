'use client';
import { Plus, Check, ShieldCheck, Lock, ExternalLink, Cloud, Loader2, Sparkles, FolderSync, Trash2, AlertTriangle } from 'lucide-react';
import React, { useEffect, useState, useCallback } from 'react';
import {
  initAuth,
  OAuthUser,
  fetchCloudConnections,
  initiateProviderOAuth,
  disconnectProvider,
  CloudProviderType,
} from '../lib/oauth';
import { useToast } from './ToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { CreateSyncModal } from './CreateSyncModal';
import { motion } from 'motion/react';

interface CloudAccountState {
  provider: CloudProviderType;
  name: string;
  tagline: string;
  description: string;
  connected: boolean;
  user?: OAuthUser;
  icon: React.ReactNode;
}

export const AccountsView = React.memo(function AccountsView() {
  const [connectingProvider, setConnectingProvider] = useState<CloudProviderType | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<CloudAccountState | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<Record<CloudProviderType, { connected: boolean; user?: OAuthUser }>>({
    google: { connected: false },
    dropbox: { connected: false },
    onedrive: { connected: false },
  });

  const loadConnections = useCallback(async () => {
    try {
      const connections = await fetchCloudConnections();
      const next: Record<CloudProviderType, { connected: boolean; user?: OAuthUser }> = {
        google: { connected: false },
        dropbox: { connected: false },
        onedrive: { connected: false },
      };
      for (const c of connections) {
        if (c.provider in next) {
          next[c.provider] = { connected: c.connected, user: c.user };
        }
      }
      setAccounts(next);
    } catch (err) {
      console.error('Failed to load connections', err);
    }
  }, []);

  useEffect(() => {
    loadConnections();
    const unsub = initAuth(
      () => loadConnections(),
      () => loadConnections()
    );
    return () => unsub();
  }, [loadConnections]);

  const handleConnect = useCallback((provider: CloudProviderType) => {
    setConnectingProvider(provider);
    initiateProviderOAuth(provider);
  }, []);

  const handleConfirmDisconnect = useCallback(async () => {
    if (!disconnectTarget) return;
    try {
      await disconnectProvider(disconnectTarget.provider);
      showToast(`Disconnected from ${disconnectTarget.name}`, 'info');
      await loadConnections();
    } catch (err: any) {
      showToast(err.message || 'Failed to disconnect', 'error');
    } finally {
      setDisconnectTarget(null);
    }
  }, [disconnectTarget, loadConnections, showToast]);

  const cloudConfigs: CloudAccountState[] = [
    {
      provider: 'google',
      name: 'Google Drive',
      tagline: 'Primary Drive Vault & Workspace',
      description: 'Stream directly between local handles and Google Drive via OAuth 2.0 PKCE.',
      connected: accounts.google.connected,
      user: accounts.google.user,
      icon: (
        <svg width="26" height="26" viewBox="0 0 87.3 127.3" xmlns="http://www.w3.org/2000/svg">
          <path d="M58.3 127.3H29L0 77.1 29.2 26.8h29.2L87.3 77z" fill="#ffffff" fillOpacity="0.1" />
          <path d="M57.6 126H28.4L0 76.8 28.4 27.6h29.2L86.8 76.8z" fill="#ffffff" fillOpacity="0.1" />
          <path d="M58.3 126H29.1L0 75.8l29.2-50.2h29.2l28.9 50.2z" fill="#1fa463" />
          <path d="M19.4 58.9l-9.7 16.9 29.2 50.2h19.3z" fill="#137333" />
          <path d="M29.1 0L0 50.2l9.7 16.9L48.5 16.9z" fill="#ffcc4d" />
          <path d="M29.1 0l-9.7 16.9h58.3l9.6-16.9z" fill="#ea4335" />
          <path d="M29.1 0L19.4 16.9l29.1 50.2 9.6-16.9z" fill="#c5221f" />
        </svg>
      ),
    },
    {
      provider: 'dropbox',
      name: 'Dropbox',
      tagline: 'Cloud Storage & Team Workspace',
      description: 'Fast differential block syncing and cursor-based incremental change detection.',
      connected: accounts.dropbox.connected,
      user: accounts.dropbox.user,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 3L0 7.5L6 12L12 7.5L6 3Z" fill="#0061FF" />
          <path d="M18 3L12 7.5L18 12L24 7.5L18 3Z" fill="#0061FF" />
          <path d="M0 16.5L6 21L12 16.5L6 12L0 16.5Z" fill="#0061FF" />
          <path d="M24 16.5L18 21L12 16.5L18 12L24 16.5Z" fill="#0061FF" />
          <path d="M6 22.5L12 18L18 22.5L12 26.5L6 22.5Z" fill="#0061FF" />
        </svg>
      ),
    },
    {
      provider: 'onedrive',
      name: 'Microsoft OneDrive',
      tagline: 'Personal & Enterprise Cloud',
      description: 'Native Microsoft Graph API integration with chunked upload sessions and Delta sync.',
      connected: accounts.onedrive.connected,
      user: accounts.onedrive.user,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
            fill="#0078D4"
          />
        </svg>
      ),
    },
  ];

  const totalConnected = cloudConfigs.filter((c) => c.connected).length;

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <header className="px-4 sm:px-6 md:px-8 py-5 border-b border-border/70 sticky top-0 bg-background/95 backdrop-blur-md z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Cloud Accounts</h2>
              <span className="bento-badge bg-primary/10 text-primary border border-primary/20">
                {totalConnected} {totalConnected === 1 ? 'Connected' : 'Connected'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Connect and manage multi-cloud synchronization targets: Google Drive, Dropbox, and OneDrive.
            </p>
          </div>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 rounded-xl transition-all shadow-md shadow-primary/20 shrink-0"
          >
            <FolderSync size={15} />
            <span>Create Multi-Cloud Sync</span>
          </button>
        </div>
      </header>

      <div className="p-4 sm:p-6 md:p-8 max-w-6xl space-y-6 flex-1 w-full mx-auto">
        {/* Connected Clouds Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connected Clouds
            </h3>
            <span className="text-xs text-muted-foreground">Multi-account architecture</span>
          </div>

          <div className="space-y-4">
            {cloudConfigs.map((cfg) => {
              const isConnecting = connectingProvider === cfg.provider;
              return (
                <div
                  key={cfg.provider}
                  className="bento-block flex flex-col md:flex-row md:items-center justify-between gap-6 p-5"
                >
                  <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                    <div className="w-14 h-14 bg-secondary/70 border border-border/80 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                      {cfg.user?.picture ? (
                        <img
                          src={cfg.user.picture}
                          alt={cfg.user.name}
                          className="w-14 h-14 rounded-2xl object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        cfg.icon
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base sm:text-lg font-bold text-foreground">{cfg.name}</h4>
                        {cfg.connected ? (
                          <span className="bento-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] py-0.5">
                            <Check size={11} /> Connected
                          </span>
                        ) : (
                          <span className="bento-badge bg-secondary text-muted-foreground border border-border/60 text-[11px] py-0.5">
                            Disconnected
                          </span>
                        )}
                      </div>

                      {cfg.connected && cfg.user ? (
                        <>
                          <p className="text-sm text-foreground/90 font-medium truncate mt-0.5">
                            {cfg.user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{cfg.user.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-[11px] text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/50">
                              OAuth 2.0 PKCE Active
                            </span>
                            <span className="text-[11px] text-muted-foreground">{cfg.tagline}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground mt-0.5">{cfg.tagline}</p>
                          <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-stretch sm:self-center justify-end sm:justify-start">
                    {cfg.connected ? (
                      <button
                        onClick={() => setDisconnectTarget(cfg)}
                        className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-xl transition-colors border border-destructive/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(cfg.provider)}
                        disabled={isConnecting}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 text-xs sm:text-sm font-medium text-primary-foreground bg-primary hover:opacity-90 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-primary/20"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Cloud size={15} />
                            <span>Connect {cfg.name}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security & Architecture Bento Block */}
        <div className="bento-block p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-foreground">
                Multi-Cloud Zero-Trust Security & Policy Boundaries
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                CloudSync operates with unified provider abstractions and strict local-first security. File payloads are streamed directly between verified endpoints. Credentials and refresh tokens remain strictly server-isolated in encrypted storage.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">Direct End-to-End Transfers</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Payloads stream directly between local storage and provider endpoints.
                  </p>
                </div>
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">AI Tool Isolation</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    AI agents only access controlled tools and never see raw OAuth tokens or secrets.
                  </p>
                </div>
                <div className="bento-subcard p-3">
                  <p className="text-xs font-semibold text-foreground">Destructive Guardrails</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cryptographic confirmation tokens are strictly required before any deletion or overwrite.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      {disconnectTarget && (
        <ConfirmDialog
          isOpen={Boolean(disconnectTarget)}
          title={`Disconnect ${disconnectTarget.name}`}
          message={
            <span>
              Are you sure you want to disconnect your <strong>{disconnectTarget.name}</strong> account?
              Local synchronization state will be retained, but automatic syncs to this cloud will pause.
            </span>
          }
          confirmText="Disconnect Account"
          isDestructive={true}
          onConfirm={handleConfirmDisconnect}
          onCancel={() => setDisconnectTarget(null)}
        />
      )}

      {/* Multi-Cloud Create Sync Dialog */}
      <CreateSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncStarted={() => {
          showToast('Sync initiated!', 'success');
        }}
      />
    </div>
  );
});

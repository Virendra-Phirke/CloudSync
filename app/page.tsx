'use client';
import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const LoadingFallback = () => (
  <div className="flex h-full items-center justify-center text-neutral-500">
    <Loader2 size={32} className="animate-spin text-neutral-700" />
  </div>
);

const Dashboard = dynamic(() => import('../components/Dashboard').then(mod => mod.Dashboard), { loading: () => <LoadingFallback /> });
const FilesView = dynamic(() => import('../components/FilesView').then(mod => mod.FilesView), { loading: () => <LoadingFallback /> });
const AccountsView = dynamic(() => import('../components/AccountsView').then(mod => mod.AccountsView), { loading: () => <LoadingFallback /> });
const SettingsView = dynamic(() => import('../components/SettingsView').then(mod => mod.SettingsView), { loading: () => <LoadingFallback /> });
const ThemeSidebar = dynamic(() => import('../components/ThemeSidebar').then(mod => mod.ThemeSidebar), { ssr: false });
const ConflictResolverModal = dynamic(() => import('../components/ConflictResolverModal').then(mod => mod.ConflictResolverModal), { ssr: false });
import { handleRedirectCallback } from '../lib/oauth';
import { useToast } from '../components/ToastContext';
import { useSync } from '../components/SyncContext';
import { AnimatePresence, motion } from 'motion/react';
import { Palette } from 'lucide-react';

function MobileTopBar({
  onOpenMenu,
  onOpenTheme
}: {
  onOpenMenu: () => void;
  onOpenTheme: () => void;
}) {
  const { isSyncing } = useSync();

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border/80 shrink-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="p-2 -ml-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
            <img src="/Icon/cloudSynce-logo.svg" alt="CloudSync" className="w-full h-full object-contain" />
          </div>
          <span className="font-semibold text-base tracking-tight text-foreground">CloudSync</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/70 border border-border/60 text-xs font-medium">
          <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
          <span className="text-muted-foreground">{isSyncing ? 'Syncing' : 'Ready'}</span>
        </div>
        <button
          onClick={onOpenTheme}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-xl transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Theme settings"
        >
          <Palette size={18} />
        </button>
      </div>
    </header>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { showToast } = useToast();
  const { currentConflicts, resolveConflictFn } = useSync();

  useEffect(() => {
    // Process OAuth redirect result on app load
    handleRedirectCallback(
      (user, token) => {
        showToast(`Successfully authenticated as ${user.email}`, 'success');
      },
      (error) => {
        showToast(`Authentication failed: ${error.message || 'Unknown error'}`, 'error');
      }
    );
  }, [showToast]);

  const pageVariants: any = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background text-foreground overflow-hidden w-full relative">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenTheme={() => setIsThemeOpen(true)}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Mobile Top Navigation Bar Block */}
      <MobileTopBar
        onOpenMenu={() => setIsMobileOpen(true)}
        onOpenTheme={() => setIsThemeOpen(true)}
      />

      <main className="flex-1 overflow-y-auto relative h-full bg-background">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-full">
              <Dashboard />
            </motion.div>
          )}
          {activeTab === 'files' && (
            <motion.div key="files" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-full">
              <FilesView />
            </motion.div>
          )}
          {activeTab === 'accounts' && (
            <motion.div key="accounts" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-full">
              <AccountsView />
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div key="settings" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="h-full">
              <SettingsView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <ThemeSidebar isOpen={isThemeOpen} onClose={() => setIsThemeOpen(false)} />
      {currentConflicts.length > 0 && resolveConflictFn && (
        <ConflictResolverModal
          isOpen={currentConflicts.length > 0}
          conflicts={currentConflicts}
          onResolve={resolveConflictFn}
        />
      )}
    </div>
  );
}


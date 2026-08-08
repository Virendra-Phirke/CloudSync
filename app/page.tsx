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
import { handleRedirectCallback } from '../lib/oauth';
import { useToast } from '../components/ToastContext';
import { AnimatePresence, motion } from 'motion/react';

export default function Page() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const { showToast } = useToast();

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

  const pageVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2, ease: 'easeIn' } }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden w-full relative">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        syncStatus={syncStatus} 
        onOpenTheme={() => setIsThemeOpen(true)}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />
      
      {/* Mobile Hamburger Menu Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed top-5 left-4 z-20 p-2 text-neutral-400 hover:text-white rounded-lg transition-colors bg-neutral-950/50 backdrop-blur-sm"
        aria-label="Open menu"
      >
        <Menu size={24} />
      </button>

      <main className="flex-1 overflow-y-auto relative h-full bg-neutral-950">
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
    </div>
  );
}

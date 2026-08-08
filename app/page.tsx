'use client';
import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { Dashboard } from '../components/Dashboard';
import { FilesView } from '../components/FilesView';
import { AccountsView } from '../components/AccountsView';
import { SettingsView } from '../components/SettingsView';
import { ThemeSidebar } from '../components/ThemeSidebar';
import { handleRedirectCallback } from '../lib/oauth';
import { useToast } from '../components/ToastContext';

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

      <main className="flex-1 overflow-y-auto relative h-full">
        <div className={activeTab === 'dashboard' ? 'h-full' : 'hidden'}>
          <Dashboard />
        </div>
        <div className={activeTab === 'files' ? 'h-full' : 'hidden'}>
          <FilesView />
        </div>
        <div className={activeTab === 'accounts' ? 'h-full' : 'hidden'}>
          <AccountsView />
        </div>
        <div className={activeTab === 'settings' ? 'h-full' : 'hidden'}>
          <SettingsView />
        </div>
      </main>
      <ThemeSidebar isOpen={isThemeOpen} onClose={() => setIsThemeOpen(false)} />
    </div>
  );
}

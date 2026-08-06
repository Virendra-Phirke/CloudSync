'use client';
import React, { useState, useEffect } from 'react';
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
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden w-full">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        syncStatus={syncStatus} 
        onOpenTheme={() => setIsThemeOpen(true)}
      />
      <main className="flex-1 overflow-y-auto relative h-full">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'files' && <FilesView />}
        {activeTab === 'accounts' && <AccountsView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
      <ThemeSidebar isOpen={isThemeOpen} onClose={() => setIsThemeOpen(false)} />
    </div>
  );
}

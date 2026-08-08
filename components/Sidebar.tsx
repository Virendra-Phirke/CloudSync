import { LayoutDashboard, FolderSync, Users, Settings, Cloud, Palette } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'motion/react';
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  syncStatus: 'idle' | 'syncing' | 'error';
  onOpenTheme: () => void;
}

export function Sidebar({ activeTab, setActiveTab, syncStatus, onOpenTheme }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'files', label: 'Files', icon: FolderSync },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-sidebar h-full flex flex-col pt-8 pb-4 px-4 z-10 border-r border-sidebar-border shrink-0">
      <div className="flex items-center gap-3 px-2 mb-10 text-sidebar-foreground">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center">
          <img src="/Icon/cloudSynce-logo.svg" alt="CloudSync Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-sidebar-foreground">CloudSync</h1>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-label={`${item.label} tab`}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                isActive ? "text-primary bg-primary/10" : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground hover:scale-[1.02] active:scale-[0.98]"
              )}
            >
              <Icon size={18} className={isActive ? "text-primary" : "text-sidebar-foreground/50"} aria-hidden="true" />
              {item.label}
              {isActive && (
                <motion.div 
                  layoutId="activeTabIndicator" 
                  className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                  initial={false}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-sidebar-border space-y-4">
        <button 
          onClick={onOpenTheme}
          aria-label="Open theme settings"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <Palette size={18} className="text-sidebar-foreground/50" aria-hidden="true" />
          Theme
        </button>
        <div className="px-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={clsx(
                "w-2.5 h-2.5 rounded-full",
                syncStatus === 'syncing' ? "bg-amber-400 animate-pulse" :
                syncStatus === 'error' ? "bg-red-400" : "bg-emerald-400"
              )} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-sidebar-foreground">
                {syncStatus === 'syncing' ? 'Syncing...' :
                  syncStatus === 'error' ? 'Sync Error' : 'Ready'}
              </span>
              <span className="text-[10px] text-sidebar-foreground/50">Waiting for files</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

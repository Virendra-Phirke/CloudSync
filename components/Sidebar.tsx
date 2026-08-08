import { LayoutDashboard, FolderSync, Users, Settings, Cloud, Palette, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import React from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  syncStatus: 'idle' | 'syncing' | 'error';
  onOpenTheme: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (c: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (o: boolean) => void;
}

export function Sidebar({ 
  activeTab, 
  setActiveTab, 
  syncStatus, 
  onOpenTheme,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen
}: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'files', label: 'Files', icon: FolderSync },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/60 z-30 md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <div 
        className={clsx(
          "bg-sidebar h-full flex flex-col pt-8 pb-4 px-4 border-r border-sidebar-border shrink-0 transition-all duration-300 z-40",
          // Mobile: fixed drawer
          "fixed inset-y-0 left-0 transform",
          isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full",
          // Desktop: static, collapsible width
          "md:static md:translate-x-0",
          isCollapsed ? "md:w-[88px]" : "md:w-64"
        )}
      >
        <div className={clsx("flex items-center mb-10 text-sidebar-foreground", isCollapsed ? "justify-center px-0" : "gap-3 px-2 justify-between")}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <img src="/Icon/cloudSynce-logo.svg" alt="CloudSync Logo" className="w-full h-full object-contain" />
            </div>
            {!isCollapsed && (
              <h1 className="text-xl font-semibold tracking-tight text-sidebar-foreground whitespace-nowrap">CloudSync</h1>
            )}
          </div>
          
          {/* Mobile close button */}
          <button 
            className="md:hidden p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-lg hover:bg-white/5 transition-colors"
            onClick={() => setIsMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsMobileOpen(false); // Auto close on mobile
              }}
              aria-label={`${item.label} tab`}
              title={isCollapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={clsx(
                "w-full flex items-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                isCollapsed ? "justify-center px-0" : "px-3",
                isActive ? "text-primary bg-primary/10" : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground hover:scale-[1.02] active:scale-[0.98]"
              )}
            >
              <Icon size={18} className={clsx("shrink-0", isActive ? "text-primary" : "text-sidebar-foreground/50")} aria-hidden="true" />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
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

      <div className="mt-auto pt-4 border-t border-sidebar-border flex flex-col gap-4">
        <button 
          onClick={() => {
            onOpenTheme();
            setIsMobileOpen(false);
          }}
          aria-label="Open theme settings"
          title={isCollapsed ? "Theme settings" : undefined}
          className={clsx(
            "w-full flex items-center gap-3 py-2 rounded-xl text-sm font-medium text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
            isCollapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <Palette size={18} className="text-sidebar-foreground/50 shrink-0" aria-hidden="true" />
          {!isCollapsed && <span className="whitespace-nowrap">Theme</span>}
        </button>
        
        <div className={clsx("flex items-center", isCollapsed ? "justify-center px-0" : "gap-3 px-2")}>
          <div className="relative shrink-0" title={syncStatus}>
            <div className={clsx(
              "w-2.5 h-2.5 rounded-full",
              syncStatus === 'syncing' ? "bg-amber-400 animate-pulse" :
              syncStatus === 'error' ? "bg-red-400" : "bg-emerald-400"
            )} />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col whitespace-nowrap overflow-hidden">
              <span className="text-xs font-semibold text-sidebar-foreground">
                {syncStatus === 'syncing' ? 'Syncing...' :
                  syncStatus === 'error' ? 'Sync Error' : 'Ready'}
              </span>
              <span className="text-[10px] text-sidebar-foreground/50">Waiting for files</span>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        <div className="hidden md:flex justify-end border-t border-sidebar-border pt-4 mt-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/5 rounded-lg transition-colors mx-auto"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

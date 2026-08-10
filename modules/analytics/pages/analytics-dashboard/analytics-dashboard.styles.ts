import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Industrial / Utilitarian Aesthetic
// High contrast, structural borders, no soft radii, monospace data presentation.
export const styles = {
  // Layout
  pageLayout: cn(
    'min-h-screen bg-black text-neutral-200 font-sans selection:bg-cyan-500 selection:text-black',
    'flex flex-col md:flex-row'
  ),
  mainContent: cn(
    'flex-1 flex flex-col',
    'border-l border-neutral-800'
  ),
  
  // Sidebar
  sidebar: cn(
    'w-full md:w-64 bg-neutral-950 p-6 flex flex-col gap-8',
    'border-b md:border-b-0 border-neutral-800 shrink-0'
  ),
  sidebarHeader: 'text-xs uppercase tracking-[0.2em] text-neutral-500 mb-4',
  sidebarLink: cn(
    'text-sm font-medium hover:text-cyan-400 transition-colors py-2 flex items-center gap-3',
    'outline-none focus-visible:ring-1 focus-visible:ring-cyan-500'
  ),
  sidebarLinkActive: 'text-cyan-400 border-l-2 border-cyan-400 pl-3 -ml-4',

  // Top Bar
  topBar: cn(
    'h-16 border-b border-neutral-800 flex items-center justify-between px-6 bg-black/50 backdrop-blur-sm sticky top-0 z-10'
  ),
  topBarTitle: 'text-sm font-semibold uppercase tracking-widest text-white',
  
  // Dashboard Grid
  dashboardGrid: 'p-6 grid grid-cols-1 lg:grid-cols-12 gap-6',
  
  // Card (Structural)
  card: 'bg-neutral-950 border border-neutral-800 p-6',
  cardHeader: 'text-xs uppercase tracking-widest text-neutral-500 mb-6 flex justify-between items-center',
  
  // Metrics
  metricGrid: 'col-span-1 lg:grid-cols-4 grid grid-cols-1 sm:grid-cols-2 gap-6 lg:col-span-12',
  metricValue: 'text-4xl font-mono text-white tracking-tight',
  metricSub: 'text-xs font-mono text-neutral-500 mt-2 block',

  // Charts
  chartSection: 'col-span-1 lg:col-span-8',
  chartContainer: 'h-[300px] w-full mt-4',

  // Activity Feed
  activitySection: 'col-span-1 lg:col-span-4 flex flex-col',
  activityList: 'flex-1 overflow-y-auto pr-2 flex flex-col gap-4',
  activityItem: 'flex gap-4 p-3 border border-neutral-800 bg-neutral-950/50 hover:bg-neutral-900 transition-colors',
  activityIconWrapper: 'shrink-0 pt-1',
  activityIconSuccess: 'text-emerald-500',
  activityIconWarning: 'text-amber-500',
  activityIconError: 'text-red-500',
  activityContent: 'flex-1 min-w-0',
  activityAction: 'text-xs font-bold text-white uppercase tracking-wider',
  activityTarget: 'text-xs font-mono text-neutral-400 truncate mt-1',
  activityTime: 'text-[10px] text-neutral-600 font-mono text-right shrink-0 uppercase',
} as const;

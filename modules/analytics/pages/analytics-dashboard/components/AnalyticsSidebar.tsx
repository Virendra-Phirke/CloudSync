import { styles } from '../analytics-dashboard.styles';
import { Activity, Database, Server, Settings, Zap } from 'lucide-react';
import Link from 'next/link';

export function AnalyticsSidebar() {
  return (
    <div className={styles.sidebar}>
      <div>
        <div className="flex items-center gap-2 mb-10">
          <Zap className="w-5 h-5 text-cyan-500" />
          <span className="text-white font-mono font-bold tracking-tight">OMNI_SYS</span>
        </div>
        
        <div className={styles.sidebarHeader}>Telemetry</div>
        <nav className="flex flex-col gap-1">
          <Link href="/analytics" className={`${styles.sidebarLink} ${styles.sidebarLinkActive}`}>
            <Activity className="w-4 h-4" />
            <span>Overview</span>
          </Link>
          <Link href="/analytics" className={styles.sidebarLink}>
            <Server className="w-4 h-4" />
            <span>Nodes</span>
          </Link>
          <Link href="/analytics" className={styles.sidebarLink}>
            <Database className="w-4 h-4" />
            <span>Storage</span>
          </Link>
        </nav>
      </div>

      <div className="mt-auto pt-8">
        <nav className="flex flex-col gap-1">
          <Link href="/" className={styles.sidebarLink}>
            <Settings className="w-4 h-4" />
            <span>Return to App</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

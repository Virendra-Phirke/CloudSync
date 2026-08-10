'use client';

import { styles } from './analytics-dashboard.styles';
import { useMockAnalytics } from '../../hooks/useMockAnalytics';
import { AnalyticsSidebar } from './components/AnalyticsSidebar';
import { MetricCard } from './components/MetricCard';
import { ChartSection } from './components/ChartSection';
import { ActivityFeed } from './components/ActivityFeed';
import { Activity, AlertTriangle, Users, Zap } from 'lucide-react';

export function AnalyticsDashboardPage() {
  const { metrics, chartData, activities } = useMockAnalytics();

  return (
    <div className={styles.pageLayout}>
      <AnalyticsSidebar />
      
      <div className={styles.mainContent}>
        <header className={styles.topBar}>
          <h1 className={styles.topBarTitle}>System Telemetry</h1>
          <div className="flex items-center gap-4">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-xs font-mono text-cyan-500">SYSTEM_NOMINAL</span>
          </div>
        </header>

        <main className={styles.dashboardGrid}>
          {/* Top KPI Metrics */}
          <div className={styles.metricGrid}>
            <MetricCard 
              title="Total Requests" 
              value={metrics.totalRequests} 
              subValue="+12% from last hour"
              icon={Activity}
            />
            <MetricCard 
              title="Avg Latency" 
              value={metrics.avgLatency} 
              subValue="P99: 142ms"
              icon={Zap}
            />
            <MetricCard 
              title="Error Rate" 
              value={metrics.errorRate} 
              subValue="-0.04% from last hour"
              icon={AlertTriangle}
            />
            <MetricCard 
              title="Active Connections" 
              value={metrics.activeUsers} 
              icon={Users}
            />
          </div>

          {/* Main Visualizations */}
          <ChartSection data={chartData} />
          
          {/* Activity Feed */}
          <ActivityFeed activities={activities} />
        </main>
      </div>
    </div>
  );
}

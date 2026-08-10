import { useMemo } from 'react';

export interface IChartDataPoint {
  time: string;
  value: number;
  secondaryValue?: number;
}

export interface IActivityItem {
  id: string;
  action: string;
  target: string;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
}

export interface IAnalyticsState {
  metrics: {
    totalRequests: string;
    avgLatency: string;
    errorRate: string;
    activeUsers: string;
  };
  chartData: IChartDataPoint[];
  activities: IActivityItem[];
}

// Generate mock data outside render phase
const MOCK_CHART_DATA: IChartDataPoint[] = [];
const now = new Date();
for (let i = 24; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 60 * 60 * 1000);
  // Using pseudo-random but deterministic-looking values to avoid hydration mismatch
  // Or just generate it statically once
  MOCK_CHART_DATA.push({
    time: `${d.getHours().toString().padStart(2, '0')}:00`,
    value: 1000 + ((i * 37) % 4000),
    secondaryValue: 500 + ((i * 13) % 1500),
  });
}

export function useMockAnalytics(): IAnalyticsState {
  return useMemo(() => {
    return {
      metrics: {
        totalRequests: '124,592',
        avgLatency: '42ms',
        errorRate: '0.12%',
        activeUsers: '8,439',
      },
      chartData: MOCK_CHART_DATA,
      activities: [
        { id: '1', action: 'DEPLOY_START', target: 'production-api-us-east', timestamp: '2m ago', status: 'success' },
        { id: '2', action: 'API_RATE_LIMIT', target: 'tenant-492a', timestamp: '14m ago', status: 'warning' },
        { id: '3', action: 'DB_FAILOVER', target: 'replica-set-b', timestamp: '1h ago', status: 'error' },
        { id: '4', action: 'CACHE_PURGE', target: 'cdn-edge-eu', timestamp: '3h ago', status: 'success' },
        { id: '5', action: 'USER_MIGRATION', target: 'batch-9921', timestamp: '4h ago', status: 'success' },
        { id: '6', action: 'CONFIG_UPDATE', target: 'routing-mesh', timestamp: '5h ago', status: 'warning' },
      ]
    };
  }, []);
}

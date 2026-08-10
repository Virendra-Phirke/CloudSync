'use client';

import { styles } from '../analytics-dashboard.styles';
import { IChartDataPoint } from '../../../hooks/useMockAnalytics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface ChartSectionProps {
  data: IChartDataPoint[];
}

export function ChartSection({ data }: ChartSectionProps) {
  return (
    <div className={styles.card + ' ' + styles.chartSection}>
      <div className={styles.cardHeader}>
        <span>Throughput (24H)</span>
        <span className="text-cyan-500">LIVE</span>
      </div>
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis
              dataKey="time"
              stroke="#525252"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#525252"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${val}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #262626',
                borderRadius: '0px',
                fontFamily: 'monospace'
              }}
              itemStyle={{ color: '#06b6d4' }}
              labelStyle={{ color: '#a3a3a3', marginBottom: '4px' }}
            />
            <Line
              type="step"
              dataKey="value"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#06b6d4', stroke: '#000' }}
            />
            <Line
              type="step"
              dataKey="secondaryValue"
              stroke="#525252"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

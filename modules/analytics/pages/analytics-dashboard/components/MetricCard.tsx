import { styles } from '../analytics-dashboard.styles';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
}

export function MetricCard({ title, value, subValue, icon: Icon }: MetricCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span>{title}</span>
        <Icon className="w-4 h-4 text-cyan-500" strokeWidth={1.5} />
      </div>
      <div>
        <span className={styles.metricValue}>{value}</span>
        {subValue && <span className={styles.metricSub}>{subValue}</span>}
      </div>
    </div>
  );
}

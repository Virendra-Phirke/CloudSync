import { styles } from '../analytics-dashboard.styles';
import { IActivityItem } from '../../../hooks/useMockAnalytics';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '../analytics-dashboard.styles';

interface ActivityFeedProps {
  activities: IActivityItem[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className={styles.card + ' ' + styles.activitySection}>
      <div className={styles.cardHeader}>
        <span>System Log</span>
        <span>{activities.length} EVENTS</span>
      </div>
      
      <div className={styles.activityList}>
        {activities.map((item) => {
          let Icon = CheckCircle2;
          let iconColor: string = styles.activityIconSuccess;

          if (item.status === 'warning') {
            Icon = AlertTriangle;
            iconColor = styles.activityIconWarning;
          } else if (item.status === 'error') {
            Icon = Activity; // using activity for errors
            iconColor = styles.activityIconError;
          }

          return (
            <div key={item.id} className={styles.activityItem}>
              <div className={cn(styles.activityIconWrapper, iconColor)}>
                <Icon className="w-4 h-4" strokeWidth={2} />
              </div>
              <div className={styles.activityContent}>
                <div className={styles.activityAction}>{item.action}</div>
                <div className={styles.activityTarget}>{item.target}</div>
              </div>
              <div className={styles.activityTime}>{item.timestamp}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

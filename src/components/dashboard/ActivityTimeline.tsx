import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Mail, CheckSquare, AlarmCheck, FileText, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { EmptyState } from './EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

interface ActivityLog {
  id: string;
  type: string;
  payload: any;
  trace_id: string;
  created_at: string;
}

interface ActivityTimelineProps {
  activities: ActivityLog[];
  isLoading: boolean;
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'gcal_event_created':
      return <Calendar className="w-4 h-4" />;
    case 'email_sent':
      return <Mail className="w-4 h-4" />;
    case 'reminder_created':
      return <AlarmCheck className="w-4 h-4" />;
    case 'task_completed':
      return <CheckSquare className="w-4 h-4" />;
    case 'document_processed':
      return <FileText className="w-4 h-4" />;
    default:
      return <MessageSquare className="w-4 h-4" />;
  }
};

const getActivityLabel = (type: string) => {
  const labels: Record<string, string> = {
    gcal_event_created: 'Calendar Event',
    email_sent: 'Email',
    reminder_created: 'Reminder',
    task_completed: 'Task',
    document_processed: 'Document',
  };
  return labels[type] || 'Activity';
};

export const ActivityTimeline = ({ activities, isLoading }: ActivityTimelineProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No activity yet"
              description="Your recent activities will appear here as you interact with Man Friday."
            />
          ) : (
            <div className="relative max-h-96 overflow-y-auto">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {activities.map((activity, index) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="relative pl-10"
                  >
                    <div className="absolute left-0 top-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center border-2 border-background">
                      <div className="text-primary">
                        {getActivityIcon(activity.type)}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {getActivityLabel(activity.type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {activity.payload?.message || activity.payload?.description || 'Activity recorded'}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

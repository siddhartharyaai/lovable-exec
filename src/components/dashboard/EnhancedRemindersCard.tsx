import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlarmCheck, CheckCircle2, Clock } from 'lucide-react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { motion } from 'framer-motion';
import { EmptyState } from './EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

interface Reminder {
  id: string;
  text: string;
  due_ts: string;
  status: string;
  created_at: string;
}

interface EnhancedRemindersCardProps {
  reminders: Reminder[];
  isLoading: boolean;
}

export const EnhancedRemindersCard = ({ reminders, isLoading }: EnhancedRemindersCardProps) => {
  const getUrgencyColor = (dueTs: string) => {
    const dueDate = new Date(dueTs);
    if (isPast(dueDate)) return 'bg-destructive/10 text-destructive border-destructive/20';
    if (isToday(dueDate)) return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-success/10 text-success border-success/20';
  };

  const getUrgencyLabel = (dueTs: string) => {
    const dueDate = new Date(dueTs);
    if (isPast(dueDate)) return 'Overdue';
    if (isToday(dueDate)) return 'Today';
    return 'Upcoming';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Upcoming Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : reminders.length === 0 ? (
            <EmptyState
              icon={AlarmCheck}
              title="No reminders set"
              description="Create a reminder by asking Man Friday on WhatsApp. Just say 'Remind me to...'"
              actionLabel="Learn More"
            />
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {reminders.map((reminder, index) => (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors border border-border/50"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-2">{reminder.text}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-xs ${getUrgencyColor(reminder.due_ts)}`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {getUrgencyLabel(reminder.due_ts)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(reminder.due_ts), 'MMM d, h:mm a')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({formatDistanceToNow(new Date(reminder.due_ts), { addSuffix: true })})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Mark Done
                    </Button>
                    <Button size="sm" variant="ghost">
                      Snooze
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

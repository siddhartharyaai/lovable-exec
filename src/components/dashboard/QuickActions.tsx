import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Calendar, Mail, AlarmCheck, FileText, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface QuickAction {
  icon: typeof MessageSquare;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

const actions: QuickAction[] = [
  {
    icon: MessageSquare,
    title: 'Ask Man Friday',
    description: 'Start a conversation',
    color: 'text-primary',
    bgColor: 'bg-primary/10 hover:bg-primary/20',
  },
  {
    icon: Calendar,
    title: 'Check Calendar',
    description: 'View today\'s events',
    color: 'text-accent',
    bgColor: 'bg-accent/10 hover:bg-accent/20',
  },
  {
    icon: Mail,
    title: 'Email Summary',
    description: 'Summarize unread emails',
    color: 'text-warning',
    bgColor: 'bg-warning/10 hover:bg-warning/20',
  },
  {
    icon: AlarmCheck,
    title: 'New Reminder',
    description: 'Create a reminder',
    color: 'text-success',
    bgColor: 'bg-success/10 hover:bg-success/20',
  },
  {
    icon: FileText,
    title: 'Upload Document',
    description: 'Process a document',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 hover:bg-destructive/20',
  },
  {
    icon: Plus,
    title: 'Quick Add',
    description: 'Add task or event',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 hover:bg-muted',
  },
];

export const QuickActions = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {actions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-4 rounded-lg ${action.bgColor} transition-all duration-200 text-left border border-border/50 hover:border-border`}
                >
                  <Icon className={`w-6 h-6 mb-2 ${action.color}`} />
                  <h4 className="text-sm font-semibold mb-1">{action.title}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

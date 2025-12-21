import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Calendar, Mail, AlarmCheck, FileText, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// Twilio WhatsApp sandbox number
const WHATSAPP_NUMBER = '14155238886';

interface QuickAction {
  icon: typeof MessageSquare;
  title: string;
  description: string;
  color: string;
  bgColor: string;
  message?: string; // Pre-filled WhatsApp message
  isQuickAdd?: boolean; // Special handling for Quick Add
}

const actions: QuickAction[] = [
  {
    icon: MessageSquare,
    title: 'Ask Man Friday',
    description: 'Start a conversation',
    color: 'text-primary',
    bgColor: 'bg-primary/10 hover:bg-primary/20',
    message: 'Hi Man Friday!',
  },
  {
    icon: Calendar,
    title: 'Check Calendar',
    description: 'View today\'s events',
    color: 'text-accent',
    bgColor: 'bg-accent/10 hover:bg-accent/20',
    message: 'What\'s on my calendar today?',
  },
  {
    icon: Mail,
    title: 'Email Summary',
    description: 'Summarize unread emails',
    color: 'text-warning',
    bgColor: 'bg-warning/10 hover:bg-warning/20',
    message: 'Summarize my unread emails',
  },
  {
    icon: AlarmCheck,
    title: 'New Reminder',
    description: 'Create a reminder',
    color: 'text-success',
    bgColor: 'bg-success/10 hover:bg-success/20',
    message: 'Remind me to ',
  },
  {
    icon: FileText,
    title: 'Upload Document',
    description: 'Process a document',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 hover:bg-destructive/20',
    message: 'I want to upload a document',
  },
  {
    icon: Plus,
    title: 'Quick Add',
    description: 'Add task or event',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 hover:bg-muted',
    isQuickAdd: true,
  },
];

const openWhatsApp = (message: string) => {
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};

export const QuickActions = () => {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');

  const handleActionClick = (action: QuickAction) => {
    if (action.isQuickAdd) {
      setIsQuickAddOpen(true);
    } else if (action.message) {
      openWhatsApp(action.message);
    }
  };

  const handleQuickAddSubmit = () => {
    if (quickAddText.trim()) {
      openWhatsApp(quickAddText.trim());
      setQuickAddText('');
      setIsQuickAddOpen(false);
    }
  };

  return (
    <>
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
                    onClick={() => handleActionClick(action)}
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

      {/* Quick Add Dialog */}
      <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Add</DialogTitle>
            <DialogDescription>
              Enter a task or event you want Man Friday to handle for you.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="e.g., Schedule a meeting with John tomorrow at 3pm"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              className="min-h-[100px]"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsQuickAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleQuickAddSubmit} disabled={!quickAddText.trim()}>
              Send to WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

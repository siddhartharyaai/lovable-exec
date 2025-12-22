import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Calendar, Mail, AlarmCheck, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { EmptyState } from './EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

interface Message {
  id: string;
  body: string;
  created_at: string;
  parsed_intent: any;
  dir: string;
}

interface EnhancedMessagesCardProps {
  messages: Message[];
  isLoading: boolean;
}

const getIntentIcon = (intent: string) => {
  switch (intent) {
    case 'gcal_create_event':
      return <Calendar className="w-3 h-3" />;
    case 'reminder_create':
      return <AlarmCheck className="w-3 h-3" />;
    case 'gmail_summarize_unread':
      return <Mail className="w-3 h-3" />;
    default:
      return <MessageSquare className="w-3 h-3" />;
  }
};

const getIntentLabel = (intent: string) => {
  switch (intent) {
    case 'gcal_create_event':
      return 'Calendar';
    case 'reminder_create':
      return 'Reminder';
    case 'gmail_summarize_unread':
      return 'Email';
    default:
      return 'Chat';
  }
};

export const EnhancedMessagesCard = ({ messages, isLoading }: EnhancedMessagesCardProps) => {
  const inboxMessages = messages.filter(m => m.dir === 'in');
  const sentMessages = messages.filter(m => m.dir === 'out');

  const MessageList = ({ msgs }: { msgs: Message[] }) => (
    <div className="space-y-3">
      {msgs.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {message.dir === 'in' ? (
                  <ArrowDownRight className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-accent shrink-0" />
                )}
                <p className="text-sm font-medium truncate">{message.body}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(message.created_at), 'MMM d, h:mm a')}
                </span>
                {message.parsed_intent?.intent && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    {getIntentIcon(message.parsed_intent.intent)}
                    {getIntentLabel(message.parsed_intent.intent)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description="Start a conversation with Man Friday on WhatsApp to see your messages here. Save +1 (415) 523-8886 and say 'Hi'!"
              actionLabel="Open WhatsApp"
              onAction={() => window.open('https://wa.me/14155238886?text=Hi', '_blank')}
            />
          ) : (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
                <TabsTrigger value="inbox">Inbox ({inboxMessages.length})</TabsTrigger>
                <TabsTrigger value="sent">Sent ({sentMessages.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="max-h-96 overflow-y-auto">
                <MessageList msgs={messages} />
              </TabsContent>
              <TabsContent value="inbox" className="max-h-96 overflow-y-auto">
                {inboxMessages.length > 0 ? (
                  <MessageList msgs={inboxMessages} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No incoming messages</p>
                )}
              </TabsContent>
              <TabsContent value="sent" className="max-h-96 overflow-y-auto">
                {sentMessages.length > 0 ? (
                  <MessageList msgs={sentMessages} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No sent messages</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MessageSquare, CheckSquare, Mail, Settings, CheckCircle2, XCircle, Clock, AlarmCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface Message {
  id: string;
  body: string;
  created_at: string;
  parsed_intent: any;
  dir: string;
}

interface Reminder {
  id: string;
  text: string;
  due_ts: string;
  status: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  type: string;
  payload: any;
  trace_id: string;
  created_at: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    checkConnections();
    fetchDashboardData();
  }, []);

  const checkConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('provider', 'google')
        .limit(1)
        .maybeSingle();
      
      setIsGoogleConnected(!!data && !error);
    } catch (err) {
      console.error('Error checking connections:', err);
      setIsGoogleConnected(false);
    } finally {
      setIsLoadingConnections(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      setIsLoadingData(true);

      // Fetch recent messages
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!msgError && messages) {
        setRecentMessages(messages);
      }

      // Fetch upcoming reminders
      const { data: reminders, error: remError } = await supabase
        .from('reminders')
        .select('*')
        .eq('status', 'pending')
        .gte('due_ts', new Date().toISOString())
        .order('due_ts', { ascending: true })
        .limit(5);

      if (!remError && reminders) {
        setUpcomingReminders(reminders);
      }

      // Fetch recent activity logs
      const { data: logs, error: logsError } = await supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!logsError && logs) {
        setRecentActivities(logs);
      }

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoadingData(false);
    }
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'gcal_create_event':
        return <Calendar className="w-4 h-4" />;
      case 'reminder_create':
        return <AlarmCheck className="w-4 h-4" />;
      case 'gmail_summarize_unread':
        return <Mail className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getIntentLabel = (intent: string) => {
    switch (intent) {
      case 'gcal_create_event':
        return 'Calendar Event';
      case 'reminder_create':
        return 'Reminder';
      case 'gmail_summarize_unread':
        return 'Email Summary';
      case 'fallback':
        return 'Message';
      default:
        return intent;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            AI Executive Assistant
          </h1>
          <p className="text-muted-foreground text-lg">
            Your WhatsApp-powered productivity companion
          </p>
        </header>

        {/* Main Content */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {/* Status Card */}
          <Card className="p-6 border-primary/20 hover:border-primary/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Connection Status</h2>
            </div>
            {isLoadingConnections ? (
              <p className="text-muted-foreground text-center py-4">Checking...</p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg border border-success/20 bg-success/5">
                  <span className="text-foreground">WhatsApp (Twilio)</span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-success text-sm font-medium">Connected</span>
                  </div>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg border ${
                  isGoogleConnected 
                    ? 'border-success/20 bg-success/5' 
                    : 'border-warning/20 bg-warning/5'
                }`}>
                  <span className="text-foreground">Google Workspace</span>
                  <div className="flex items-center gap-1.5">
                    {isGoogleConnected ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-success" />
                        <span className="text-success text-sm font-medium">Connected</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-warning" />
                        <span className="text-warning text-sm font-medium">Not Connected</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            <Button 
              className="w-full mt-4"
              onClick={() => navigate('/settings')}
              variant={isGoogleConnected ? "outline" : "default"}
            >
              {isGoogleConnected ? "Manage Connections" : "Connect Services"}
            </Button>
          </Card>

          {/* Recent Messages */}
          <Card className="p-6 border-accent/20 hover:border-accent/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-accent/10 rounded-lg">
                <MessageSquare className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-xl font-semibold">Recent Messages</h2>
            </div>
            {isLoadingData ? (
              <p className="text-muted-foreground text-center py-4">Loading...</p>
            ) : recentMessages.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {recentMessages.slice(0, 5).map((msg) => (
                  <div key={msg.id} className="p-3 bg-secondary/50 rounded-lg border border-border">
                    <div className="flex items-start gap-2">
                      {msg.parsed_intent?.type && getIntentIcon(msg.parsed_intent.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{msg.body || 'Voice message'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No messages yet
              </div>
            )}
          </Card>

          {/* Upcoming Reminders */}
          <Card className="p-6 border-success/20 hover:border-success/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-success/10 rounded-lg">
                <AlarmCheck className="w-6 h-6 text-success" />
              </div>
              <h2 className="text-xl font-semibold">Upcoming Reminders</h2>
            </div>
            {isLoadingData ? (
              <p className="text-muted-foreground text-center py-4">Loading...</p>
            ) : upcomingReminders.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {upcomingReminders.map((reminder) => (
                  <div key={reminder.id} className="p-3 bg-success/5 rounded-lg border border-success/20">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-success mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{reminder.text}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(reminder.due_ts), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No upcoming reminders
              </div>
            )}
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Recent Activity</h2>
          </div>
          {isLoadingData ? (
            <p className="text-muted-foreground text-center py-4">Loading...</p>
          ) : recentActivities.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentActivities.map((activity) => {
                const intentType = activity.payload?.intent || 'unknown';
                return (
                  <div key={activity.id} className="flex items-start gap-3 p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
                    <div className="p-2 bg-primary/10 rounded-md">
                      {getIntentIcon(intentType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-primary">
                          {getIntentLabel(intentType)}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Trace ID: {activity.trace_id?.substring(0, 8)}...
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-2">No recent activity</p>
              <p className="text-sm">
                Start chatting via WhatsApp to see your activity here
              </p>
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card 
            className="p-4 hover:bg-accent/5 transition-all cursor-pointer"
            onClick={() => navigate('/settings')}
          >
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">Manage Connections</h3>
                <p className="text-xs text-muted-foreground">Configure services</p>
              </div>
            </div>
          </Card>

          <Card 
            className="p-4 hover:bg-accent/5 transition-all cursor-pointer" 
            onClick={() => navigate('/privacy')}
          >
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-semibold text-sm">Privacy & Data</h3>
                <p className="text-xs text-muted-foreground">Control your data</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

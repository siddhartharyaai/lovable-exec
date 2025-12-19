import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Settings, Shield, MessageSquare, TrendingUp, Clock, CheckCircle, Lightbulb, BarChart3, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { FadeInView } from "@/components/animations/FadeInView";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ConnectionHealth } from "@/components/dashboard/ConnectionHealth";
import { EnhancedMessagesCard } from "@/components/dashboard/EnhancedMessagesCard";
import { EnhancedRemindersCard } from "@/components/dashboard/EnhancedRemindersCard";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user, profile, signOut } = useAuth();
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<Reminder[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivityLog[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [legacyUserId, setLegacyUserId] = useState<string | null>(null);
  
  // Usage insights state
  const [weeklyStats, setWeeklyStats] = useState({
    messagesCount: 0,
    remindersCount: 0,
    emailDraftsCount: 0
  });

  useEffect(() => {
    if (profile?.phone) {
      fetchLegacyUserId();
    }
  }, [profile?.phone]);

  useEffect(() => {
    if (legacyUserId) {
      checkConnections();
      fetchDashboardData();
      fetchWeeklyStats();
    }
  }, [legacyUserId]);

  const fetchLegacyUserId = async () => {
    if (!profile?.phone) return;
    
    try {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('phone', profile.phone)
        .maybeSingle();
      
      if (data) {
        setLegacyUserId(data.id);
      } else {
        setIsLoadingConnections(false);
        setIsLoadingData(false);
      }
    } catch (err) {
      console.error('Error fetching legacy user:', err);
      setIsLoadingConnections(false);
      setIsLoadingData(false);
    }
  };

  const checkConnections = async () => {
    if (!legacyUserId) return;
    
    try {
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_id', legacyUserId)
        .eq('provider', 'google')
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
    if (!legacyUserId) return;
    
    try {
      setIsLoadingData(true);

      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', legacyUserId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!msgError && messages) {
        setRecentMessages(messages);
      }

      const { data: reminders, error: remError } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', legacyUserId)
        .eq('status', 'pending')
        .gte('due_ts', new Date().toISOString())
        .order('due_ts', { ascending: true })
        .limit(5);

      if (!remError && reminders) {
        setUpcomingReminders(reminders);
      }

      const { data: logs, error: logsError } = await supabase
        .from('logs')
        .select('*')
        .eq('user_id', legacyUserId)
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

  const fetchWeeklyStats = async () => {
    if (!legacyUserId) return;
    
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const isoDate = sevenDaysAgo.toISOString();

      const { count: messagesCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', legacyUserId)
        .gte('created_at', isoDate);

      const { count: remindersCount } = await supabase
        .from('reminders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', legacyUserId)
        .gte('created_at', isoDate);

      const { count: emailDraftsCount } = await supabase
        .from('email_drafts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', legacyUserId)
        .gte('created_at', isoDate);

      setWeeklyStats({
        messagesCount: messagesCount || 0,
        remindersCount: remindersCount || 0,
        emailDraftsCount: emailDraftsCount || 0
      });
    } catch (err) {
      console.error('Error fetching weekly stats:', err);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const totalInteractions = weeklyStats.messagesCount;
  const remindersCompleted = weeklyStats.remindersCount;
  const emailDraftsCreated = weeklyStats.emailDraftsCount;
  const timeSaved = Math.max(1, Math.floor((totalInteractions + remindersCompleted + emailDraftsCreated) * 2 / 60));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/5 to-accent/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
                Man Friday
              </h1>
              <p className="text-muted-foreground text-lg">
                {profile?.name ? `Welcome back, ${profile.name}!` : 'Your WhatsApp-powered AI executive assistant.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/settings')}
                className="hover:scale-105 transition-transform"
              >
                <Settings className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/privacy')}
                className="hover:scale-105 transition-transform"
              >
                <Shield className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleSignOut}
                className="hover:scale-105 transition-transform text-destructive hover:text-destructive"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </motion.div>

        <FadeInView className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Total Interactions"
              value={totalInteractions}
              icon={MessageSquare}
              trend={12}
            />
            <StatsCard
              title="Reminders Set"
              value={remindersCompleted}
              icon={CheckCircle}
              trend={8}
            />
            <StatsCard
              title="Hours Saved"
              value={timeSaved}
              icon={Clock}
              trend={15}
              suffix="h"
            />
            <StatsCard
              title="Email Drafts"
              value={emailDraftsCreated}
              icon={TrendingUp}
            />
          </div>
        </FadeInView>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 space-y-6">
            <FadeInView delay={0.2}>
              <Card className="p-6 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                <div className="flex items-start gap-3 mb-4">
                  <Lightbulb className="w-6 h-6 text-primary mt-1" />
                  <div>
                    <h3 className="text-xl font-bold mb-2">Getting Started with Man Friday</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try these example commands via WhatsApp to see what Man Friday can do:
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    "What's on my calendar today?",
                    "Email my lawyer and ask for an update on the contract",
                    "Remind me at 5 pm to call my investor",
                    "Summarize the PDF I just uploaded in 5 bullet points",
                    "What are my pending tasks?"
                  ].map((prompt, i) => (
                    <div
                      key={i}
                      className="text-sm p-3 bg-background/60 rounded-lg border border-border/50 hover:border-primary/40 transition-colors"
                    >
                      <span className="text-muted-foreground">"{prompt}"</span>
                    </div>
                  ))}
                </div>
              </Card>
            </FadeInView>

            <FadeInView delay={0.3}>
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Activity This Week</h3>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-primary/5 rounded-lg">
                    <div className="text-3xl font-bold text-primary mb-1">{weeklyStats.messagesCount}</div>
                    <div className="text-xs text-muted-foreground">Messages</div>
                  </div>
                  <div className="text-center p-4 bg-accent/5 rounded-lg">
                    <div className="text-3xl font-bold text-accent mb-1">{weeklyStats.remindersCount}</div>
                    <div className="text-xs text-muted-foreground">Reminders</div>
                  </div>
                  <div className="text-center p-4 bg-success/5 rounded-lg">
                    <div className="text-3xl font-bold text-success mb-1">{weeklyStats.emailDraftsCount}</div>
                    <div className="text-xs text-muted-foreground">Email Drafts</div>
                  </div>
                </div>
              </Card>
            </FadeInView>
            
            <EnhancedMessagesCard
              messages={recentMessages}
              isLoading={isLoadingData}
            />
            
            <ActivityTimeline
              activities={recentActivities}
              isLoading={isLoadingData}
            />
          </div>

          <div className="space-y-6">
            <ConnectionHealth
              isGoogleConnected={isGoogleConnected}
              isLoading={isLoadingConnections}
              onRefresh={checkConnections}
              phoneNumber={profile?.phone}
            />
            
            <EnhancedRemindersCard
              reminders={upcomingReminders}
              isLoading={isLoadingData}
            />
          </div>
        </div>

        <QuickActions />

        <FadeInView delay={0.6} className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                className="w-full h-auto py-6 justify-start hover:bg-primary/5 hover:border-primary/40 transition-all"
                onClick={() => navigate('/settings')}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Settings className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold mb-1">Manage Connections</h3>
                    <p className="text-sm text-muted-foreground">
                      Connect Google Workspace, WhatsApp, and more
                    </p>
                  </div>
                </div>
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                className="w-full h-auto py-6 justify-start hover:bg-accent/5 hover:border-accent/40 transition-all"
                onClick={() => navigate('/privacy')}
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-accent/10 rounded-lg">
                    <Shield className="w-6 h-6 text-accent" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold mb-1">Privacy & Data</h3>
                    <p className="text-sm text-muted-foreground">
                      Export your data or manage your account
                    </p>
                  </div>
                </div>
              </Button>
            </motion.div>
          </div>
        </FadeInView>
      </div>
    </div>
  );
};

export default Dashboard;

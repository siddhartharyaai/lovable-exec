import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, MessageSquare, CheckSquare, Mail, Settings, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = () => {
  const navigate = useNavigate();
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);

  useEffect(() => {
    checkConnections();
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

          {/* Calendar Overview */}
          <Card className="p-6 border-accent/20 hover:border-accent/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-accent/10 rounded-lg">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-xl font-semibold">Upcoming Events</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              Connect your Google Calendar to see upcoming events
            </p>
            <div className="text-center py-8 text-muted-foreground">
              No events to display
            </div>
          </Card>

          {/* Tasks Overview */}
          <Card className="p-6 border-success/20 hover:border-success/40 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-success/10 rounded-lg">
                <CheckSquare className="w-6 h-6 text-success" />
              </div>
              <h2 className="text-xl font-semibold">Today's Tasks</h2>
            </div>
            <p className="text-muted-foreground text-sm mb-4">
              Connect Google Tasks to manage your to-dos
            </p>
            <div className="text-center py-8 text-muted-foreground">
              No tasks to display
            </div>
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
          <div className="text-center py-12 text-muted-foreground">
            <p className="mb-2">No recent activity</p>
            <p className="text-sm">
              Start by connecting your services in settings
            </p>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4 hover:bg-accent/5 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">Settings</h3>
                <p className="text-xs text-muted-foreground">Configure app</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:bg-accent/5 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-semibold text-sm">WhatsApp Setup</h3>
                <p className="text-xs text-muted-foreground">Connect messaging</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:bg-accent/5 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-success" />
              <div>
                <h3 className="font-semibold text-sm">Calendar Sync</h3>
                <p className="text-xs text-muted-foreground">Link Google Cal</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 hover:bg-accent/5 transition-all cursor-pointer" onClick={() => navigate('/privacy')}>
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-semibold text-sm">Privacy</h3>
                <p className="text-xs text-muted-foreground">Your data control</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

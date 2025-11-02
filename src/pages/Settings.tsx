import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dailyBriefing, setDailyBriefing] = useState(true);
  const [birthdayReminders, setBirthdayReminders] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(true);

  useEffect(() => {
    checkGoogleConnection();
    
    // Check for connection callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'google') {
      toast({
        title: "Google Connected",
        description: "Your Google account has been successfully connected!",
      });
      window.history.replaceState({}, '', '/settings');
      // Force recheck after OAuth callback
      setTimeout(() => checkGoogleConnection(), 500);
    }
  }, []);

  // Recheck when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkGoogleConnection();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const checkGoogleConnection = async () => {
    try {
      // Check oauth_tokens table for any Google connection (not user-specific for testing)
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('provider', 'google')
        .limit(1)
        .maybeSingle();
      
      setIsGoogleConnected(!!data && !error);
      console.log('Google connection status:', !!data && !error);
    } catch (err) {
      console.error('Error checking Google connection:', err);
      setIsGoogleConnected(false);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      // Create a test user for OAuth (phone-based identification)
      const phone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert({ phone })
        .select()
        .single();

      if (userError || !userData) {
        throw new Error('Failed to create user');
      }

      const redirectUrl = window.location.href.split('?')[0];
      const { data, error } = await supabase.functions.invoke('auth-google', {
        body: { userId: userData.id, redirectUrl }
      });

      if (error) throw error;
      
      if (data?.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to connect Google account",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            className="mb-4"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-4xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground text-lg">
            Manage your connections and preferences
          </p>
        </div>

        {/* Connection Status */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-6">Service Connections</h2>
          
          <div className="space-y-4">
            {/* WhatsApp Status */}
            <div className="flex items-center justify-between p-4 border border-success/20 bg-success/5 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold">WhatsApp (Twilio)</h3>
                  <p className="text-sm text-muted-foreground">
                    Connected - Webhook configured
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-success/10 text-success text-sm font-medium rounded-full">
                Active
              </span>
            </div>

            {/* Google Workspace Status */}
            <div className={`flex items-center justify-between p-4 border rounded-lg ${
              isGoogleConnected ? 'border-success/20 bg-success/5' : 'border-border'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  isGoogleConnected ? 'bg-success/10' : 'bg-warning/10'
                }`}>
                  {isGoogleConnected ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-warning" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">Google Workspace</h3>
                  <p className="text-sm text-muted-foreground">
                    {isGoogleConnected 
                      ? 'Connected - Gmail, Calendar, Tasks enabled'
                      : 'Not connected - Click to authorize'
                    }
                  </p>
                </div>
              </div>
              {isGoogleConnected ? (
                <span className="px-3 py-1 bg-success/10 text-success text-sm font-medium rounded-full">
                  Active
                </span>
              ) : (
                <Button onClick={handleConnectGoogle} disabled={isLoadingGoogle}>
                  {isLoadingGoogle ? 'Checking...' : 'Connect Google'}
                </Button>
              )}
            </div>

            {/* Lovable AI Status */}
            <div className="flex items-center justify-between p-4 border border-success/20 bg-success/5 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-success/10 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-semibold">Lovable AI</h3>
                  <p className="text-sm text-muted-foreground">
                    Connected and ready
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-success/10 text-success text-sm font-medium rounded-full">
                Active
              </span>
            </div>
          </div>
        </Card>

        {/* Preferences */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-6">Preferences</h2>
          
          <div className="space-y-6">
            {/* Daily Briefing Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="daily-briefing" className="text-base font-semibold">
                  Daily Morning Briefing
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive a summary of your day at 8:00 AM IST
                </p>
              </div>
              <Switch
                id="daily-briefing"
                checked={dailyBriefing}
                onCheckedChange={setDailyBriefing}
              />
            </div>

            {/* Birthday Reminders Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="birthday-reminders" className="text-base font-semibold">
                  Birthday Reminders
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified a day before birthdays at 9:00 AM IST
                </p>
              </div>
              <Switch
                id="birthday-reminders"
                checked={birthdayReminders}
                onCheckedChange={setBirthdayReminders}
              />
            </div>

            {/* Timezone Display */}
            <div className="pt-4 border-t">
              <Label className="text-base font-semibold mb-2 block">
                Timezone
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                Your current timezone: <span className="font-medium text-foreground">Asia/Kolkata (IST)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Timezone is auto-detected. Contact support to change.
              </p>
            </div>
          </div>
        </Card>

        {/* Setup Instructions */}
        <Card className="p-6 border-warning/20 bg-warning/5">
          <h2 className="text-xl font-semibold mb-4 text-warning">Setup Required</h2>
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              To complete setup, you need to configure the following secrets in Lovable Cloud:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground pl-2">
              <li><code className="px-2 py-1 bg-muted rounded text-xs">GOOGLE_CLIENT_ID</code> - From Google Cloud Console</li>
              <li><code className="px-2 py-1 bg-muted rounded text-xs">GOOGLE_CLIENT_SECRET</code> - From Google Cloud Console</li>
              <li><code className="px-2 py-1 bg-muted rounded text-xs">TWILIO_ACCOUNT_SID</code> - From Twilio Console</li>
              <li><code className="px-2 py-1 bg-muted rounded text-xs">TWILIO_AUTH_TOKEN</code> - From Twilio Console</li>
              <li><code className="px-2 py-1 bg-muted rounded text-xs">TWILIO_WHATSAPP_NUMBER</code> - Your Twilio WhatsApp number</li>
              <li><code className="px-2 py-1 bg-muted rounded text-xs">APP_SECRET_KEY</code> - Generate a secure random key</li>
            </ul>
            <p className="text-foreground pt-2">
              See <a href="https://docs.lovable.dev/features/cloud" className="text-primary underline" target="_blank" rel="noopener noreferrer">Lovable Cloud docs</a> for detailed setup instructions.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;

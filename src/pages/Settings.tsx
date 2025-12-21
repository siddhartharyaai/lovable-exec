import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [dailyBriefing, setDailyBriefing] = useState(true);
  const [birthdayReminders, setBirthdayReminders] = useState(true);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [legacyUserId, setLegacyUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [isSavingCity, setIsSavingCity] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [briefingTime, setBriefingTime] = useState("08:00");
  const [gmailTabPreference, setGmailTabPreference] = useState("primary");
  const [briefingSections, setBriefingSections] = useState({
    weather: true,
    news: true,
    tasks: true,
    calendar: true,
    emails: true,
    reminders: true
  });
  const [isSavingBriefing, setIsSavingBriefing] = useState(false);

  // Get phone from profile
  const phoneNumber = profile?.phone || "";

  // Initialize from profile
  useEffect(() => {
    if (profile) {
      setUserName(profile.name || "");
      setCity(profile.city || "Mumbai");
      setUserEmail(profile.email || "");
      if (profile.briefing_time) setBriefingTime(profile.briefing_time);
      if (profile.gmail_tab_preference) setGmailTabPreference(profile.gmail_tab_preference);
      if (profile.briefing_sections) setBriefingSections(profile.briefing_sections as typeof briefingSections);
      setDailyBriefing(profile.daily_briefing_enabled);
      setBirthdayReminders(profile.birthday_reminders_enabled);
    }
  }, [profile]);

  // Check Google connection using authenticated user
  const checkGoogleConnection = async () => {
    if (!user) {
      setIsLoadingGoogle(false);
      return;
    }
    
    try {
      // First check oauth_tokens with auth user id
      const { data: tokenData } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle();
      
      if (tokenData) {
        setIsGoogleConnected(true);
        setIsLoadingGoogle(false);
        return;
      }

      // Fallback: check via phone in legacy users table
      if (phoneNumber) {
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('phone', phoneNumber)
          .maybeSingle();

        if (userData) {
          setLegacyUserId(userData.id);
          const { data: legacyToken } = await supabase
            .from('oauth_tokens')
            .select('id')
            .eq('user_id', userData.id)
            .eq('provider', 'google')
            .maybeSingle();
          setIsGoogleConnected(!!legacyToken);
        }
      }
    } catch (err) {
      console.error('Error checking Google connection:', err);
      setIsGoogleConnected(false);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkGoogleConnection();
    }
    
    // Check for connection callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'google') {
      toast({
        title: "Google Connected",
        description: "Your Google account has been successfully connected!",
      });
      window.history.replaceState({}, '', '/settings');
      setTimeout(() => checkGoogleConnection(), 500);
    }
  }, [user]);

  // Recheck when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user) {
        checkGoogleConnection();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleConnectGoogle = async () => {
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in first",
        variant: "destructive",
      });
      return;
    }

    if (isConnectingGoogle) return;

    setIsConnectingGoogle(true);
    try {
      // Look up legacy user ID from users table (required for logs FK constraint)
      let userIdForOAuth = user.id;

      if (phoneNumber) {
        const { data: legacyUser } = await supabase
          .from('users')
          .select('id')
          .eq('phone', phoneNumber)
          .maybeSingle();

        if (legacyUser?.id) {
          userIdForOAuth = legacyUser.id;
          console.log('Using legacy user ID for OAuth:', userIdForOAuth);
        }
      }

      const redirectUrl = window.location.href.split('?')[0];
      const { data, error } = await supabase.functions.invoke('auth-google', {
        body: { userId: userIdForOAuth, redirectUrl }
      });

      if (error) throw error;

      if (data?.authUrl) {
        toast({
          title: "Redirecting to Google",
          description: "Please sign in with your Google account",
        });
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Failed to connect Google account",
        variant: "destructive",
      });
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user) return;

    if (!window.confirm('Are you sure you want to disconnect Google Workspace? You will need to reconnect to use Calendar, Gmail, Tasks, and Drive features.')) {
      return;
    }

    try {
      // Delete OAuth tokens for this user
      const { error: deleteError } = await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google');

      if (deleteError) throw deleteError;

      // Also try to delete via legacy user id if exists
      if (legacyUserId) {
        await supabase
          .from('oauth_tokens')
          .delete()
          .eq('user_id', legacyUserId)
          .eq('provider', 'google');
      }

      setIsGoogleConnected(false);
      setUserEmail("");
      
      toast({
        title: "Google Disconnected",
        description: "Your Google account has been disconnected successfully",
      });
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      toast({
        title: "Disconnection failed",
        description: error instanceof Error ? error.message : "Failed to disconnect Google account",
        variant: "destructive",
      });
    }
  };

  const handleSaveProfile = async (updates: Record<string, unknown>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;
      await refreshProfile();
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      throw error;
    }
  };

  const handleSaveCity = async () => {
    if (!user || !city) return;

    setIsSavingCity(true);
    try {
      await handleSaveProfile({ city });
      toast({
        title: "City Updated",
        description: `Your city has been set to ${city} for weather forecasts`,
      });
    } catch (error) {
      toast({
        title: "Failed to save city",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSavingCity(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || !userName) return;

    setIsSavingName(true);
    try {
      await handleSaveProfile({ name: userName });
      toast({
        title: "Name Updated",
        description: `Your name has been set to ${userName}`,
      });
    } catch (error) {
      toast({
        title: "Failed to save name",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveBriefingSettings = async () => {
    if (!user) return;

    setIsSavingBriefing(true);
    try {
      await handleSaveProfile({
        briefing_time: briefingTime,
        gmail_tab_preference: gmailTabPreference,
        briefing_sections: briefingSections
      });
      toast({
        title: "Briefing Settings Updated",
        description: `Your daily briefing will arrive at ${briefingTime} IST`,
      });
    } catch (error) {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSavingBriefing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
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
              Manage your connections and preferences for Man Friday.
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Account Info */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Account</h2>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Signed in as: <span className="font-medium text-foreground">{user?.email}</span>
            </p>
            {phoneNumber && (
              <p className="text-sm text-muted-foreground">
                WhatsApp: <span className="font-medium text-foreground">{phoneNumber}</span>
              </p>
            )}
          </div>
        </Card>

        {/* Connection Status */}
        <Card className="p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-6">Service Connections</h2>
          
          <div className="space-y-4">
            {/* WhatsApp Status */}
            <div className={`flex items-center justify-between p-4 border rounded-lg ${
              phoneNumber ? 'border-success/20 bg-success/5' : 'border-border'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${phoneNumber ? 'bg-success/10' : 'bg-warning/10'}`}>
                  {phoneNumber ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <XCircle className="w-5 h-5 text-warning" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">
                    {phoneNumber ? `Connected - ${phoneNumber}` : 'Not configured - Complete onboarding'}
                  </p>
                </div>
              </div>
              {phoneNumber ? (
                <span className="px-3 py-1 bg-success/10 text-success text-sm font-medium rounded-full">
                  Active
                </span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
                  Setup
                </Button>
              )}
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
                      ? `Connected${userEmail ? ` - ${userEmail}` : ''} - Gmail, Calendar, Tasks enabled`
                      : 'Not connected - Click to authorize'
                    }
                  </p>
                </div>
              </div>
              {isGoogleConnected ? (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDisconnectGoogle}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onClick={handleConnectGoogle} disabled={isLoadingGoogle || isConnectingGoogle}>
                  {isLoadingGoogle ? 'Checking...' : isConnectingGoogle ? 'Connecting...' : 'Connect Google'}
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
                  Receive a summary of your day at your configured time
                </p>
              </div>
              <Switch
                id="daily-briefing"
                checked={dailyBriefing}
                onCheckedChange={async (checked) => {
                  setDailyBriefing(checked);
                  try {
                    await handleSaveProfile({ daily_briefing_enabled: checked });
                    toast({
                      title: checked ? "Daily Briefing Enabled" : "Daily Briefing Disabled",
                      description: checked ? "You'll receive morning briefings at your configured time" : "Morning briefings are now turned off",
                    });
                  } catch (error) {
                    setDailyBriefing(!checked); // Revert on error
                    toast({
                      title: "Failed to save setting",
                      description: "Please try again",
                      variant: "destructive",
                    });
                  }
                }}
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
                onCheckedChange={async (checked) => {
                  setBirthdayReminders(checked);
                  try {
                    await handleSaveProfile({ birthday_reminders_enabled: checked });
                    toast({
                      title: checked ? "Birthday Reminders Enabled" : "Birthday Reminders Disabled",
                      description: checked ? "You'll be notified about upcoming birthdays" : "Birthday reminders are now turned off",
                    });
                  } catch (error) {
                    setBirthdayReminders(!checked); // Revert on error
                    toast({
                      title: "Failed to save setting",
                      description: "Please try again",
                      variant: "destructive",
                    });
                  }
                }}
              />
            </div>

            {/* Your Name Setting */}
            <div className="pt-4 border-t">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="user-name" className="text-base font-semibold">
                    Your Name
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Used in email signatures and personalization
                  </p>
                </div>
                <div className="flex gap-3 max-w-md">
                  <Input
                    id="user-name"
                    type="text"
                    placeholder="Your full name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSaveName} 
                    disabled={isSavingName || !userName}
                    size="default"
                  >
                    {isSavingName ? 'Saving...' : 'Save Name'}
                  </Button>
                </div>
              </div>
            </div>

            {/* City Setting */}
            <div className="pt-4 border-t">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="city" className="text-base font-semibold">
                    Your City
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Used for weather forecasts in your daily briefing
                  </p>
                </div>
                <div className="flex gap-3 max-w-md">
                  <Input
                    id="city"
                    type="text"
                    placeholder="Mumbai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSaveCity} 
                    disabled={isSavingCity}
                    size="default"
                  >
                    {isSavingCity ? 'Saving...' : 'Save City'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Timezone Display */}
            <div className="pt-4 border-t">
              <Label className="text-base font-semibold mb-2 block">
                Timezone
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                Your current timezone: <span className="font-medium text-foreground">{profile?.tz || 'Asia/Kolkata'} (IST)</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Timezone is auto-detected. Contact support to change.
              </p>
            </div>
          </div>
        </Card>

        {/* Daily Briefing Settings */}
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-6">Daily Briefing Settings</h2>
          
          <div className="space-y-6">
            {/* Briefing Time */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="briefing-time" className="text-base font-semibold">
                  Briefing Time
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  What time would you like to receive your daily briefing? (IST)
                </p>
              </div>
              <Input
                id="briefing-time"
                type="time"
                value={briefingTime}
                onChange={(e) => setBriefingTime(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Gmail Tab Preference */}
            <div className="space-y-3 pt-4 border-t">
              <div>
                <Label htmlFor="gmail-tab" className="text-base font-semibold">
                  Gmail Tab
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Which Gmail tab should be checked for unread emails?
                </p>
              </div>
              <select
                id="gmail-tab"
                value={gmailTabPreference}
                onChange={(e) => setGmailTabPreference(e.target.value)}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="primary">Primary Only</option>
                <option value="all">All Mail</option>
                <option value="promotions">Promotions</option>
                <option value="updates">Updates</option>
              </select>
            </div>

            {/* Briefing Sections */}
            <div className="space-y-3 pt-4 border-t">
              <div>
                <Label className="text-base font-semibold mb-3 block">
                  Briefing Sections
                </Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which sections to include in your daily briefing
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-weather">Weather</Label>
                  <Switch
                    id="section-weather"
                    checked={briefingSections.weather}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, weather: checked})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-news">News Headlines</Label>
                  <Switch
                    id="section-news"
                    checked={briefingSections.news}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, news: checked})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-tasks">Tasks</Label>
                  <Switch
                    id="section-tasks"
                    checked={briefingSections.tasks}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, tasks: checked})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-calendar">Calendar Events</Label>
                  <Switch
                    id="section-calendar"
                    checked={briefingSections.calendar}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, calendar: checked})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-emails">Emails</Label>
                  <Switch
                    id="section-emails"
                    checked={briefingSections.emails}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, emails: checked})}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="section-reminders">Reminders</Label>
                  <Switch
                    id="section-reminders"
                    checked={briefingSections.reminders}
                    onCheckedChange={(checked) => setBriefingSections({...briefingSections, reminders: checked})}
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t">
              <Button 
                onClick={handleSaveBriefingSettings} 
                disabled={isSavingBriefing}
                size="default"
              >
                {isSavingBriefing ? 'Saving...' : 'Save Briefing Settings'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;

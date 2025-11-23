import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  const [phoneNumber, setPhoneNumber] = useState("+919821230311");
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [city, setCity] = useState("Mumbai");
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
    if (!phoneNumber) {
      setIsLoadingGoogle(false);
      return;
    }
    
    try {
      // Check if this specific phone number has Google connected
      const { data: userData } = await supabase
        .from('users')
        .select('id, email, name, city, briefing_time, gmail_tab_preference, briefing_sections')
        .eq('phone', phoneNumber)
        .maybeSingle();
      
      if (!userData) {
        setIsGoogleConnected(false);
        setIsLoadingGoogle(false);
        return;
      }

      if (userData.email) {
        setUserEmail(userData.email);
      }
      if (userData.name) {
        setUserName(userData.name);
      }
      if (userData.city) {
        setCity(userData.city);
      }
      if (userData.briefing_time) {
        setBriefingTime(userData.briefing_time);
      }
      if (userData.gmail_tab_preference) {
        setGmailTabPreference(userData.gmail_tab_preference);
      }
      if (userData.briefing_sections) {
        setBriefingSections(userData.briefing_sections as any);
      }

      const { data: tokenData } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_id', userData.id)
        .eq('provider', 'google')
        .maybeSingle();
      
      setIsGoogleConnected(!!tokenData);
      console.log('Google connection status for', phoneNumber, ':', !!tokenData);
    } catch (err) {
      console.error('Error checking Google connection:', err);
      setIsGoogleConnected(false);
    } finally {
      setIsLoadingGoogle(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!phoneNumber) {
      toast({
        title: "Phone number required",
        description: "Please enter your WhatsApp phone number",
        variant: "destructive",
      });
      return;
    }

    try {
      // Upsert user by phone number
      const { data: userData, error: userError } = await supabase
        .from('users')
        .upsert(
          { phone: phoneNumber, updated_at: new Date().toISOString() },
          { onConflict: 'phone' }
        )
        .select()
        .single();

      if (userError || !userData) {
        throw new Error('Failed to create/find user');
      }

      console.log('Using user ID:', userData.id, 'for phone:', phoneNumber);

      const redirectUrl = window.location.href.split('?')[0];
      const { data, error } = await supabase.functions.invoke('auth-google', {
        body: { userId: userData.id, redirectUrl }
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
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!phoneNumber) return;

    // Confirm disconnection
    if (!window.confirm('Are you sure you want to disconnect Google Workspace? You will need to reconnect to use Calendar, Gmail, Tasks, and Drive features.')) {
      return;
    }

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneNumber)
        .maybeSingle();
      
      if (!userData) {
        throw new Error('User not found');
      }

      // Delete OAuth tokens
      const { error: deleteError } = await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', userData.id)
        .eq('provider', 'google');

      if (deleteError) {
        throw deleteError;
      }

      // Clear email from user record
      await supabase
        .from('users')
        .update({ email: null })
        .eq('id', userData.id);

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

  const handleSaveCity = async () => {
    if (!phoneNumber || !city) return;

    setIsSavingCity(true);
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneNumber)
        .maybeSingle();
      
      if (!userData) {
        throw new Error('User not found. Please enter your WhatsApp number.');
      }

      const { error } = await supabase
        .from('users')
        .update({ city: city })
        .eq('id', userData.id);

      if (error) throw error;

      toast({
        title: "City Updated",
        description: `Your city has been set to ${city} for weather forecasts`,
      });
    } catch (error) {
      console.error('Error saving city:', error);
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
    if (!phoneNumber || !userName) return;

    setIsSavingName(true);
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneNumber)
        .maybeSingle();
      
      if (!userData) {
        throw new Error('User not found. Please enter your WhatsApp phone number.');
      }

      const { error } = await supabase
        .from('users')
        .update({ name: userName })
        .eq('id', userData.id);

      if (error) throw error;

      toast({
        title: "Name Updated",
        description: `Your name has been set to ${userName} for email signatures`,
      });
    } catch (error) {
      console.error('Error saving name:', error);
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
    if (!phoneNumber) return;

    setIsSavingBriefing(true);
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneNumber)
        .maybeSingle();
      
      if (!userData) {
        throw new Error('User not found. Please enter your WhatsApp phone number.');
      }

      const { error } = await supabase
        .from('users')
        .update({ 
          briefing_time: briefingTime,
          gmail_tab_preference: gmailTabPreference,
          briefing_sections: briefingSections
        })
        .eq('id', userData.id);

      if (error) throw error;

      toast({
        title: "Briefing Settings Updated",
        description: `Your daily briefing will arrive at ${briefingTime} IST`,
      });
    } catch (error) {
      console.error('Error saving briefing settings:', error);
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
            Manage your connections and preferences for Man Friday.
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
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Your WhatsApp Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+919821230311"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onBlur={checkGoogleConnection}
                  className="max-w-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your WhatsApp number to link with Google account
                </p>
              </div>

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
                  <Button onClick={handleConnectGoogle} disabled={isLoadingGoogle || !phoneNumber}>
                    {isLoadingGoogle ? 'Checking...' : 'Connect Google'}
                  </Button>
                )}
              </div>
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
                    disabled={isSavingName || !phoneNumber || !userName}
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
                    disabled={isSavingCity || !phoneNumber}
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
                Your current timezone: <span className="font-medium text-foreground">Asia/Kolkata (IST)</span>
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
                disabled={isSavingBriefing || !phoneNumber}
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

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, MessageSquare, Settings, Smartphone, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type OnboardingStep = 'phone' | 'google' | 'whatsapp' | 'complete';

const Onboarding = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, profile, refreshProfile } = useAuth();
  
  // Check if returning from Google OAuth
  const isGoogleConnected = searchParams.get('connected') === 'google';
  
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(isGoogleConnected ? 'whatsapp' : 'phone');
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Initialize from profile if available
  useEffect(() => {
    if (profile?.phone) {
      setPhoneNumber(profile.phone);
    }
  }, [profile]);

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    let cleaned = value.replace(/[^\d+]/g, '');
    if (cleaned && !cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  };

  const handlePhoneSubmit = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid WhatsApp phone number with country code",
        variant: "destructive",
      });
      return;
    }

    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update the profile with phone number
      const { error } = await supabase
        .from('profiles')
        .update({ 
          phone: phoneNumber,
          updated_at: new Date().toISOString() 
        })
        .eq('id', user.id);

      if (error) throw error;

      // Also update the legacy users table for backward compatibility with WhatsApp webhook
      await supabase
        .from('users')
        .upsert(
          { 
            phone: phoneNumber, 
            name: profile?.name || null,
            auth_user_id: user.id,
            updated_at: new Date().toISOString() 
          },
          { onConflict: 'phone' }
        );

      await refreshProfile();
      
      toast({
        title: "Phone Number Saved",
        description: "Your WhatsApp number has been linked!",
      });
      
      setCurrentStep('google');
    } catch (error) {
      console.error('Error saving phone:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save phone number",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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

    setIsGoogleLoading(true);
    try {
      // Get the legacy user ID for Google OAuth (which uses the users table)
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('phone', phoneNumber)
        .maybeSingle();

      const userIdForOAuth = userData?.id || user.id;

      const redirectUrl = `${window.location.origin}/onboarding`;
      const { data, error } = await supabase.functions.invoke('auth-google', {
        body: { userId: userIdForOAuth, redirectUrl }
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
      setIsGoogleLoading(false);
    }
  };

  const handleSkipGoogle = () => {
    setCurrentStep('whatsapp');
  };

  const handleWhatsAppComplete = () => {
    setCurrentStep('complete');
  };

  const handleFinish = async () => {
    if (!user) return;

    try {
      // Mark onboarding as complete
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      await refreshProfile();
      navigate('/dashboard');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      navigate('/dashboard');
    }
  };

  const steps = [
    { key: 'phone', label: 'Phone', icon: Smartphone },
    { key: 'google', label: 'Google', icon: Settings },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { key: 'complete', label: 'Done', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress Steps */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              
              return (
                <div key={step.key} className="flex items-center">
                  <motion.div
                    initial={false}
                    animate={{
                      scale: isActive ? 1.1 : 1,
                      backgroundColor: isCompleted ? 'hsl(var(--success))' : isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                    }}
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Icon className={`w-5 h-5 ${isCompleted || isActive ? 'text-white' : 'text-muted-foreground'}`} />
                  </motion.div>
                  {index < steps.length - 1 && (
                    <div className={`w-12 h-0.5 mx-1 transition-colors ${isCompleted ? 'bg-success' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Phone Number */}
          {currentStep === 'phone' && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 border-border/50 bg-card/80 backdrop-blur-sm">
                <div className="text-center mb-8">
                  <div className="inline-flex p-4 bg-primary/10 rounded-full mb-4">
                    <Smartphone className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2">Link Your WhatsApp</h1>
                  <p className="text-muted-foreground">
                    Enter your WhatsApp phone number to start using Man Friday.
                  </p>
                  {profile?.name && (
                    <p className="text-sm text-primary mt-2">
                      Welcome, {profile.name}!
                    </p>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="phone">WhatsApp Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+919821230311"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                      className="text-lg"
                    />
                    <p className="text-xs text-muted-foreground">
                      Include country code (e.g., +91 for India, +1 for US)
                    </p>
                  </div>

                  <Button 
                    onClick={handlePhoneSubmit} 
                    disabled={isLoading || !phoneNumber}
                    className="w-full py-6 text-lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Google OAuth */}
          {currentStep === 'google' && (
            <motion.div
              key="google"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 border-border/50 bg-card/80 backdrop-blur-sm">
                <div className="text-center mb-8">
                  <div className="inline-flex p-4 bg-primary/10 rounded-full mb-4">
                    <Settings className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2">Connect Google Workspace</h1>
                  <p className="text-muted-foreground">
                    Link your Google account to enable Calendar, Gmail, Tasks, and Drive features.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <p className="font-medium">Man Friday will be able to:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• View and manage your Google Calendar events</li>
                      <li>• Read and send emails on your behalf</li>
                      <li>• Access and manage your Google Tasks</li>
                      <li>• Read files from Google Drive</li>
                      <li>• Access your Google Contacts</li>
                    </ul>
                  </div>

                  <Button 
                    onClick={handleConnectGoogle} 
                    disabled={isGoogleLoading}
                    className="w-full py-6 text-lg"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Connect Google Account
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-4">
                    <Button 
                      variant="ghost" 
                      onClick={() => setCurrentStep('phone')}
                      className="flex-1"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleSkipGoogle}
                      className="flex-1"
                    >
                      Skip for now
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Step 3: WhatsApp Setup */}
          {currentStep === 'whatsapp' && (
            <motion.div
              key="whatsapp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 border-border/50 bg-card/80 backdrop-blur-sm">
                <div className="text-center mb-8">
                  <div className="inline-flex p-4 bg-success/10 rounded-full mb-4">
                    <MessageSquare className="w-8 h-8 text-success" />
                  </div>
                  <h1 className="text-3xl font-bold mb-2">Start Chatting</h1>
                  <p className="text-muted-foreground">
                    Send your first message to Man Friday on WhatsApp to activate your assistant.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="bg-success/10 border border-success/20 rounded-lg p-6 text-center">
                    <p className="font-medium mb-2">Man Friday WhatsApp Number:</p>
                    <p className="text-2xl font-mono font-bold text-success">+1 (415) 523-8886</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Save this number and send "Hi" to get started
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="font-medium">Try these commands:</p>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>"What's on my calendar today?"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>"Give me my briefing"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>"Remind me to call John tomorrow at 3pm"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>"Summarize my unread emails"</span>
                      </li>
                    </ul>
                  </div>

                  <Button 
                    onClick={handleWhatsAppComplete}
                    className="w-full py-6 text-lg"
                  >
                    I've sent my first message
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>

                  <Button 
                    variant="outline" 
                    onClick={() => setCurrentStep('google')}
                    className="w-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="p-8 border-success/20 bg-card/80 backdrop-blur-sm">
                <div className="text-center mb-8">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="inline-flex p-4 bg-success/10 rounded-full mb-4"
                  >
                    <CheckCircle2 className="w-12 h-12 text-success" />
                  </motion.div>
                  <h1 className="text-3xl font-bold mb-2">You're All Set!</h1>
                  <p className="text-muted-foreground">
                    Man Friday is ready to assist you. Start chatting on WhatsApp anytime.
                  </p>
                </div>

                <div className="space-y-4">
                  <Button 
                    onClick={handleFinish}
                    className="w-full py-6 text-lg"
                  >
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;

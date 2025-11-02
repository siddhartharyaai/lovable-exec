import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bot, Calendar, Mail, CheckSquare, MessageSquare, Zap, Shield, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-primary/10 border border-primary/20 rounded-full">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Powered by Lovable AI</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Your AI Executive Assistant
            <br />
            <span className="text-primary">Right in WhatsApp</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Manage your calendar, email, tasks, and more through natural conversation. 
            Get proactive briefings and never miss what matters.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6"
              onClick={() => navigate('/dashboard')}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Get Started
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6"
              onClick={() => navigate('/settings')}
            >
              <Shield className="w-5 h-5 mr-2" />
              View Setup Guide
            </Button>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap gap-6 justify-center items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-success" />
              <span>End-to-end Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              <span>Instant Responses</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <span>Proactive Assistance</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything You Need, In One Chat
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Seamlessly integrated with Google Workspace. Voice or text. Simple and powerful.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          {/* Feature 1 */}
          <Card className="p-6 border-primary/20 hover:border-primary/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
              <Calendar className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Smart Calendar</h3>
            <p className="text-muted-foreground">
              "Block 30 mins tomorrow for team sync" - and it's done. View, create, and manage events naturally.
            </p>
          </Card>

          {/* Feature 2 */}
          <Card className="p-6 border-accent/20 hover:border-accent/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-accent/10 rounded-lg w-fit mb-4">
              <Mail className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Email Intelligence</h3>
            <p className="text-muted-foreground">
              Get smart summaries of important emails. Draft replies with AI. Never miss what matters.
            </p>
          </Card>

          {/* Feature 3 */}
          <Card className="p-6 border-success/20 hover:border-success/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-success/10 rounded-lg w-fit mb-4">
              <CheckSquare className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Task Management</h3>
            <p className="text-muted-foreground">
              "Add review Q4 budget to my tasks" - instant sync with Google Tasks. Check off as you go.
            </p>
          </Card>

          {/* Feature 4 */}
          <Card className="p-6 border-warning/20 hover:border-warning/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-warning/10 rounded-lg w-fit mb-4">
              <Clock className="w-8 h-8 text-warning" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Daily Briefings</h3>
            <p className="text-muted-foreground">
              Every morning at 8 AM IST: your schedule, top tasks, and important emails in one message.
            </p>
          </Card>

          {/* Feature 5 */}
          <Card className="p-6 border-primary/20 hover:border-primary/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Voice & Text</h3>
            <p className="text-muted-foreground">
              Send voice notes while driving. Type when convenient. The AI understands both perfectly.
            </p>
          </Card>

          {/* Feature 6 */}
          <Card className="p-6 border-accent/20 hover:border-accent/40 hover:shadow-lg transition-all duration-300">
            <div className="p-3 bg-accent/10 rounded-lg w-fit mb-4">
              <Shield className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Privacy First</h3>
            <p className="text-muted-foreground">
              Your data, encrypted. Export anytime. Delete anytime. No ads, no selling data. Period.
            </p>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12">
            How It Works
          </h2>
          
          <div className="space-y-8">
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-lg">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Connect Your Accounts</h3>
                <p className="text-muted-foreground">
                  Link Google Workspace and WhatsApp. One-time setup, secure OAuth. Takes 2 minutes.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-accent text-accent-foreground rounded-full flex items-center justify-center font-bold text-lg">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Chat Naturally</h3>
                <p className="text-muted-foreground">
                  Send messages or voice notes. "Remind me to call mom at 7 pm." "What's on my calendar tomorrow?"
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-12 h-12 bg-success text-success-foreground rounded-full flex items-center justify-center font-bold text-lg">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Get Things Done</h3>
                <p className="text-muted-foreground">
                  The AI handles the rest. Creates events, sends reminders, summarizes emails, manages tasks.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-4xl mx-auto p-12 text-center border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to Reclaim Your Time?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join busy professionals who've made WhatsApp their productivity command center.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6"
              onClick={() => navigate('/dashboard')}
            >
              Start Free Setup
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-6"
              onClick={() => navigate('/privacy')}
            >
              Read Privacy Policy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            Free during beta · No credit card required · Setup in 5 minutes
          </p>
        </Card>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© 2025 AI Executive Assistant. Built with Lovable.</p>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="/TERMS.md" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Terms</a>
            <a href="https://docs.lovable.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

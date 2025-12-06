import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bot, Calendar, Mail, CheckSquare, MessageSquare, Zap, Shield, Clock, FileText, Users, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FadeInView } from "@/components/animations/FadeInView";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Calendar,
      title: "Smart Calendar",
      description: "\"Block 30 mins tomorrow for team sync\" - and it's done. View, create, and manage events naturally.",
      color: "primary",
    },
    {
      icon: Mail,
      title: "Email Intelligence",
      description: "Summarize unread emails, draft replies, or send messages—all without opening your inbox.",
      color: "accent",
    },
    {
      icon: CheckSquare,
      title: "Task Management",
      description: "Create to-dos, check off tasks, and get reminded when deadlines approach.",
      color: "warning",
    },
    {
      icon: MessageSquare,
      title: "Daily Briefings",
      description: "Wake up to a summary of your day: calendar, emails, tasks, and weather.",
      color: "success",
    },
    {
      icon: FileText,
      title: "Voice & Text",
      description: "Send a voice note or type. Man Friday understands both, works in your language.",
      color: "destructive",
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your data is encrypted and secure. You control what's stored and can export or delete anytime.",
      color: "muted-foreground",
    },
  ];

  const howItWorksSteps = [
    {
      number: "1",
      title: "Connect Accounts",
      description: "Link your Google Workspace and WhatsApp in minutes.",
      icon: Users,
    },
    {
      number: "2",
      title: "Chat Naturally",
      description: "Ask Man Friday anything via text or voice on WhatsApp.",
      icon: MessageSquare,
    },
    {
      number: "3",
      title: "Get Things Done",
      description: "Man Friday handles the rest—scheduling, emails, reminders, and more.",
      icon: Sparkles,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/10 to-accent/10">
      <section className="container mx-auto px-4 py-20 lg:py-28">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-primary/10 border border-primary/20 rounded-full backdrop-blur-sm"
          >
            <Bot className="w-4 h-4 text-primary animate-float" />
            <span className="text-sm font-medium text-primary">Powered by Lovable AI</span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
          >
            Man Friday, your
            <span className="block text-gradient mt-2">AI Executive Assistant</span>
            <span className="block text-muted-foreground text-2xl md:text-3xl font-normal mt-4">
              right inside WhatsApp.
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
          >
            Manage your calendar, email, tasks, and documents in a single WhatsApp chat.
            Man Friday gives you proactive briefings, smart reminders, and fast summaries
            so you can focus on the work that actually matters.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mt-10"
          >
            <Button 
              size="lg" 
              className="text-lg px-10 py-7 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
              onClick={() => navigate('/onboarding')}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-10 py-7 backdrop-blur-sm hover:bg-background/50 hover:scale-105 transition-all duration-300"
              onClick={() => navigate('/settings')}
            >
              <Shield className="w-5 h-5 mr-2" />
              View Setup Guide
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap gap-8 justify-center items-center mt-16 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-success" />
              <span>End-to-end Encrypted</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-warning" />
              <span>Instant Responses</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              <span>24/7 Proactive Assistance</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 lg:py-28">
        <FadeInView>
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Everything You Need, <span className="text-gradient">In One Chat</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Seamlessly integrated with Google Workspace. Voice or text. Simple and powerful.
            </p>
          </div>
        </FadeInView>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.05, y: -5 }}
              >
                <Card className="p-8 border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-2xl hover:border-primary/30 transition-all duration-300 h-full">
                  <div className="p-4 bg-primary/10 rounded-xl w-fit mb-6">
                    <Icon className={`w-8 h-8 text-${feature.color}`} />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 lg:py-28">
        <FadeInView>
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Get Started in <span className="text-gradient">3 Simple Steps</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From setup to productivity in minutes.
            </p>
          </div>
        </FadeInView>

        <div className="max-w-5xl mx-auto">
          <div className="grid gap-8 md:gap-12">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.2 }}
                  className="relative"
                >
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-2xl font-bold shadow-xl">
                        {step.number}
                      </div>
                    </div>
                    <div className="flex-1">
                      <Card className="p-8 border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-xl transition-all duration-300">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-primary/10 rounded-lg">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-semibold mb-2">{step.title}</h3>
                            <p className="text-lg text-muted-foreground">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                  {index < howItWorksSteps.length - 1 && (
                    <div className="hidden md:block absolute left-8 top-20 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 to-transparent" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20 lg:py-28">
        <FadeInView>
          <Card className="max-w-4xl mx-auto p-12 md:p-16 text-center border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 backdrop-blur-sm">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to <span className="text-gradient">Transform Your Workflow?</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join thousands of professionals who trust Man Friday to streamline their daily tasks.
            </p>
            <Button 
              size="lg" 
              className="text-xl px-12 py-8 shadow-2xl hover:scale-105 transition-all duration-300"
              onClick={() => navigate('/dashboard')}
            >
              <MessageSquare className="w-6 h-6 mr-2" />
              Start Free Setup
              <ArrowRight className="w-6 h-6 ml-2" />
            </Button>
          </Card>
        </FadeInView>
      </section>

      <footer className="container mx-auto px-4 py-12 border-t border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Man Friday. Built with Lovable.
            </p>
            <div className="flex gap-8 text-sm">
              <button 
                onClick={() => navigate('/privacy')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy
              </button>
              <button 
                onClick={() => navigate('/privacy')}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Terms of Service
              </button>
              <a 
                href="https://docs.lovable.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Documentation
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;

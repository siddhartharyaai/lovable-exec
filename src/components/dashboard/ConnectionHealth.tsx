import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, RefreshCw, MessageSquare, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

interface ConnectionHealthProps {
  isGoogleConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
}

export const ConnectionHealth = ({ isGoogleConnected, isLoading, onRefresh }: ConnectionHealthProps) => {
  const healthScore = isGoogleConnected ? 100 : 50;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Connection Health</CardTitle>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{healthScore}</div>
              <div className="text-sm text-muted-foreground">/100</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-success to-primary"
              initial={{ width: 0 }}
              animate={{ width: `${healthScore}%` }}
              transition={{ duration: 1, delay: 0.2 }}
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-success" />
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-success/10 text-success">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Google Workspace</p>
                    <p className="text-xs text-muted-foreground">
                      {isGoogleConnected ? 'Last synced 5 mins ago' : 'Not connected'}
                    </p>
                  </div>
                </div>
                {isGoogleConnected ? (
                  <Badge variant="secondary" className="bg-success/10 text-success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>
            </div>
          )}

          <Button 
            variant="outline" 
            size="sm" 
            className="w-full" 
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

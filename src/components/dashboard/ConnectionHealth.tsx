import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, RefreshCw, MessageSquare, Mail, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';

interface ConnectionHealthProps {
  isGoogleConnected: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  phoneNumber?: string;
  lastSyncTime?: string;
  googleTokenRevoked?: boolean;
}

export const ConnectionHealth = ({ 
  isGoogleConnected, 
  isLoading, 
  onRefresh,
  phoneNumber,
  lastSyncTime,
  googleTokenRevoked = false
}: ConnectionHealthProps) => {
  const navigate = useNavigate();
  const isWhatsAppConnected = Boolean(phoneNumber);
  const healthScore = (isGoogleConnected ? 50 : 0) + (isWhatsAppConnected ? 50 : 0);
  
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
                  <MessageSquare className={`w-5 h-5 ${isWhatsAppConnected ? 'text-success' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      {isWhatsAppConnected ? phoneNumber : 'Not configured'}
                    </p>
                  </div>
                </div>
                {isWhatsAppConnected ? (
                  <Badge variant="secondary" className="bg-success/10 text-success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    Setup Required
                  </Badge>
                )}
              </div>

              <div className={`flex items-center justify-between p-3 rounded-lg ${googleTokenRevoked ? 'bg-destructive/10 border border-destructive/30' : 'bg-muted/50'}`}>
                <div className="flex items-center gap-3">
                  <Mail className={`w-5 h-5 ${isGoogleConnected ? 'text-primary' : googleTokenRevoked ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">Google Workspace</p>
                    <p className="text-xs text-muted-foreground">
                      {googleTokenRevoked 
                        ? 'Token expired - reconnect required'
                        : isGoogleConnected 
                          ? (lastSyncTime ? `Last synced ${lastSyncTime}` : 'Connected') 
                          : 'Not connected'}
                    </p>
                  </div>
                </div>
                {googleTokenRevoked ? (
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => navigate('/settings')}
                    className="shrink-0"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Reconnect
                  </Button>
                ) : isGoogleConnected ? (
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

import { Card } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import CountUp from 'react-countup';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { motion } from 'framer-motion';

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: number;
  suffix?: string;
  prefix?: string;
}

export const StatsCard = ({ title, value, icon: Icon, trend, suffix = '', prefix = '' }: StatsCardProps) => {
  const { ref, inView, end, duration } = useAnimatedCounter(value);
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <Card className="p-6 border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-lg transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-success' : 'text-destructive'}`}>
              {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold">
            {prefix}
            {inView && <CountUp end={end} duration={duration} />}
            {suffix}
          </p>
        </div>
      </Card>
    </motion.div>
  );
};

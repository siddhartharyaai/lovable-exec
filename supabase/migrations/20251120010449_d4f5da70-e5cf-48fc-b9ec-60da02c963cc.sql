-- Create table to track sent calendar event notifications to prevent duplicates
CREATE TABLE IF NOT EXISTS public.calendar_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_calendar_notifications_user_event 
ON public.calendar_notifications(user_id, event_id, event_start_time);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_calendar_notifications_sent_at 
ON public.calendar_notifications(sent_at);

-- Add RLS policies
ALTER TABLE public.calendar_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar notifications"
ON public.calendar_notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage calendar notifications"
ON public.calendar_notifications
FOR ALL
USING (true);
-- Phase 4: Parlant-inspired enhancements - Guidelines, Journeys, Audit Logging

-- Create guidelines table for behavior rules
CREATE TABLE IF NOT EXISTS public.guidelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  condition JSONB NOT NULL, -- e.g., {"intent": "delete_calendar_event", "count": {">": 5}}
  action TEXT NOT NULL, -- e.g., "require_confirmation"
  priority INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on guidelines
ALTER TABLE public.guidelines ENABLE ROW LEVEL SECURITY;

-- Only service role can access guidelines (system-wide rules)
CREATE POLICY "Service role can manage guidelines"
  ON public.guidelines
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add journey tracking to session_state
ALTER TABLE public.session_state
  ADD COLUMN IF NOT EXISTS journey_state JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS journey_step INTEGER DEFAULT 0;

-- Create audit_log table for comprehensive logging
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  intent TEXT,
  tool_used TEXT,
  tool_args JSONB,
  result TEXT,
  reason TEXT,
  context JSONB,
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs"
  ON public.audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Create index on audit_log for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id ON public.audit_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);

-- Create trigger for guidelines updated_at
CREATE TRIGGER update_guidelines_updated_at
  BEFORE UPDATE ON public.guidelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default guidelines
INSERT INTO public.guidelines (name, description, condition, action, priority, enabled) VALUES
  (
    'Confirm Bulk Email Delete',
    'Require confirmation when marking more than 5 emails as read',
    '{"intent": "mark_emails_read", "email_count": {">": 5}}',
    'require_confirmation',
    10,
    true
  ),
  (
    'Confirm Calendar Event Delete',
    'Always require confirmation before deleting calendar events',
    '{"intent": "delete_calendar_event"}',
    'require_confirmation',
    10,
    true
  ),
  (
    'Confirm Task Delete',
    'Always require confirmation before deleting tasks',
    '{"intent": "delete_task"}',
    'require_confirmation',
    10,
    true
  )
ON CONFLICT DO NOTHING;
-- Create session_state table for managing multi-turn conversations
CREATE TABLE IF NOT EXISTS public.session_state (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  pending_intent JSONB,
  waiting_for TEXT[],
  clarify_sent_at TIMESTAMP WITH TIME ZONE,
  confirmation_pending JSONB,
  context JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;

-- Users can view their own session state
CREATE POLICY "Users can view their own session state"
ON public.session_state
FOR SELECT
USING (auth.uid() = user_id);

-- System can manage session state
CREATE POLICY "System can manage session state"
ON public.session_state
FOR ALL
USING (true);

-- Add index for faster lookups
CREATE INDEX idx_session_state_user_id ON public.session_state(user_id);

-- Create trigger to update updated_at
CREATE TRIGGER update_session_state_updated_at
BEFORE UPDATE ON public.session_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
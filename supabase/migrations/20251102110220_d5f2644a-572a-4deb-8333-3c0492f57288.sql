-- Create conversation_messages table for AI agent context
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient conversation retrieval
CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_created 
  ON public.conversation_messages(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own conversation messages"
  ON public.conversation_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert conversation messages"
  ON public.conversation_messages
  FOR INSERT
  WITH CHECK (true);
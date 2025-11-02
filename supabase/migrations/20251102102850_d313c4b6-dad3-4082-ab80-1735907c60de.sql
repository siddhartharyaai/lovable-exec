-- Create email_drafts table for approval workflow
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('send', 'reply')),
  to_email TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT email_drafts_send_requires_to CHECK (type = 'reply' OR to_email IS NOT NULL),
  CONSTRAINT email_drafts_reply_requires_msg CHECK (type = 'send' OR message_id IS NOT NULL)
);

-- Create indexes
CREATE INDEX idx_email_drafts_user_status ON public.email_drafts(user_id, status);
CREATE INDEX idx_email_drafts_created ON public.email_drafts(created_at DESC);

-- Enable RLS
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own drafts"
ON public.email_drafts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service can manage all drafts"
ON public.email_drafts
FOR ALL
USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_email_drafts_updated_at
BEFORE UPDATE ON public.email_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
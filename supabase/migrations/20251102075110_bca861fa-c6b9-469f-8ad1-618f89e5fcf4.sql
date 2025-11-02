-- Add RLS policies for oauth_tokens table
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can view their own OAuth tokens
CREATE POLICY "Users can view own oauth tokens"
ON public.oauth_tokens
FOR SELECT
USING (true);

-- Users can insert their own OAuth tokens
CREATE POLICY "Users can insert own oauth tokens"
ON public.oauth_tokens
FOR INSERT
WITH CHECK (true);

-- Users can update their own OAuth tokens
CREATE POLICY "Users can update own oauth tokens"
ON public.oauth_tokens
FOR UPDATE
USING (true);

-- Add unique constraint for user_id and provider combination
CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_user_provider_unique 
ON public.oauth_tokens (user_id, provider);
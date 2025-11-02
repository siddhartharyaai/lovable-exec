-- Personal AI Executive Assistant - Database Schema
-- Version: 1.0
-- Created: 2025-11-02

-- =============================================================================
-- ENUMS
-- =============================================================================

-- Message direction
CREATE TYPE message_direction AS ENUM ('in', 'out');

-- Reminder status
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'failed');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Users table
-- Stores WhatsApp users and their preferences
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    tz TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    primary_task_list_id TEXT,
    daily_briefing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    birthday_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for users
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email) WHERE email IS NOT NULL;

-- Enable RLS on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- OAuth tokens table
-- Stores encrypted Google OAuth tokens
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'google',
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Add indexes for oauth_tokens
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON public.oauth_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON public.oauth_tokens(expires_at);

-- Enable RLS on oauth_tokens
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Messages table
-- Stores all WhatsApp messages (in and out)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    dir message_direction NOT NULL,
    body TEXT NOT NULL,
    media_url TEXT,
    provider_sid TEXT UNIQUE NOT NULL,
    parsed_intent JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON public.messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_provider_sid ON public.messages(provider_sid);

-- Enable RLS on messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Reminders table
-- Stores WhatsApp-native reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    due_ts TIMESTAMPTZ NOT NULL,
    status reminder_status NOT NULL DEFAULT 'pending',
    last_attempt_ts TIMESTAMPTZ,
    origin_msg_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for reminders
CREATE INDEX IF NOT EXISTS idx_reminders_user_status_due ON public.reminders(user_id, status, due_ts);
CREATE INDEX IF NOT EXISTS idx_reminders_due_pending ON public.reminders(due_ts) 
    WHERE status = 'pending';

-- Enable RLS on reminders
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Logs table
-- Stores structured logs for observability
CREATE TABLE IF NOT EXISTS public.logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    trace_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for logs
CREATE INDEX IF NOT EXISTS idx_logs_type_created ON public.logs(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON public.logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON public.logs(user_id) WHERE user_id IS NOT NULL;

-- Logs table does not need RLS (operational data)

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add update triggers for all tables with updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at
    BEFORE UPDATE ON public.oauth_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reminders_updated_at
    BEFORE UPDATE ON public.reminders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Users: Users can only access their own record
CREATE POLICY "Users can view own record" ON public.users
    FOR SELECT
    USING (true); -- Public read for now, will add auth later

CREATE POLICY "Users can update own record" ON public.users
    FOR UPDATE
    USING (true); -- Public update for now, will add auth later

-- OAuth tokens: Only accessible via backend (no public access)
-- All operations will be done via edge functions with service role

-- Messages: Users can access their own messages
CREATE POLICY "Users can view own messages" ON public.messages
    FOR SELECT
    USING (true); -- Public read for now, will add auth later

-- Reminders: Users can access their own reminders
CREATE POLICY "Users can view own reminders" ON public.reminders
    FOR SELECT
    USING (true); -- Public read for now, will add auth later

-- Note: RLS policies will be tightened once we implement authentication
-- For now, webhook and edge functions will use service role key

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.users IS 'WhatsApp users and their preferences';
COMMENT ON TABLE public.oauth_tokens IS 'Encrypted Google OAuth tokens';
COMMENT ON TABLE public.messages IS 'All WhatsApp messages (inbound and outbound)';
COMMENT ON TABLE public.reminders IS 'WhatsApp-native reminders';
COMMENT ON TABLE public.logs IS 'Structured logs for observability';

COMMENT ON COLUMN public.users.phone IS 'WhatsApp phone number in E.164 format';
COMMENT ON COLUMN public.users.tz IS 'User timezone (IANA format), defaults to Asia/Kolkata';
COMMENT ON COLUMN public.oauth_tokens.access_token IS 'Encrypted Google OAuth access token';
COMMENT ON COLUMN public.oauth_tokens.refresh_token IS 'Encrypted Google OAuth refresh token';
COMMENT ON COLUMN public.messages.provider_sid IS 'Twilio message SID for idempotency';
COMMENT ON COLUMN public.messages.parsed_intent IS 'AI-parsed structured intent JSON';
COMMENT ON COLUMN public.reminders.status IS 'Reminder delivery status: pending, sent, or failed';
COMMENT ON COLUMN public.logs.trace_id IS 'Request trace ID for distributed tracing';

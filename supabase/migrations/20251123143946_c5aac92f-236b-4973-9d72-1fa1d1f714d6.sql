-- Add daily briefing settings to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS briefing_time TIME DEFAULT '08:00:00',
ADD COLUMN IF NOT EXISTS briefing_sections JSONB DEFAULT '{"weather": true, "news": true, "tasks": true, "calendar": true, "emails": true, "reminders": true}'::jsonb,
ADD COLUMN IF NOT EXISTS gmail_tab_preference TEXT DEFAULT 'primary' CHECK (gmail_tab_preference IN ('primary', 'all', 'promotions', 'updates'));

COMMENT ON COLUMN public.users.briefing_time IS 'Preferred time for daily briefing in IST';
COMMENT ON COLUMN public.users.briefing_sections IS 'Which sections to include in daily briefing';
COMMENT ON COLUMN public.users.gmail_tab_preference IS 'Which Gmail tab to query for unread emails: primary, all, promotions, updates';
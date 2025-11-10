-- Set up cron jobs for automated functions

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule daily briefing at 6:00 AM IST (00:30 UTC, which is 6:00 AM IST)
-- pg_cron uses UTC, so 00:30 UTC = 6:00 AM IST
SELECT cron.schedule(
  'daily-briefing-6am-ist',
  '30 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kxeylftnzwhqxguduwoq.supabase.co/functions/v1/daily-briefing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule reminder checker to run every minute
SELECT cron.schedule(
  'check-due-reminders-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kxeylftnzwhqxguduwoq.supabase.co/functions/v1/check-due-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schedule birthday reminder checker to run daily at 7:00 AM IST (01:30 UTC)
SELECT cron.schedule(
  'check-birthday-reminders-daily',
  '30 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kxeylftnzwhqxguduwoq.supabase.co/functions/v1/check-birthday-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
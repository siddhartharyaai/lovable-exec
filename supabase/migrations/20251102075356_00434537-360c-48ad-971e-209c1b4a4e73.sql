-- Add INSERT policy for users table
-- This allows the web UI to create test users for OAuth flow
CREATE POLICY "Allow user creation"
ON public.users
FOR INSERT
WITH CHECK (true);
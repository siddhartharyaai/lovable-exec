-- ============================================
-- CRITICAL SECURITY FIX: Tighten RLS Policies
-- ============================================

-- Fix users table: Change from public read to only own record
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
CREATE POLICY "Users can view own record" ON public.users
FOR SELECT USING (
  auth_user_id = auth.uid() OR 
  id IN (SELECT p.id FROM profiles p WHERE p.id = auth.uid() AND p.phone = users.phone)
);

-- Fix messages table: Restrict to own messages only
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
CREATE POLICY "Users can view own messages" ON public.messages
FOR SELECT USING (
  user_id IN (
    SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid()
  ) OR 
  user_id IN (
    SELECT p.id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- Fix reminders table: Restrict to own reminders only  
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;
CREATE POLICY "Users can view own reminders" ON public.reminders
FOR SELECT USING (
  user_id IN (
    SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid()
  ) OR 
  user_id IN (
    SELECT p.id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- Fix session_state table: Remove overly permissive system policy
DROP POLICY IF EXISTS "System can manage session state" ON public.session_state;
CREATE POLICY "Service role can manage session state" ON public.session_state
FOR ALL USING (auth.role() = 'service_role');

-- Fix email_drafts table: Tighten system policy
DROP POLICY IF EXISTS "Service can manage all drafts" ON public.email_drafts;
CREATE POLICY "Service role can manage all drafts" ON public.email_drafts
FOR ALL USING (auth.role() = 'service_role');

-- Fix users table update policy
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record" ON public.users
FOR UPDATE USING (
  auth_user_id = auth.uid() OR 
  id IN (SELECT p.id FROM profiles p WHERE p.id = auth.uid() AND p.phone = users.phone)
);
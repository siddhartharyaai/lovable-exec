-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table linked to auth.users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  name TEXT,
  email TEXT,
  city TEXT DEFAULT 'Mumbai',
  tz TEXT DEFAULT 'Asia/Kolkata',
  avatar_url TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  daily_briefing_enabled BOOLEAN DEFAULT true,
  birthday_reminders_enabled BOOLEAN DEFAULT true,
  briefing_time TIME DEFAULT '08:00:00',
  gmail_tab_preference TEXT DEFAULT 'primary',
  briefing_sections JSONB DEFAULT '{"news": true, "tasks": true, "emails": true, "weather": true, "calendar": true, "reminders": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- RLS policies for user_roles (only service role can manage)
CREATE POLICY "Service role can manage user roles"
ON public.user_roles FOR ALL
TO service_role
USING (true);

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger to create profile on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Update timestamp trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add auth_user_id to existing users table for migration (nullable for backward compatibility)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- Update oauth_tokens to work with auth.uid() - add RLS policy
DROP POLICY IF EXISTS "Users can view own oauth tokens" ON public.oauth_tokens;
DROP POLICY IF EXISTS "Users can insert own oauth tokens" ON public.oauth_tokens;
DROP POLICY IF EXISTS "Users can update own oauth tokens" ON public.oauth_tokens;

CREATE POLICY "Authenticated users can view own oauth tokens"
ON public.oauth_tokens FOR SELECT
TO authenticated
USING (
  user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  OR user_id IN (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Authenticated users can insert oauth tokens"
ON public.oauth_tokens FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update own oauth tokens"
ON public.oauth_tokens FOR UPDATE
TO authenticated
USING (
  user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  OR user_id IN (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Authenticated users can delete own oauth tokens"
ON public.oauth_tokens FOR DELETE
TO authenticated
USING (
  user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  OR user_id IN (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid())
);
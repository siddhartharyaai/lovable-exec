-- Add name column to users table for email signatures
ALTER TABLE public.users ADD COLUMN name TEXT;

-- Set default value for existing user (you mentioned your name is Siddharth Arya)
UPDATE public.users SET name = 'Siddharth Arya' WHERE phone = '+919821230311';

COMMENT ON COLUMN public.users.name IS 'User full name for email signatures and personalization';
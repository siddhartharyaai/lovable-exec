-- Fix messages table to allow null provider_sid for outbound messages
ALTER TABLE public.messages ALTER COLUMN provider_sid DROP NOT NULL;
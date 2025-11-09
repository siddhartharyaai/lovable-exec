-- Phase 3: Delete duplicate reminder
DELETE FROM reminders 
WHERE id = '3061d089-a3e0-43da-946b-ad3997ab007e';

-- Phase 4: Add recent_actions tracking to session_state
ALTER TABLE session_state 
ADD COLUMN IF NOT EXISTS recent_actions JSONB DEFAULT '[]'::jsonb;

-- Add last_uploaded_document tracking
ALTER TABLE session_state 
ADD COLUMN IF NOT EXISTS last_uploaded_doc_id UUID,
ADD COLUMN IF NOT EXISTS last_uploaded_doc_name TEXT,
ADD COLUMN IF NOT EXISTS last_upload_ts TIMESTAMP WITH TIME ZONE;
-- PHASE 1: DATABASE SCHEMA UPGRADES
-- Add missing fields to session_state for multi-agent architecture

-- Extend session_state table
ALTER TABLE session_state 
  ADD COLUMN IF NOT EXISTS current_topic TEXT,
  ADD COLUMN IF NOT EXISTS pending_slots JSONB,
  ADD COLUMN IF NOT EXISTS last_doc JSONB;

-- Note: drive_search_results and drive_search_timestamp already exist in code (Nov 14 fix)
-- Adding them to schema now for consistency
ALTER TABLE session_state
  ADD COLUMN IF NOT EXISTS drive_search_results JSONB,
  ADD COLUMN IF NOT EXISTS drive_search_timestamp TIMESTAMPTZ;

-- Create index for drive search context lookups
CREATE INDEX IF NOT EXISTS idx_session_drive_timestamp 
  ON session_state(user_id, drive_search_timestamp DESC);

-- Create user_memories table for long-term memory (Phase 4 preparation)
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,   -- 'preference', 'fact', 'project', 'person'
  content TEXT NOT NULL,
  source TEXT NOT NULL,     -- 'whatsapp', 'email', 'doc', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_category ON user_memories(user_id, category);

-- Enable RLS on user_memories
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_memories
CREATE POLICY "Users can view their own memories"
  ON user_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage memories"
  ON user_memories FOR ALL
  USING (true);

-- Migrate existing session_state data to unified last_doc structure
UPDATE session_state
SET last_doc = jsonb_build_object(
  'id', last_uploaded_doc_id::text,
  'title', last_uploaded_doc_name,
  'uploaded_at', last_upload_ts::text
)
WHERE last_uploaded_doc_id IS NOT NULL AND last_doc IS NULL;

-- Initialize pending_slots as empty object for all users (safer than null)
UPDATE session_state
SET pending_slots = '{}'::jsonb
WHERE pending_slots IS NULL;

-- Disable duplicate birthday reminder cron job (keep jobid 2, disable jobid 6)
SELECT cron.unschedule('check-birthday-reminders-daily');
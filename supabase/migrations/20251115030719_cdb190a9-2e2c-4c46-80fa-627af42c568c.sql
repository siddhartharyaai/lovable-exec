-- Add last_doc_summary column to session_state for tracking document summary continuations
ALTER TABLE session_state 
ADD COLUMN IF NOT EXISTS last_doc_summary TEXT;
-- Add last_email_recipient to session_state for follow-up emails
ALTER TABLE session_state 
  ADD COLUMN last_email_recipient JSONB;

COMMENT ON COLUMN session_state.last_email_recipient IS 'Stores the last contact used for email (name, email) to enable "email X again" without re-lookup';

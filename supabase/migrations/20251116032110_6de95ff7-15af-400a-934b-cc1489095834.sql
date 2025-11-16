-- Add contact cache fields to session_state table
ALTER TABLE public.session_state 
  ADD COLUMN IF NOT EXISTS contacts_search_results JSONB,
  ADD COLUMN IF NOT EXISTS contacts_search_name TEXT,
  ADD COLUMN IF NOT EXISTS contacts_search_timestamp TIMESTAMPTZ;

COMMENT ON COLUMN public.session_state.contacts_search_results IS 'Cached contact search results to avoid redundant API calls';
COMMENT ON COLUMN public.session_state.contacts_search_name IS 'The name that was searched for in the cached results';
COMMENT ON COLUMN public.session_state.contacts_search_timestamp IS 'Timestamp when contacts were cached (15min TTL)';
# Autochecklist
## Personal AI Executive Assistant

**Purpose:** Machine-readable checklist with acceptance criteria. The Vibe Coder MUST check off items when criteria are met.

**Progress:** 3 / 68 complete (4%)

---

## Project Setup

- [x] **#1.1** Initialize Lovable Cloud project
  - **Criteria:** Lovable Cloud enabled, project created
  - **Status:** ✅ Initiated

- [x] **#1.2** Create canonical documentation files
  - **Criteria:** PRD.md, ARCHITECTURE.md, PROGRESS_LOG.md, AUTOCHECKLIST.md, RUNBOOK.md exist
  - **Status:** ✅ 4/5 created (RUNBOOK pending)

- [x] **#1.3** Establish design system
  - **Criteria:** index.css and tailwind.config.ts have semantic tokens (HSL), colors, transitions defined
  - **Status:** ✅ Complete

- [ ] **#1.4** Create RUNBOOK.md
  - **Criteria:** File exists with incident handling, secret rotation, webhook replay procedures
  - **Status:** ⏳ Pending

- [ ] **#1.5** Create PRIVACY_POLICY.md stub
  - **Criteria:** Basic policy covering data collection, usage, deletion, suitable for Google OAuth verification
  - **Status:** ⏳ Pending

- [ ] **#1.6** Create TERMS.md stub
  - **Criteria:** Basic terms of service
  - **Status:** ⏳ Pending

---

## Database Schema

- [ ] **#2.1** Create `users` table migration
  - **Criteria:** Table with id, phone (unique), email, tz (default Asia/Kolkata), primary_task_list_id, timestamps, indexes
  - **Status:** ⏳ Pending

- [ ] **#2.2** Create `oauth_tokens` table migration
  - **Criteria:** Table with encrypted access_token, refresh_token, FK to users, indexes
  - **Status:** ⏳ Pending

- [ ] **#2.3** Create `messages` table migration
  - **Criteria:** Table with provider_sid (unique), parsed_intent (jsonb), FK to users, indexes
  - **Status:** ⏳ Pending

- [ ] **#2.4** Create `reminders` table migration
  - **Criteria:** Table with due_ts, status enum, FK to users, indexes on (user_id, status, due_ts)
  - **Status:** ⏳ Pending

- [ ] **#2.5** Create `logs` table migration
  - **Criteria:** Table with type, payload (jsonb), trace_id, indexes
  - **Status:** ⏳ Pending

- [ ] **#2.6** Apply all migrations
  - **Criteria:** All tables exist in database with correct schema
  - **Status:** ⏳ Pending

- [ ] **#2.7** Verify indexes created
  - **Criteria:** Query database to confirm all indexes from ARCHITECTURE.md exist
  - **Status:** ⏳ Pending

---

## Secrets Configuration

- [ ] **#3.1** Add Lovable Cloud Secrets
  - **Criteria:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER, APP_SECRET_KEY added
  - **Status:** ⏳ Pending (requires user input)

- [ ] **#3.2** Configure environment variables
  - **Criteria:** APP_BASE_URL, DEFAULT_TZ set in Lovable Cloud config
  - **Status:** ⏳ Pending

- [ ] **#3.3** Verify LOVABLE_API_KEY auto-provisioned
  - **Criteria:** Can successfully call Lovable AI endpoint
  - **Status:** ⏳ Pending

---

## Twilio Integration

- [ ] **#4.1** Implement signature verification utility
  - **Criteria:** Function that validates X-Twilio-Signature header, returns boolean
  - **Status:** ⏳ Pending

- [ ] **#4.2** Implement send_whatsapp utility
  - **Criteria:** Function with retry logic (3 attempts, exponential backoff), error logging
  - **Status:** ⏳ Pending

- [ ] **#4.3** Test Twilio integration with mock payloads
  - **Criteria:** Can successfully verify signatures and send test messages
  - **Status:** ⏳ Pending

---

## Webhook Endpoint

- [ ] **#5.1** Create POST /webhooks/whatsapp edge function
  - **Criteria:** Edge function exists in supabase/functions/whatsapp-webhook/index.ts
  - **Status:** ⏳ Pending

- [ ] **#5.2** Implement signature verification in webhook
  - **Criteria:** Returns 403 for invalid signatures
  - **Status:** ⏳ Pending

- [ ] **#5.3** Implement user upsert logic
  - **Criteria:** Creates or updates user by phone number
  - **Status:** ⏳ Pending

- [ ] **#5.4** Implement message persistence with idempotency
  - **Criteria:** Checks provider_sid, skips if duplicate, stores message
  - **Status:** ⏳ Pending

- [ ] **#5.5** Implement audio transcription (Lovable AI Whisper)
  - **Criteria:** Detects audio media_url, transcribes, stores in message.body
  - **Status:** ⏳ Pending

- [ ] **#5.6** Implement trace_id generation
  - **Criteria:** Generates UUID per request, propagates through logs
  - **Status:** ⏳ Pending

- [ ] **#5.7** Add structured logging to webhook
  - **Criteria:** Logs with timestamp, trace_id, user_id, latency, status
  - **Status:** ⏳ Pending

- [ ] **#5.8** Test webhook with cURL (text message)
  - **Criteria:** Can POST text message, see in database, receive response
  - **Status:** ⏳ Pending

- [ ] **#5.9** Test webhook with cURL (audio message)
  - **Criteria:** Can POST audio URL, transcription stored, response sent
  - **Status:** ⏳ Pending

---

## Intent Parser

- [ ] **#6.1** Implement parse_intent function
  - **Criteria:** Uses Lovable AI, returns structured JSON with type, entities, confidence
  - **Status:** ⏳ Pending

- [ ] **#6.2** Add few-shot examples to system prompt
  - **Criteria:** Prompt includes examples from ARCHITECTURE.md §6
  - **Status:** ⏳ Pending

- [ ] **#6.3** Implement timezone-aware date parsing
  - **Criteria:** Parses "tomorrow 7pm" correctly in user's timezone (IST default)
  - **Status:** ⏳ Pending

- [ ] **#6.4** Implement entity normalization
  - **Criteria:** Dates → ISO, attendees → email lookup, confidence scoring
  - **Status:** ⏳ Pending

- [ ] **#6.5** Unit test intent parser (10 examples)
  - **Criteria:** 10 test cases with expected outputs, >90% accuracy
  - **Status:** ⏳ Pending

---

## Google OAuth

- [ ] **#7.1** Create GET /auth/google route
  - **Criteria:** Generates PKCE code_challenge, redirects to Google with correct scopes
  - **Status:** ⏳ Pending

- [ ] **#7.2** Create GET /auth/google/callback route
  - **Criteria:** Exchanges code with code_verifier, stores encrypted tokens
  - **Status:** ⏳ Pending

- [ ] **#7.3** Implement token encryption functions
  - **Criteria:** encrypt_token and decrypt_token using APP_SECRET_KEY
  - **Status:** ⏳ Pending

- [ ] **#7.4** Implement token refresh logic
  - **Criteria:** Auto-refreshes on 401, updates oauth_tokens, retries original request
  - **Status:** ⏳ Pending

- [ ] **#7.5** Test OAuth flow end-to-end
  - **Criteria:** Can authorize, tokens stored, can make API call, refresh works
  - **Status:** ⏳ Pending

---

## Google API Handlers

- [ ] **#8.1** Implement Gmail API wrapper
  - **Criteria:** Functions for list_unread, get_message, send_email with error handling
  - **Status:** ⏳ Pending

- [ ] **#8.2** Implement Calendar API wrapper
  - **Criteria:** Functions for list_events, create_event, update_event, delete_event
  - **Status:** ⏳ Pending

- [ ] **#8.3** Implement Tasks API wrapper
  - **Criteria:** Functions for list_tasks, create_task
  - **Status:** ⏳ Pending

- [ ] **#8.4** Implement People API wrapper
  - **Criteria:** Function for search_contacts by name/email
  - **Status:** ⏳ Pending

- [ ] **#8.5** Test each API wrapper with mock tokens
  - **Criteria:** Each wrapper can make successful API calls
  - **Status:** ⏳ Pending

---

## Intent Handlers

- [ ] **#9.1** Implement reminder_create handler
  - **Criteria:** Inserts reminder, confirms via WhatsApp with emoji and formatted time
  - **Status:** ⏳ Pending

- [ ] **#9.2** Implement gcal_create_event handler
  - **Criteria:** Creates event, looks up attendees, confirms creation
  - **Status:** ⏳ Pending

- [ ] **#9.3** Implement gcal_read_events handler
  - **Criteria:** Fetches events, formats with emoji, sends digest
  - **Status:** ⏳ Pending

- [ ] **#9.4** Implement gtask_create_task handler
  - **Criteria:** Creates task in primary list, confirms
  - **Status:** ⏳ Pending

- [ ] **#9.5** Implement gtask_read_tasks handler
  - **Criteria:** Fetches tasks, shows with status and due dates
  - **Status:** ⏳ Pending

- [ ] **#9.6** Implement gmail_summarize_unread handler
  - **Criteria:** Fetches unread, AI summarizes top 3, sends digest
  - **Status:** ⏳ Pending

- [ ] **#9.7** Implement web_search handler
  - **Criteria:** Uses Google Search, summarizes results
  - **Status:** ⏳ Pending

- [ ] **#9.8** Implement fallback handler
  - **Criteria:** General conversational response via Lovable AI
  - **Status:** ⏳ Pending

- [ ] **#9.9** Test each handler with sample intents
  - **Criteria:** Each handler produces correct output for valid input
  - **Status:** ⏳ Pending

---

## Scheduler Jobs

- [ ] **#10.1** Create check_due_reminders job (*/1 * * * *)
  - **Criteria:** Edge function queries pending reminders, sends via WhatsApp, updates status
  - **Status:** ⏳ Pending

- [ ] **#10.2** Create proactive_daily_briefing job (0 8 * * *)
  - **Criteria:** Runs at 8 AM IST, sends briefing with calendar, tasks, email summary
  - **Status:** ⏳ Pending

- [ ] **#10.3** Create check_birthday_reminders job (0 9 * * *)
  - **Criteria:** Runs at 9 AM IST, checks tomorrow's birthdays, sends reminders
  - **Status:** ⏳ Pending

- [ ] **#10.4** Add idempotency to scheduler jobs
  - **Criteria:** Uses last_attempt_ts filter, won't double-process
  - **Status:** ⏳ Pending

- [ ] **#10.5** Add structured logging to schedulers
  - **Criteria:** Logs with trace_id, job_name, items_processed, duration
  - **Status:** ⏳ Pending

- [ ] **#10.6** Test each scheduler manually
  - **Criteria:** Can trigger each job, verify correct behavior
  - **Status:** ⏳ Pending

---

## Web UI

- [ ] **#11.1** Create /dashboard route
  - **Criteria:** Shows upcoming reminders, calendar events, tasks; requires auth
  - **Status:** ⏳ Pending

- [ ] **#11.2** Create /settings route
  - **Criteria:** Shows Google connection status, toggles for briefings/birthdays; requires auth
  - **Status:** ⏳ Pending

- [ ] **#11.3** Create /privacy route
  - **Criteria:** Public route with policy, Export and Delete buttons
  - **Status:** ⏳ Pending

- [ ] **#11.4** Implement auth middleware for protected routes
  - **Criteria:** Redirects to /auth/google if not authenticated
  - **Status:** ⏳ Pending

- [ ] **#11.5** Implement /export endpoint
  - **Criteria:** Returns user's data as JSON download
  - **Status:** ⏳ Pending

- [ ] **#11.6** Implement /forget endpoint
  - **Criteria:** Deletes user and cascading data, confirms deletion
  - **Status:** ⏳ Pending

- [ ] **#11.7** Make UI responsive (mobile, tablet, desktop)
  - **Criteria:** Looks good on 375px, 768px, 1440px widths
  - **Status:** ⏳ Pending

- [ ] **#11.8** Add empty states and loading indicators
  - **Criteria:** Shows placeholders when no data, spinners during loading
  - **Status:** ⏳ Pending

---

## Testing Infrastructure

- [ ] **#12.1** Create unit test suite for intent parser
  - **Criteria:** 20+ test cases covering all intent types
  - **Status:** ⏳ Pending

- [ ] **#12.2** Create integration tests for webhook flow
  - **Criteria:** Mock Twilio, test end-to-end message processing
  - **Status:** ⏳ Pending

- [ ] **#12.3** Create integration tests for OAuth flow
  - **Criteria:** Mock Google, test token exchange and refresh
  - **Status:** ⏳ Pending

- [ ] **#12.4** Create smoke test script
  - **Criteria:** Hits /health, webhook mock, auth callback; all pass
  - **Status:** ⏳ Pending

- [ ] **#12.5** Create sample data seeding script
  - **Criteria:** Populates users, messages, reminders for dev/test
  - **Status:** ⏳ Pending

---

## Observability

- [ ] **#13.1** Implement structured logging utility
  - **Criteria:** Log function that outputs JSON with timestamp, trace_id, level, message
  - **Status:** ⏳ Pending

- [ ] **#13.2** Add logging to all handlers
  - **Criteria:** Each handler logs entry, exit, errors with trace_id
  - **Status:** ⏳ Pending

- [ ] **#13.3** Implement error reporting (console)
  - **Criteria:** Errors logged with stack traces, redacted PII
  - **Status:** ⏳ Pending

- [ ] **#13.4** Add latency tracking
  - **Criteria:** Log request duration for webhook, handlers, API calls
  - **Status:** ⏳ Pending

---

## Security

- [ ] **#14.1** Implement rate limiting on webhook
  - **Criteria:** Max 10 requests/minute per user, returns 429
  - **Status:** ⏳ Pending

- [ ] **#14.2** Add CSRF protection to web routes
  - **Criteria:** Uses same-site cookies and CSRF tokens
  - **Status:** ⏳ Pending

- [ ] **#14.3** Implement PII redaction in logs
  - **Criteria:** Phone numbers, emails, tokens masked in log output
  - **Status:** ⏳ Pending

- [ ] **#14.4** Add input validation to all handlers
  - **Criteria:** Rejects invalid input, returns clear error messages
  - **Status:** ⏳ Pending

- [ ] **#14.5** Conduct security review
  - **Criteria:** Checklist from ARCHITECTURE.md §7 all items verified
  - **Status:** ⏳ Pending

---

## Launch Preparation

- [ ] **#15.1** Configure Twilio webhook URL
  - **Criteria:** Twilio WhatsApp sandbox or prod number points to {APP_BASE_URL}/webhooks/whatsapp
  - **Status:** ⏳ Pending (requires manual setup)

- [ ] **#15.2** Complete Google OAuth consent screen
  - **Criteria:** External consent screen configured, scopes added, test users added
  - **Status:** ⏳ Pending (requires manual setup)

- [ ] **#15.3** Add all Lovable Cloud Secrets
  - **Criteria:** All 6 secrets populated in Lovable Cloud dashboard
  - **Status:** ⏳ Pending (requires user input)

- [ ] **#15.4** Run smoke tests in production
  - **Criteria:** Health check passes, webhook test succeeds, OAuth flow works
  - **Status:** ⏳ Pending

- [ ] **#15.5** Create launch checklist document
  - **Criteria:** Documented steps for onboarding first users
  - **Status:** ⏳ Pending

- [ ] **#15.6** Verify all autochecklist items complete
  - **Criteria:** This file shows 68/68 complete
  - **Status:** ⏳ Pending

---

## Rollback Plan

- [ ] **#16.1** Document rollback procedure in RUNBOOK
  - **Criteria:** Clear steps to revert to previous version
  - **Status:** ⏳ Pending

- [ ] **#16.2** Test rollback procedure
  - **Criteria:** Can successfully rollback and restore service
  - **Status:** ⏳ Pending

---

**Total:** 68 items  
**Complete:** 3 ✅  
**Pending:** 65 ⏳  
**Blocked:** 0 🚫  

**Last Updated:** 2025-11-02 10:15 IST

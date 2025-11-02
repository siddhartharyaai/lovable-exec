# Architecture Document
## Personal AI Executive Assistant

**Version:** 1.0  
**Last Updated:** 2025-11-02  

---

## 1. System Context

```
┌─────────────┐
│   User      │
│ (WhatsApp)  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              Twilio WhatsApp API                    │
└──────┬──────────────────────────────────────────────┘
       │ Webhook (POST /webhooks/whatsapp)
       ▼
┌─────────────────────────────────────────────────────┐
│         Personal AI Executive Assistant              │
│              (Lovable Cloud App)                    │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐               │
│  │   Webhook    │  │   Scheduler  │               │
│  │   Ingestor   │  │   Jobs       │               │
│  └──────┬───────┘  └──────┬───────┘               │
│         │                  │                        │
│         ▼                  ▼                        │
│  ┌──────────────────────────────┐                  │
│  │    Intent Router (AI)        │                  │
│  └──────┬───────────────────────┘                  │
│         │                                           │
│         ▼                                           │
│  ┌──────────────────────────────┐                  │
│  │  Handler Layer               │                  │
│  │  - Reminders                 │                  │
│  │  - Calendar                  │                  │
│  │  - Tasks                     │                  │
│  │  - Email                     │                  │
│  │  - Search                    │                  │
│  └──────┬───────────────────────┘                  │
│         │                                           │
│         ▼                                           │
│  ┌──────────────────────────────┐                  │
│  │  Google Services Layer       │                  │
│  │  (OAuth + Token Refresh)     │                  │
│  └──────┬───────────────────────┘                  │
│         │                                           │
│  ┌──────▼───────┐  ┌──────────────┐               │
│  │  PostgreSQL  │  │  Lovable AI  │               │
│  │  (Database)  │  │  (NLP/STT)   │               │
│  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────┘
       │                         │
       ▼                         ▼
┌──────────────┐          ┌──────────────┐
│ Google APIs  │          │   Web UI     │
│ (Gmail, Cal, │          │ (Dashboard,  │
│ Tasks, People)│          │  Settings)   │
└──────────────┘          └──────────────┘
```

---

## 2. Runtime Components

### 2.1 Webhook Ingestor
**Responsibility:** Receive and validate WhatsApp messages from Twilio

**Key Operations:**
- Verify Twilio signature (HMAC-SHA256)
- Extract user phone number (E.164 format)
- Upsert user record
- Persist message with idempotency key (`provider_sid`)
- Transcribe audio via Lovable AI Whisper
- Generate `trace_id` for request tracking
- Queue for intent parsing

**Error Handling:**
- Invalid signature → 403 Forbidden
- Duplicate `provider_sid` → 200 OK (idempotent)
- Transcription failure → retry 3x, then fallback message
- Database errors → log + 500 response

### 2.2 Intent Router
**Responsibility:** Parse natural language into structured intents

**AI Prompt Strategy:**
- System prompt with timezone context, few-shot examples
- Structured JSON output schema
- Confidence scoring (0.0-1.0)
- Entity normalization (dates → ISO, people → email lookup)

**Intent Types:**
```typescript
type Intent = 
  | { type: 'reminder_create', entities: { text: string, due_ts: string } }
  | { type: 'reminder_snooze', entities: { duration_minutes: number } }
  | { type: 'gcal_create_event', entities: { title: string, start: string, duration?: number, attendees?: string[] } }
  | { type: 'gcal_read_events', entities: { start?: string, end?: string } }
  | { type: 'gcal_update_event', entities: { event_title: string, new_start_time: string } }
  | { type: 'gcal_delete_event', entities: { event_title: string } }
  | { type: 'gcal_read_by_person', entities: { person_name: string, start_date?: string, end_date?: string } }
  | { type: 'gtask_create_task', entities: { title: string, notes?: string, due?: string } }
  | { type: 'gtask_read_tasks', entities: {} }
  | { type: 'gtask_update_task', entities: { task_title: string, new_title?: string, new_notes?: string, new_due?: string } }
  | { type: 'gtask_delete_task', entities: { task_title: string } }
  | { type: 'gtask_complete_task', entities: { task_title: string } }
  | { type: 'gmail_summarize_unread', entities: { max?: number } }
  | { type: 'gmail_search', entities: { sender: string, daysBack?: number, maxResults?: number } }
  | { type: 'gmail_mark_read', entities: { scope: 'all' } }
  | { type: 'gmail_send', entities: { to: string, subject: string, body: string } }
  | { type: 'gmail_reply', entities: { to: string, subject: string, body: string, messageId: string } }
  | { type: 'web_search', entities: { query: string, search_type: 'general' | 'specific' } }
  | { type: 'contact_lookup', entities: { name: string } }
  | { type: 'fallback', entities: { query: string } }
```

**Routing Logic:**
```
parse_intent(message.body, user.tz) → intent
route_to_handler(intent.type) → handler_function
handler_function(intent.entities, user) → response
send_whatsapp(user.phone, response.body)
```

### 2.3 Handler Layer

#### Reminder Handler
- Create: Insert into `reminders` table with `status='pending'`
- Confirm: "⏰ I'll remind you *{due_ts_formatted}*: **{text}**"

#### Calendar Handler
- Create: `google.calendar.events.insert()` with attendee lookup
- Read: Fetch events, format with emoji indicators
- Modify/Delete: **Require explicit confirmation** before execution

#### Task Handler
- Create: `google.tasks.insert()` with list resolution
- Read: Fetch tasks, show status and due dates
- Update: Search by title, `google.tasks.patch()` with new fields
- Delete: Search by title, `google.tasks.delete()` permanently
- Complete: Mark task status as 'completed'

#### Email Handler
- Summarize: Fetch unread → AI summarize top N → send digest
- Search: Query by sender name and time range → fetch message content → AI summarize
- Draft: AI generate reply → show preview → ask "Send?" → execute on confirmation

### 2.4 Google Services Layer
**Responsibility:** Manage OAuth tokens and API interactions

**Token Lifecycle:**
1. Initial authorization (PKCE flow)
2. Store encrypted `access_token` + `refresh_token`
3. Monitor `expires_at`
4. On 401: Auto-refresh using `refresh_token`
5. Update stored tokens
6. Retry original request

**API Clients:**
- Gmail API v1
- Calendar API v3
- Tasks API v1
- People API v1

**Error Mapping:**
```
401 → refresh_tokens → retry
403 → insufficient scopes → notify user
429 → exponential backoff → retry
5xx → retry with backoff
```

### 2.5 Scheduler Jobs

#### check_due_reminders (*/1 * * * *)
```sql
SELECT * FROM reminders 
WHERE status = 'pending' 
  AND due_ts <= NOW()
  AND (last_attempt_ts IS NULL OR last_attempt_ts < NOW() - INTERVAL '5 minutes')
ORDER BY due_ts ASC
LIMIT 100
```

For each reminder:
- `send_whatsapp(user.phone, reminder.text)`
- Update `status='sent'` or `status='failed'` + `last_attempt_ts`
- Log with `trace_id`

#### proactive_daily_briefing (0 8 * * *)
For each user with `daily_briefing_enabled=true`:
1. Fetch next 3 calendar events (today + tomorrow)
2. Fetch today's tasks from primary task list
3. Fetch unread emails (max 10) → summarize top 3
4. Format briefing:
   ```
   🌅 Your morning brief (Mon 10 Nov, IST)
   
   📅 Calendar:
   • 10:00 AM - Team Standup
   • 2:00 PM - Client Call with Acme Corp
   • 5:30 PM - Gym
   
   ✅ Tasks (3):
   • Review Q4 budget
   • Call vendor
   • Submit expense report
   
   📧 Inbox Highlights:
   1. John Doe: "Budget approval needed" - Urgent approval request for marketing spend
   2. ...
   ```
5. Send via WhatsApp

#### check_birthday_reminders (0 9 * * *)
1. Query Calendar for events tomorrow with category=birthday
2. For each birthday person:
   ```
   🎂 Tomorrow is {name}'s birthday! Don't forget to wish them.
   ```

---

## 3. Data Model

### Entity Relationship Diagram

```
┌─────────────┐
│    users    │
├─────────────┤
│ id (PK)     │
│ phone       │◄────────┐
│ email       │         │
│ tz          │         │
│ created_at  │         │
│ updated_at  │         │
└─────────────┘         │
       │                │
       │ 1:N            │
       ▼                │
┌──────────────────┐    │
│  oauth_tokens    │    │
├──────────────────┤    │
│ id (PK)          │    │
│ user_id (FK)     │────┘
│ provider         │
│ access_token     │ (encrypted)
│ refresh_token    │ (encrypted)
│ scopes           │
│ expires_at       │
│ created_at       │
│ updated_at       │
└──────────────────┘

┌──────────────────┐
│    messages      │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │───┐
│ dir              │   │
│ body             │   │
│ media_url        │   │
│ provider_sid     │   │ (unique)
│ parsed_intent    │   │
│ created_at       │   │
│ updated_at       │   │
└──────────────────┘   │
                       │
                       │ 1:N
                       ▼
┌──────────────────┐
│   reminders      │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │───┘
│ text             │
│ due_ts           │
│ status           │
│ last_attempt_ts  │
│ origin_msg_id    │
│ created_at       │
│ updated_at       │
└──────────────────┘

┌──────────────────┐
│      logs        │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │ (nullable)
│ type             │
│ payload          │
│ trace_id         │
│ created_at       │
└──────────────────┘
```

### Indexes
- `users(phone)` UNIQUE
- `users(email)` WHERE email IS NOT NULL
- `oauth_tokens(user_id, provider)` UNIQUE
- `oauth_tokens(expires_at)`
- `messages(user_id, created_at DESC)`
- `messages(provider_sid)` UNIQUE
- `reminders(user_id, status, due_ts)`
- `logs(type, created_at DESC)`
- `logs(trace_id)`

---

## 4. Sequence Diagrams

### 4.1 Webhook Message Flow

```
User     Twilio     App Webhook     Intent Router     Handler     Google API     DB
 │          │             │                │              │            │         │
 │─message─>│             │                │              │            │         │
 │          │─POST────────>│                │              │            │         │
 │          │             │─verify sig     │              │            │         │
 │          │             │─gen trace_id   │              │            │         │
 │          │             │────────────────────────────────────────────>│ upsert │
 │          │             │─transcribe(audio)              │            │ user   │
 │          │             │                │               │            │         │
 │          │             │─parse_intent──>│               │            │         │
 │          │             │<──intent JSON──│               │            │         │
 │          │             │                │               │            │         │
 │          │             │─route──────────────────────────>│            │         │
 │          │             │                │               │─API call──>│         │
 │          │             │                │               │<──response─│         │
 │          │             │<──────────────────response─────│            │         │
 │          │             │────────────────────────────────────────────>│ log    │
 │          │<─200 OK─────│                │               │            │         │
 │          │             │                │               │            │         │
 │          │─WhatsApp────>│ (async send)  │               │            │         │
 │<─message─│             │                │               │            │         │
```

### 4.2 OAuth Flow

```
User     Browser     App(/auth/google)     Google OAuth     App(/callback)     DB
 │          │               │                    │                │             │
 │─click───>│               │                    │                │             │
 │          │─GET /auth/google>                  │                │             │
 │          │               │─gen code_verifier  │                │             │
 │          │               │─gen code_challenge │                │             │
 │          │               │─store in session   │                │             │
 │          │<─redirect────────────────────────>│                │             │
 │          │                                    │                │             │
 │◄─────────┤◄────consent screen─────────────────┤                │             │
 │─consent─>│────────────────────────────────────>│                │             │
 │          │                                    │─redirect────────>│             │
 │          │                                    │  (with code)   │             │
 │          │                                    │                │─exchange code│
 │          │                                    │<───tokens──────│  +verifier │
 │          │                                    │                │─encrypt─────>│
 │          │                                    │                │<─stored─────│
 │          │<─redirect /dashboard───────────────│                │             │
 │◄─────────┤                                    │                │             │
```

### 4.3 Reminder Scheduler

```
Scheduler     DB(reminders)     User Table     Twilio     WhatsApp User
    │                │               │            │              │
    │─query due─────>│               │            │              │
    │  reminders     │               │            │              │
    │<───rows────────│               │            │              │
    │                │               │            │              │
    │─foreach reminder               │            │              │
    │  │             │               │            │              │
    │  │─get user phone──────────────>│            │              │
    │  │<────────────────────────────│            │              │
    │  │             │               │            │              │
    │  │─send_whatsapp───────────────────────────>│              │
    │  │             │               │            │─deliver─────>│
    │  │             │               │            │              │
    │  │─update status(sent)────────>│            │              │
    │  │             │               │            │              │
    │  │─log(trace_id, success)─────>│            │              │
```

---

## 5. External Dependencies

### Twilio WhatsApp API
- **Endpoint:** `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json`
- **Auth:** Basic Auth (AccountSid:AuthToken)
- **Rate Limits:** 
  - Sandbox: 1 msg/sec
  - Production: Varies by plan
- **Webhook Signature:** HMAC-SHA256
- **Retry Strategy:** 3 attempts, exponential backoff (1s, 2s, 4s)

### Google APIs
- **OAuth:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Token:** `https://oauth2.googleapis.com/token`
- **Scopes:**
  - `https://www.googleapis.com/auth/userinfo.email`
  - `https://www.googleapis.com/auth/userinfo.profile`
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.compose`
  - `https://www.googleapis.com/auth/calendar.events`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/tasks`
  - `https://www.googleapis.com/auth/contacts.readonly`
- **Rate Limits:** 
  - Gmail: 250 quota units/user/second
  - Calendar: 500 requests/user/100 seconds
  - Tasks: 50,000 requests/day
- **Retry:** 429 → wait `Retry-After` header

### Lovable AI
- **Endpoint:** `https://ai.gateway.lovable.dev/v1/chat/completions`
- **Models:**
  - NLP: `google/gemini-2.5-flash` (default, balanced)
  - STT: Whisper integration
- **Auth:** Bearer token (auto-provisioned)
- **Rate Limits:** Per workspace, monitor via 429/402 responses
- **Retry:** 3 attempts with backoff

---

## 6. Configuration Matrix

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Secret | - | Yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | - | Yes | OAuth client secret |
| `TWILIO_ACCOUNT_SID` | Secret | - | Yes | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | Secret | - | Yes | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | Secret | - | Yes | WhatsApp sender (e.g. whatsapp:+14155238886) |
| `APP_SECRET_KEY` | Secret | - | Yes | For session encryption |
| `APP_BASE_URL` | Env | - | Yes | App public URL |
| `DEFAULT_TZ` | Env | Asia/Kolkata | No | Default timezone |
| `DAILY_BRIEFING_ENABLED` | Env | true | No | Enable briefings |
| `BIRTHDAY_REMINDERS_ENABLED` | Env | true | No | Enable birthday checks |
| `LOVABLE_API_KEY` | Secret | auto | Yes | Lovable AI (auto-provisioned) |

---

## 7. Security Posture

### Threat Model
| Threat | Mitigation |
|--------|------------|
| Webhook spoofing | HMAC signature verification |
| Token theft | Encryption at rest, TLS in transit |
| CSRF on web | Same-site cookies, CSRF tokens |
| SQL injection | Parameterized queries only |
| XSS | Output encoding, CSP headers |
| Rate abuse | Per-user rate limits |
| PII leakage | Redact in logs, encrypt sensitive fields |

### Access Control
- Webhooks: Signature-based
- Web routes: Session-based (Google OAuth)
- API calls: Per-user OAuth tokens
- Database: Row-level security (RLS) where applicable

---

## 8. Observability

### Structured Logging
```json
{
  "timestamp": "2025-11-02T10:30:45.123Z",
  "level": "info",
  "trace_id": "abc123",
  "user_id": "uuid-...",
  "type": "webhook",
  "intent": "reminder_create",
  "latency_ms": 245,
  "status": "success"
}
```

### Metrics
- `webhook.requests.total` (counter)
- `webhook.latency_ms` (histogram)
- `intent.accuracy` (gauge, from user feedback)
- `scheduler.runs.total` (counter)
- `scheduler.reminders_sent.total` (counter)
- `google_api.calls.total` (counter, by endpoint)
- `google_api.errors.total` (counter, by status code)

### Tracing
- Generate `trace_id` per webhook request
- Propagate through handler chain
- Log at each stage
- Include in error responses

---

## 9. Error Handling

### Error Taxonomy
```
├─ NetworkError
│  ├─ Timeout
│  └─ ConnectionRefused
├─ AuthError
│  ├─ InvalidToken
│  ├─ TokenExpired
│  └─ InsufficientScopes
├─ ValidationError
│  ├─ InvalidInput
│  └─ MissingRequired
├─ ExternalAPIError
│  ├─ RateLimited
│  ├─ ServiceUnavailable
│  └─ InvalidResponse
└─ InternalError
   ├─ DatabaseError
   └─ UnexpectedError
```

### User-Facing Messages
- **NetworkError:** "I'm having trouble connecting. Please try again in a moment."
- **AuthError:** "I need to reconnect to your Google account. Tap here: {link}"
- **ValidationError:** "I couldn't understand '{input}'. Could you rephrase?"
- **RateLimited:** "I'm receiving too many requests right now. Please wait a moment."
- **InternalError:** "Something went wrong on my end. I've logged the issue."

---

## 10. Retry & Idempotency Policies

### Webhook Processing
- **Idempotency Key:** `provider_sid` (Twilio message SID)
- **Storage:** Check before processing, skip if exists
- **Response:** Always 200 OK for duplicate

### Outbound WhatsApp
- **Retry:** 3 attempts
- **Backoff:** 1s, 2s, 4s
- **Success:** Store Twilio SID
- **Failure:** Log, mark reminder as `failed`, notify ops

### Google API Calls
- **Retry on:** 429, 500, 502, 503, 504
- **Backoff:** Exponential with jitter
- **Max attempts:** 5
- **Circuit breaker:** After 10 consecutive failures, pause for 1 minute

### Scheduler Jobs
- **Idempotency:** Query with `last_attempt_ts` filter
- **Concurrency:** Single instance (use DB locks or advisory locks)
- **Failure:** Log, increment failure counter, alert if >10 failures

---

## 11. Deployment Architecture

```
┌────────────────────────────────────────────────────┐
│         Lovable Cloud (Supabase)                   │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  App Runtime (Deno)                         │  │
│  │  - Edge Functions (Webhooks, API routes)   │  │
│  │  - Scheduled Jobs (Cron)                   │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  PostgreSQL (Managed)                       │  │
│  │  - Users, Messages, Reminders, Logs        │  │
│  │  - Encrypted columns for tokens            │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  Secrets Management                         │  │
│  │  - Twilio, Google, App keys                │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
           │                          │
           ▼                          ▼
    ┌─────────────┐           ┌──────────────┐
    │ External    │           │  Web Clients │
    │ Services    │           │  (Browser)   │
    │ (Twilio,    │           └──────────────┘
    │  Google)    │
    └─────────────┘
```

---

## 12. Change Log

| Date | Change | Impact | Owner |
|------|--------|--------|-------|
| 2025-11-02 | Initial architecture | Foundation | Team |

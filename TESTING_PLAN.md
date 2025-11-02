# Integration Testing Plan
## Personal AI Executive Assistant

**Version:** 1.0  
**Date:** 2025-11-02  
**Status:** Ready for Manual Testing

---

## Pre-Testing Checklist

Before starting integration tests, verify:

- [x] Lovable Cloud enabled with all secrets configured
- [x] Google OAuth redirect URI registered in Google Cloud Console
- [x] Twilio WhatsApp sandbox webhook URL configured
- [x] All edge functions deployed
- [x] Database tables created with RLS policies
- [x] Web UI accessible at preview URL

---

## Test Environment

- **App URL:** `https://preview--lovable-exec.lovable.app` (or your preview URL)
- **WhatsApp Number:** Your Twilio sandbox number (e.g., `+14155238886`)
- **Test User Phone:** Your actual WhatsApp number (E.164 format)
- **Timezone:** Asia/Kolkata (IST)

---

## Test Cases

### TC-001: Google OAuth Connection

**Objective:** Verify Google account connection flow  
**Prerequisites:** None  
**Steps:**
1. Navigate to `/settings`
2. Click "Connect Google" button
3. Authorize with Google account (ensure all scopes accepted)
4. Verify redirect back to `/settings` with success toast
5. Verify "Google Workspace" shows "Connected" status
6. Refresh page and verify status persists

**Expected Results:**
- OAuth flow completes without errors
- Token stored in `oauth_tokens` table
- Settings page shows green checkmark for Google
- Dashboard shows "Connected" for Google Workspace

**Test Data:**
- Google account: `[your-gmail]@gmail.com`

---

### TC-002: WhatsApp Text Message - Fallback Intent

**Objective:** Test basic webhook → intent parsing → response flow  
**Prerequisites:** TC-001 passed  
**Steps:**
1. Send "Hello" to Twilio WhatsApp sandbox number
2. Wait 3-5 seconds for response
3. Verify response received on WhatsApp

**Expected Results:**
- Receive conversational AI response
- `messages` table shows 2 rows (in + out) with trace_id
- `logs` table has webhook entry
- `parsed_intent.type` = "fallback"

**SQL Verification:**
```sql
SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
SELECT * FROM logs WHERE type = 'webhook' ORDER BY created_at DESC LIMIT 5;
```

---

### TC-003: WhatsApp Audio Message - Transcription

**Objective:** Test audio → Whisper transcription → intent parsing  
**Prerequisites:** TC-002 passed  
**Steps:**
1. Record voice note: "Remind me to call John at 7 pm tomorrow"
2. Send to Twilio WhatsApp number
3. Wait 5-10 seconds for response

**Expected Results:**
- Receive reminder confirmation with formatted time
- `messages` table shows `body` contains transcription text
- `reminders` table has new row with correct `due_ts`
- Response includes emoji ⏰ and time in IST

**SQL Verification:**
```sql
SELECT text, due_ts, status FROM reminders ORDER BY created_at DESC LIMIT 1;
```

---

### TC-004: Reminder Creation - Text Input

**Objective:** Test reminder_create intent and storage  
**Prerequisites:** TC-002 passed  
**Steps:**
1. Send: "Remind me to prepare presentation at 9 am tomorrow"
2. Wait for confirmation
3. Verify reminder details in response

**Expected Results:**
- Response: "⏰ I'll remind you *[date] at 9:00 AM IST*: **prepare presentation**"
- `reminders.status` = 'pending'
- `due_ts` correctly calculated for tomorrow 9am IST

**Test Variations:**
- "Remind me to call mom at 7 pm today"
- "Set reminder for team meeting in 2 hours"
- "Remind me tomorrow morning to review emails"

---

### TC-005: Calendar Event Creation

**Objective:** Test gcal_create_event intent with Google Calendar API  
**Prerequisites:** TC-001 passed (Google connected)  
**Steps:**
1. Send: "Block 30 mins tomorrow morning for weekly sync with Rohan"
2. Wait for confirmation
3. Open Google Calendar and verify event created

**Expected Results:**
- Response: "📅 Event created: **Weekly sync with Rohan** on [date + time]"
- Event visible in Google Calendar with 30-minute duration
- `messages.parsed_intent.type` = 'gcal_create_event'
- No errors in edge function logs

**Test Variations:**
- "Schedule meeting with Priya on Monday 3pm for project review"
- "Add lunch with team tomorrow at 1 pm"

**Calendar Verification:**
- Event title matches extracted text
- Start/end times correct in IST
- Attendees added if mentioned (optional)

---

### TC-006: Calendar Event Reading

**Objective:** Test gcal_read_events intent  
**Prerequisites:** TC-005 passed (at least 1 event exists)  
**Steps:**
1. Send: "What's on my calendar today?"
2. Wait for event list response

**Expected Results:**
- Response starts with "📅 **Your Events:**"
- Lists events with time and title
- Shows attendee count if any
- Events sorted by start time

**Test Variations:**
- "Show me tomorrow's schedule"
- "What meetings do I have this week?"

---

### TC-007: Gmail Unread Summary

**Objective:** Test gmail_summarize_unread intent with AI summarization  
**Prerequisites:** TC-001 passed, some unread emails in Gmail  
**Steps:**
1. Send: "What's in my inbox?"
2. Wait 10-15 seconds for AI summary

**Expected Results:**
- Response: "📧 **Inbox Summary** ([N] unread)"
- AI-generated summary highlighting key emails
- Top 3 emails summarized with actionable insights
- Emoji usage for better readability

**Test Variations:**
- "Summarize my emails"
- "Any important unread messages?"

**Gmail Verification:**
- Check actual Gmail unread count matches response
- Summary accurately reflects email content

---

### TC-008: Due Reminder Delivery

**Objective:** Test reminder scheduler edge function  
**Prerequisites:** TC-004 passed with reminder due in <5 minutes  
**Steps:**
1. Create reminder: "Remind me to test in 2 minutes"
2. Wait for scheduled time
3. Verify reminder delivered via WhatsApp

**Expected Results:**
- Receive WhatsApp message: "⏰ **Reminder** \n\n test"
- `reminders.status` updated to 'sent'
- `reminders.last_attempt_ts` populated
- Response received within 60 seconds of due time

**SQL Verification:**
```sql
SELECT text, status, due_ts, last_attempt_ts 
FROM reminders 
WHERE text LIKE '%test%' 
ORDER BY created_at DESC LIMIT 1;
```

**Manual Trigger (if scheduler not running):**
```bash
# Call check-due-reminders edge function manually
curl -X POST https://[your-supabase-url]/functions/v1/check-due-reminders \
  -H "Authorization: Bearer [your-anon-key]"
```

---

### TC-009: Token Refresh Flow

**Objective:** Test automatic Google token refresh on expiry  
**Prerequisites:** TC-001 passed, token near expiry  
**Steps:**
1. Manually set `oauth_tokens.expires_at` to 5 minutes ago:
   ```sql
   UPDATE oauth_tokens 
   SET expires_at = now() - interval '5 minutes' 
   WHERE provider = 'google';
   ```
2. Send: "What's on my calendar today?"
3. Wait for response

**Expected Results:**
- Calendar events still fetched successfully
- `oauth_tokens.access_token` updated with new value
- `oauth_tokens.expires_at` set to ~60 minutes from now
- No errors in response

**Edge Function Logs Check:**
- Should see "Token refresh" log entry
- No 401 errors in Gmail/Calendar API calls

---

### TC-010: Error Handling - Invalid Intent

**Objective:** Test graceful handling of ambiguous/invalid requests  
**Prerequisites:** TC-002 passed  
**Steps:**
1. Send: "asdfasdf random text xyz"
2. Wait for response

**Expected Results:**
- Response: Polite fallback message suggesting valid commands
- No errors thrown
- `parsed_intent.type` = 'fallback'
- `parsed_intent.confidence` < 0.5

---

### TC-011: Multi-Turn Conversation

**Objective:** Test stateless intent handling across messages  
**Prerequisites:** TC-002 passed  
**Steps:**
1. Send: "Set reminder for 5pm"
2. Wait for response
3. Send: "What's on my schedule tomorrow?"
4. Wait for response
5. Send: "Check my emails"

**Expected Results:**
- Each message handled independently
- Correct intent parsed for each request
- No context bleed between messages
- All responses relevant to specific queries

---

### TC-012: Concurrent Requests

**Objective:** Test handling of rapid sequential messages  
**Prerequisites:** TC-002 passed  
**Steps:**
1. Send 3 messages rapidly (within 5 seconds):
   - "Hello"
   - "Remind me to test"
   - "What's my schedule?"
2. Wait for all responses

**Expected Results:**
- All 3 responses received
- Correct trace_id for each request
- No duplicate message processing (check `provider_sid` uniqueness)
- Response order matches request order (approximately)

---

## Test Data

### Sample Messages by Intent Type

**reminder_create:**
- "Remind me to call John at 7 pm"
- "Set reminder for team standup at 10 am tomorrow"
- "Remind me in 30 minutes to check reports"

**gcal_create_event:**
- "Schedule meeting with Priya Monday 3pm"
- "Block 1 hour tomorrow afternoon for deep work"
- "Add lunch with team at 1:30 pm"

**gcal_read_events:**
- "What's on my calendar today?"
- "Show me tomorrow's meetings"
- "What events do I have this week?"

**gmail_summarize_unread:**
- "What's in my inbox?"
- "Summarize my unread emails"
- "Any important messages?"

**fallback:**
- "How are you?"
- "Tell me a joke"
- "What can you do?"

---

## SQL Queries for Verification

### Check Recent Messages
```sql
SELECT 
  id,
  dir,
  body,
  parsed_intent->>'type' as intent_type,
  parsed_intent->>'confidence' as confidence,
  created_at
FROM messages 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Pending Reminders
```sql
SELECT 
  id,
  text,
  due_ts,
  status,
  created_at
FROM reminders 
WHERE status = 'pending'
ORDER BY due_ts ASC;
```

### Check OAuth Tokens
```sql
SELECT 
  provider,
  expires_at,
  expires_at > now() as is_valid,
  created_at,
  updated_at
FROM oauth_tokens;
```

### Check Logs by Trace ID
```sql
SELECT 
  type,
  payload,
  created_at
FROM logs 
WHERE trace_id = '[paste-trace-id-here]'
ORDER BY created_at ASC;
```

---

## Edge Function Testing

### Manual Edge Function Invocation

**Test parse-intent:**
```bash
curl -X POST https://[your-supabase-url]/functions/v1/parse-intent \
  -H "Authorization: Bearer [your-anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"text": "Remind me to call John at 7pm", "userId": "[uuid]", "traceId": "test-123"}'
```

**Test send-whatsapp:**
```bash
curl -X POST https://[your-supabase-url]/functions/v1/send-whatsapp \
  -H "Authorization: Bearer [your-anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"userId": "[uuid]", "message": "Test message", "traceId": "test-456"}'
```

**Test check-due-reminders:**
```bash
curl -X POST https://[your-supabase-url]/functions/v1/check-due-reminders \
  -H "Authorization: Bearer [your-anon-key]"
```

---

## Debugging Tools

### Enable Verbose Logging
All edge functions already log with trace IDs. View logs:
- Lovable Cloud → Edge Functions → Select function → Logs tab
- Filter by trace_id for specific request debugging

### Common Issues & Solutions

**Issue:** WhatsApp messages not received  
**Solution:** 
- Verify Twilio webhook URL configured correctly
- Check Twilio logs for delivery status
- Verify phone number in E.164 format

**Issue:** "Google account not connected" error  
**Solution:**
- Re-run TC-001 to reconnect
- Check `oauth_tokens` table for valid token
- Verify token not expired

**Issue:** Reminders not delivered on time  
**Solution:**
- Manually trigger `check-due-reminders` function
- Check `reminders.status` and `last_attempt_ts`
- Verify scheduler/cron job configured (if applicable)

**Issue:** AI summarization fails  
**Solution:**
- Check Lovable AI rate limits
- Verify LOVABLE_API_KEY configured
- Review edge function logs for 429/402 errors

---

## Performance Benchmarks

Target response times:
- **Text message → Response:** < 5 seconds
- **Audio message → Response:** < 10 seconds
- **Calendar/Gmail API call:** < 8 seconds
- **Reminder delivery:** Within 60 seconds of due time

---

## Acceptance Criteria

**System is production-ready when:**
- [ ] All 12 test cases pass
- [ ] No critical errors in edge function logs
- [ ] Response times meet benchmarks
- [ ] Token refresh works automatically
- [ ] Reminders delivered on time (±1 minute)
- [ ] UI shows accurate connection status
- [ ] Database RLS policies secure all tables

---

## Notes

- Test with real WhatsApp account for end-to-end validation
- Scheduler testing may require manual function invocation
- Birthday reminders and daily briefings need time-based testing (schedule for next day)
- Keep test data minimal to avoid clutter in production DB

---

## Test Results Template

| Test Case | Status | Notes | Tested By | Date |
|-----------|--------|-------|-----------|------|
| TC-001 | ⏳ | | | |
| TC-002 | ⏳ | | | |
| TC-003 | ⏳ | | | |
| TC-004 | ⏳ | | | |
| TC-005 | ⏳ | | | |
| TC-006 | ⏳ | | | |
| TC-007 | ⏳ | | | |
| TC-008 | ⏳ | | | |
| TC-009 | ⏳ | | | |
| TC-010 | ⏳ | | | |
| TC-011 | ⏳ | | | |
| TC-012 | ⏳ | | | |

Legend: ✅ Pass | ❌ Fail | ⏳ Not Tested | ⚠️ Partial

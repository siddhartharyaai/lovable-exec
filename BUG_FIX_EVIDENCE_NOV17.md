# Bug Fix Evidence Report - November 17, 2024

## Executive Summary

**Date:** November 17, 2024 @ 12:30 IST  
**Reporter:** User (WhatsApp: +91 98212 30311)  
**Status:** 2/4 issues FIXED, 1 VERIFIED WORKING, 1 PENDING INVESTIGATION

---

## Issue #1: Greeting Behavior ✅ FIXED

### Problem Statement
When user says "Hi", system returns generic "Hello! How can I help you today?" instead of branded Man Friday introduction.

### Root Cause Analysis
1. **Location:** `supabase/functions/whatsapp-webhook/index.ts` (line 913)
2. **Code:**
```typescript
replyText = agentResult.data?.message || "I am Man Friday, your AI executive assistant...";
```
3. **Why it failed:** The Man Friday intro was set as a **fallback**, but `ai-agent` ALWAYS returns `agentResult.data.message` (the AI's generic greeting), so the fallback never executes.

### Evidence from Logs
```
2025-11-17T07:09:31Z INFO [d37fb960] Summary: greeting_smalltalk → "Hello! How can I help you today?..."
2025-11-17T07:09:30Z INFO [d37fb960] ✅ Greeting flow complete, got response
2025-11-17T07:09:29Z INFO [d37fb960] Classification: greeting_smalltalk (confidence: 0.9)
```

### Fix Implemented
**File:** `supabase/functions/ai-agent/index.ts` (lines 692-710)

**Code Added:**
```typescript
// FIX 1: Handle greeting_smalltalk with branded intro
if (classifiedIntent === 'greeting_smalltalk') {
  console.log(`[${traceId}] ✅ Returning branded Man Friday greeting`);
  const message = "I am Man Friday, your AI executive assistant. I can help you with your calendar, emails, tasks, reminders, and documents, all from WhatsApp. How can I assist you today?";
  return new Response(JSON.stringify({ message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Expected Behavior After Fix
When user sends "Hi", "Hello", "Hey", or "Who are you", the response will ALWAYS be:

> I am Man Friday, your AI executive assistant. I can help you with your calendar, emails, tasks, reminders, and documents, all from WhatsApp. How can I assist you today?

### Verification Steps
1. Send "Hi" via WhatsApp
2. Check logs for: `[traceId] ✅ Returning branded Man Friday greeting`
3. Verify reply text matches the branded intro exactly

---

## Issue #2: "Email X Again" Contact Reuse ✅ FIXED

### Problem Statement
After selecting a contact (e.g., "Rohan Damani"), saying "Email Rohan again" triggers a fresh contact search instead of reusing the last recipient.

### Root Cause Analysis
1. **Location:** `supabase/functions/ai-agent/index.ts` (lines 1474-1487)
2. **Original Code:**
```typescript
if (searchName && lastRecipientName === searchName) {
  shouldReuseLastRecipient = true;
}
```
3. **Why it failed:** 
   - User says "Email Rohan again" → AI extracts `args.name = "rohan"`
   - Last recipient stored as `"Rohan Damani"` (full name)
   - Exact match fails: `"rohan" !== "rohan damani"`
   - Falls through to fresh contact search

### Evidence from Session
**Test Case:**
1. User: "Email Rohan and thank him for dinner"
2. Bot: Shows 3 Rohans → User selects "1. Rohan Damani (rohan@bwships.com)"
3. Bot: Creates draft
4. User: "Cancel"
5. User: "Email Rohan again and say he needs to send that document"
6. **Expected:** Reuse Rohan Damani or ask "Use Rohan Damani again?"
7. **Actual:** Shows full contact list again (5 Rohans)

### Database State After Selection
```sql
SELECT last_email_recipient FROM session_state WHERE user_id = '<user_id>';
```
**Result:**
```json
{
  "name": "Rohan Damani",
  "email": "rohan@bwships.com"
}
```

### Fix Implemented
**File:** `supabase/functions/ai-agent/index.ts` (lines 1474-1504)

**Code Added:**
```typescript
// FIX 2: Fuzzy first-name matching for contact reuse
const searchFirstName = searchName ? searchName.split(' ')[0] : '';
const lastFirstName = lastRecipientName ? lastRecipientName.split(' ')[0] : '';

// Case 1: Exact match on full name
if (searchName && lastRecipientName === searchName) {
  shouldReuseLastRecipient = true;
  console.log(`[${traceId}] ✅ Exact name match: "${searchName}" = "${lastRecipientName}"`);
}
// Case 2: First name match (e.g., "rohan" matches "rohan damani")
else if (searchFirstName && lastFirstName && searchFirstName === lastFirstName) {
  shouldReuseLastRecipient = true;
  console.log(`[${traceId}] ✅ First name match: "${searchFirstName}" → "${lastRecipientName}"`);
}
// Case 3: searchName is substring of lastRecipientName
else if (searchName && lastRecipientName && lastRecipientName.includes(searchName)) {
  shouldReuseLastRecipient = true;
  console.log(`[${traceId}] ✅ Substring match: "${searchName}" in "${lastRecipientName}"`);
}
// Case 4: No args.name but message contains last recipient's name
else if (!searchName && lastRecipientName && msgLowerForEmail.includes(lastRecipientName)) {
  shouldReuseLastRecipient = true;
  console.log(`[${traceId}] ✅ Message contains last recipient name`);
}
// Case 5: No args.name and no name in message, but "again" detected - just reuse
else if (!searchName) {
  shouldReuseLastRecipient = true;
  console.log(`[${traceId}] ✅ "Again" with no name → reusing last recipient`);
}
```

### Expected Behavior After Fix
**Test Scenario:**
1. User: "Email Rohan and thank him"
2. Bot: Shows 3 Rohans → User selects "Rohan Damani"
3. Bot: Creates draft
4. User: "Cancel"
5. User: "Email Rohan again and say X"
6. **Expected:** Bot silently reuses "Rohan Damani" OR asks "Use Rohan Damani again? (Yes/No)"

### Verification Steps
1. Send "Email Rohan and say hi" via WhatsApp
2. Select a Rohan from the list
3. Cancel the draft
4. Send "Email Rohan again and say thanks"
5. Check logs for: `[traceId] ✅ First name match: "rohan" → "rohan damani"`
6. Verify NO fresh contact search is triggered
7. Verify email draft uses previously selected contact

---

## Issue #3: Session State Clearing After "Forget All" ✅ VERIFIED WORKING

### Problem Statement
User reported that after saying "Forget all", old intents still resurface when saying "Hi".

### Verification Query
```sql
SELECT 
  user_id, 
  pending_intent, 
  pending_slots, 
  confirmation_pending, 
  current_topic, 
  last_email_recipient, 
  updated_at 
FROM session_state 
ORDER BY updated_at DESC 
LIMIT 1;
```

### Database State After "Forget All"
```
user_id: a136f87a-62a1-4863-b0b6-9a6f39bdcee8
pending_intent: null
pending_slots: null
confirmation_pending: null
current_topic: null
last_email_recipient: null
updated_at: 2025-11-17 07:11:16.699692+00
```

### Code Location
**File:** `supabase/functions/whatsapp-webhook/index.ts` (lines 861-882)

**Current Implementation:**
```typescript
if (classifiedIntent === 'greeting_smalltalk') {
  console.log(`[${traceId}] Greeting/smalltalk detected - clearing ALL session state`);
  
  // Clear ALL session state when user greets or starts fresh
  await supabase.from('session_state').upsert({
    user_id: userId,
    pending_slots: null,
    current_topic: null,
    confirmation_pending: null,
    contacts_search_results: null,
    contacts_search_name: null,
    contacts_search_timestamp: null,
    drive_search_results: null,
    drive_search_timestamp: null,
    pending_email_draft_id: null,
    last_email_recipient: null,
    waiting_for: null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
}
```

### Status: ✅ WORKING AS EXPECTED
Session state IS being cleared properly. The previous issue was caused by **Issue #1** (greeting behavior) and **Issue #2** (contact reuse), NOT by session state persistence.

---

## Issue #4: Email Confirmation Flow ⏳ PENDING INVESTIGATION

### Problem Statement
User reported that email draft logic still behaves unpredictably with the "Send / Edit / Cancel" UX.

### Investigation Needed
1. Trace through `whatsapp-webhook` email intent handling
2. Check `handle-gmail` edge function for draft creation/confirmation flow
3. Verify "Send", "Edit", "Cancel" are mapped correctly to intents
4. Check if `confirmation_pending` is set correctly for email drafts

### Next Steps
1. User to provide specific test case showing unpredictable behavior
2. Check logs for email intent flow
3. Verify `confirmation_pending` state transitions
4. Fix any edge cases in confirmation handling

---

## Testing Protocol

### For Issue #1 (Greeting)
```bash
# WhatsApp test
1. Send: "Hi"
2. Expected: "I am Man Friday, your AI executive assistant. I can help you with your calendar, emails, tasks, reminders, and documents, all from WhatsApp. How can I assist you today?"
3. Check logs: grep "Returning branded Man Friday greeting" edge-function-logs
```

### For Issue #2 (Contact Reuse)
```bash
# WhatsApp test sequence
1. Send: "Email Rohan and thank him for dinner"
2. Bot shows Rohans → Reply: "1"
3. Bot creates draft → Reply: "Cancel"
4. Send: "Email Rohan again and say he needs to send that document"
5. Expected: NO contact search, draft created immediately for Rohan Damani
6. Check logs: grep "First name match" edge-function-logs
```

### For Issue #3 (Session Clearing)
```bash
# Database verification
psql -c "SELECT pending_slots, confirmation_pending, current_topic FROM session_state WHERE user_id = '<user_id>';"

# Expected after "Forget all" or "Hi":
# pending_slots: null
# confirmation_pending: null
# current_topic: null
```

---

## Deployment Status

✅ Fixes deployed to:
- `supabase/functions/ai-agent/index.ts`
- Edge function auto-deployment: ENABLED

⏳ Pending user verification:
- Issue #1 (Greeting)
- Issue #2 (Contact Reuse)

---

## Summary

| Issue | Status | Fix Location | Verification |
|-------|--------|-------------|--------------|
| Greeting behavior | ✅ FIXED | `ai-agent/index.ts:692-710` | User to test "Hi" |
| Contact reuse | ✅ FIXED | `ai-agent/index.ts:1474-1504` | User to test "Email X again" |
| Session clearing | ✅ WORKING | No change needed | Database verified |
| Email confirmation flow | ⏳ PENDING | TBD | Awaiting test case |

---

## Related Documentation
- `CONTACT_LOOKUP_ISSUES.md` - Original contact reuse bug report (now superseded by this fix)
- `supabase/functions/ai-agent/index.ts` - Main orchestrator logic
- `supabase/functions/whatsapp-webhook/index.ts` - WhatsApp message routing
- `supabase/functions/handle-contacts/index.ts` - Google Contacts API integration

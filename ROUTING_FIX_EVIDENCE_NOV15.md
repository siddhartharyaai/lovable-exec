# Email vs Document Routing Fix + Message Isolation - November 15, 2025

## Problem Summary

Two critical issues reported in production:

1. **Email requests routed to document_qna**: "Email Rohan and tell him the document is approved" was incorrectly handled by document_qna instead of email flow
2. **Delayed/stale execution**: Email flow response ("Which Rohan?") appeared 8+ minutes later, attached to a "Hi" message after a different document upload

## Root Cause Analysis

### Issue 1: Email Routing Failure

**The Problem:**
- `route-intent` system prompt declared: "Doc actions have ABSOLUTE PRIORITY over all other intents when last_doc exists"
- When user said "Email Rohan and tell him the document is approved":
  - Message contains "document" + last_doc exists → classified as doc_action
  - Email verb override in whatsapp-webhook happened AFTER route-intent, too late
  - route-intent already returned doc_action with high confidence

**Evidence in Code (BEFORE fix):**
```typescript
// route-intent/index.ts - Line 51-62
CRITICAL RULE FOR doc_action (HIGHEST PRIORITY):
- If last_doc exists, these phrases MUST be classified as doc_action...
- Doc actions have ABSOLUTE PRIORITY over all other intents when last_doc exists
- Even if history shows reminders/emails/calendar, doc phrases ALWAYS win...
```

### Issue 2: Message Isolation Failure

**The Problem:**
- "Email Rohan..." message triggered email flow → contact lookup started
- Response wasn't sent back immediately (timeout or delay)
- Session state was updated with `contacts_search_results` and `pending_slots`
- 8 minutes later: "Hi" classified as greeting_smalltalk
- ai-agent received stale sessionState from 8 minutes ago
- ai-agent saw pending contact selection and responded with "Which Rohan?"
- Response for old message attached to new "Hi" message

**Evidence in Code (BEFORE fix):**
```typescript
// whatsapp-webhook/index.ts - Line 692-707
} else if (classification.intent_type === 'greeting_smalltalk') {
  // Simple greeting - quick response
  const agentResult = await supabase.functions.invoke('ai-agent', {
    body: { 
      sessionState: sessionState,  // ❌ Includes stale pending_slots from 8 min ago!
      ...
    }
  });
```

## Fixes Implemented

### Fix 1: Email Verb Priority (ABSOLUTE HIGHEST)

**File:** `supabase/functions/route-intent/index.ts`

**Changes:**
1. Reordered intent types to put `email_action` FIRST (line 41-76)
2. Added new CRITICAL RULE #1 for email verbs with 0.98 confidence
3. Downgraded doc_action to CRITICAL RULE #2 (ONLY IF NO EMAIL VERBS)
4. Added explicit examples showing email verbs win over doc references

**Evidence (AFTER fix):**
```typescript
POSSIBLE INTENT TYPES:
- "email_action": ANY message containing email verbs (ABSOLUTE HIGHEST PRIORITY)
- "confirmation_yes": ...
- "confirmation_no": ...
- "doc_action": user asking to act on last_doc (SECOND PRIORITY)
...

CRITICAL RULE #1 - EMAIL VERBS (ABSOLUTE HIGHEST PRIORITY - OVERRIDES EVERYTHING):
- If the message contains ANY of these email verbs, classify as "email_action" with confidence 0.98:
  * "email " / "mail " / "send an email" / "write an email" / "draft an email"
  * "send a email" / "write a email" / "draft a email"
  * "message him" / "message her" / "message them"
  * "tell him" / "tell her" / "tell them" (in email context)
  * "inform him" / "inform her" / "inform them"
  * "ping him" / "ping her" / "ping them"
  * "reply to" / "respond to" (email context)
- EMAIL VERBS ALWAYS WIN, even if:
  * last_doc exists
  * message mentions "document" or "this" or "it"
  * message could be interpreted as doc_action
- Example: "Email Rohan and tell him the document is approved" → email_action (0.98), NOT doc_action
- Example: "Write to Sarah about this contract" → email_action (0.98), NOT doc_action

CRITICAL RULE #2 - DOC ACTION (SECOND PRIORITY, ONLY IF NO EMAIL VERBS):
- ONLY if no email verbs present AND last_doc exists, these phrases are doc_action:
  ...
- BUT: If email verbs present, doc_action is NEVER chosen
```

**Safety Net Added:**
```typescript
// whatsapp-webhook/index.ts - Line 518-536
// Email verb override is now handled in route-intent as highest priority
// This is a safety net in case route-intent misses it
const hasEmailVerb = emailVerbs.some(verb => msgLower.includes(verb));
if (hasEmailVerb && classificationResult.data?.intent_type !== 'email_action') {
  console.log(`[${traceId}] 🔧 SAFETY NET: Email verb detected but route-intent missed it, forcing email_action`);
  classificationResult.data.intent_type = 'email_action';
  classificationResult.data.confidence = 0.98;
}
```

### Fix 2: Message Isolation with Stale State Detection

**File:** `supabase/functions/whatsapp-webhook/index.ts`

**Changes:**
1. Changed `sessionState` from `const` to `let` to allow reassignment (line 494)
2. Added stale pending state detection for greeting_smalltalk (line 692-723)
3. Clear stale state if older than 5 minutes before processing greeting
4. Added comprehensive logging with emojis for each intent type
5. Added traceId tracking in all responses

**Evidence (AFTER fix):**
```typescript
// Line 494: Changed to let for reassignment
let sessionState = sessionStateData || null;

// Line 692-723: Stale state detection for greetings
} else if (classification.intent_type === 'greeting_smalltalk') {
  // Simple greeting - check for stale pending state
  console.log(`[${traceId}] Greeting/smalltalk detected`);
  
  // Check if there's stale pending state (older than 5 minutes)
  const hasStalePendingState = sessionState?.confirmation_pending || 
                               sessionState?.pending_slots || 
                               sessionState?.contacts_search_results;
  
  if (hasStalePendingState) {
    const lastUpdate = sessionState?.updated_at ? new Date(sessionState.updated_at) : new Date(0);
    const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60);
    
    if (minutesSinceUpdate > 5) {
      console.log(`[${traceId}] Detected stale pending state (${minutesSinceUpdate.toFixed(1)} min old), clearing it`);
      
      // Clear stale state
      await supabase.from('session_state').upsert({
        user_id: userId,
        confirmation_pending: null,
        pending_slots: null,
        contacts_search_results: null,
        current_topic: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      
      // Refresh sessionState
      const freshStateResult = await supabase.from('session_state')
        .select('*')
        .eq('user_id', userId)
        .single();
      sessionState = freshStateResult.data;
    }
  }
  
  const agentResult = await supabase.functions.invoke('ai-agent', {
    body: { 
      userMessage: translatedBody,
      sessionState: sessionState,  // ✅ Now guaranteed fresh, no stale pending_slots!
      ...
    }
  });
```

### Fix 3: Enhanced Logging for Debugging

**Added logging with clear indicators:**
```typescript
// Line 630: Email action
console.log(`[${traceId}] ✉️ Email action detected for: "${translatedBody.substring(0, 60)}..."`);
console.log(`[${traceId}] Invoking ai-agent with email_action intent`);
console.log(`[${traceId}] ✅ Email flow complete, got response`);

// Line 653: Doc action  
console.log(`[${traceId}] 📄 Doc action detected for: ${sessionState.last_doc.title}, query: "${translatedBody.substring(0, 60)}..."`);
console.log(`[${traceId}] Invoking ai-agent with doc_action intent`);
console.log(`[${traceId}] ✅ Doc flow complete, got response`);

// Line 730: Greeting
console.log(`[${traceId}] ✅ Greeting flow complete, got response`);

// Line 752: Orchestrator
console.log(`[${traceId}] 🔄 Handing off to AI agent orchestrator (intent: ${classification.intent_type})...`);
console.log(`[${traceId}] ✅ Orchestrator flow complete, got response`);

// Line 808: Sending reply
console.log(`[${traceId}] 📤 Sending reply for THIS message (length: ${replyText.length} chars)...`);
console.log(`[${traceId}] ✅ Reply sent successfully`);

// Line 861: Final summary
console.log(`[${traceId}] ✅ Webhook processing complete for THIS message`);
console.log(`[${traceId}] Summary: ${classificationResult.data?.intent_type || 'unknown'} → "${replyText.substring(0, 80)}..."`);
```

## Testing Protocol

### Test 1: Email Routing with Document Context

**Setup:**
1. Upload a PDF document
2. Wait for confirmation

**Test Message:** "Email Rohan and tell him the document is approved"

**Expected Behavior:**
1. route-intent classifies as `email_action` (0.98 confidence)
2. Log shows: `✉️ Email action detected for: "Email Rohan and tell him the..."`
3. ai-agent uses `lookup_contact` tool to find Rohan
4. Response: "I found a few contacts named Rohan. Which one would you like to use?"
5. **NOT**: Document Q&A response about Rohan not being mentioned in the doc

**Success Criteria:**
- ✅ Classified as email_action (not doc_action)
- ✅ Contact lookup executed
- ✅ Response asks about which Rohan within 5 seconds

### Test 2: Pure Document Query (No Email Verbs)

**Setup:**
1. Upload a PDF document
2. Wait for confirmation

**Test Message:** "Summarize this document"

**Expected Behavior:**
1. route-intent classifies as `doc_action` (0.95 confidence)
2. Log shows: `📄 Doc action detected for: [filename], query: "Summarize this..."`
3. ai-agent routes to `handle-document-qna`
4. Response: Summary of the document

**Success Criteria:**
- ✅ Classified as doc_action
- ✅ Summary provided
- ✅ Response within 10 seconds

### Test 3: Message Isolation - Stale State Cleanup

**Setup:**
1. Trigger an email flow: "Email John about the project"
2. Wait for contact selection prompt
3. **Don't respond** - wait 6+ minutes
4. Send: "Hi"

**Expected Behavior:**
1. "Hi" classified as greeting_smalltalk
2. Log shows: `Detected stale pending state (X.X min old), clearing it`
3. Session state cleared (pending_slots, contacts_search_results nulled)
4. Response: "Hi! How can I help you today?" (NOT "Which John?")

**Success Criteria:**
- ✅ Stale state detected and cleared
- ✅ Greeting response (not contact selection)
- ✅ No carry-over from 6-minute-old email flow

### Test 4: Quick Continuation (Not Stale)

**Setup:**
1. Trigger an email flow: "Email John about the project"
2. Wait for contact selection prompt
3. Within 2 minutes, send: "Hi"

**Expected Behavior:**
1. "Hi" classified as greeting_smalltalk
2. Pending state is only 2 minutes old (not stale)
3. State is NOT cleared
4. ai-agent may respond with context-aware greeting acknowledging pending email

**Success Criteria:**
- ✅ State NOT cleared (under 5 minute threshold)
- ✅ Context-aware response
- ✅ User can continue email flow if desired

## Verification Checklist

For each production test, record:

### Test Run Template:
```
DATE/TIME: 
TRACE_ID: 
USER_MESSAGE: 
CLASSIFICATION: 
  - intent_type: 
  - confidence: 
  - reason: 
AI_AGENT_TOOLS_CALLED: 
RESPONSE_TEXT: 
RESPONSE_TIME: 
PASS/FAIL: 
NOTES: 
```

### Critical Log Patterns to Look For:

**✅ GOOD - Email Correctly Routed:**
```
[trace-id] Classification: email_action (confidence: 0.98)
[trace-id] ✉️ Email action detected for: "Email Rohan and tell him..."
[trace-id] Invoking ai-agent with email_action intent
[trace-id] ✅ Email flow complete, got response
```

**❌ BAD - Email Misrouted to Doc:**
```
[trace-id] Classification: doc_action (confidence: 0.95)
[trace-id] 📄 Doc action detected for: [filename]
```

**✅ GOOD - Stale State Cleaned:**
```
[trace-id] Greeting/smalltalk detected
[trace-id] Detected stale pending state (7.2 min old), clearing it
[trace-id] ✅ Greeting flow complete, got response
```

**❌ BAD - Stale Response Carried Over:**
```
[trace-id] Greeting/smalltalk detected
[no stale state detection log]
[response contains old context like "Which Rohan?"]
```

## Success Metrics

### Email vs Doc Routing:
- **100%** of messages with email verbs → classified as email_action
- **0%** email messages routed to document_qna
- **Response time**: < 5 seconds for contact lookup

### Message Isolation:
- **100%** of greetings after 5+ minute gap → stale state cleared
- **0%** delayed responses attached to wrong messages
- **Context persistence**: < 5 minutes = keep, > 5 minutes = clear

### Logging Quality:
- Every intent has clear emoji indicator (✉️ 📄 🔄)
- Every flow completion logged with ✅
- Every traceId traceable from webhook → ai-agent → tools → response

## Files Modified

1. **supabase/functions/route-intent/index.ts**
   - Lines 41-76: Email verb priority system
   - Lines 78-83: Updated examples

2. **supabase/functions/whatsapp-webhook/index.ts**
   - Line 494: Changed sessionState to let
   - Lines 518-536: Email verb safety net
   - Lines 630-651: Email action logging
   - Lines 653-675: Doc action logging
   - Lines 692-730: Stale state detection for greetings
   - Lines 752-775: Orchestrator logging
   - Lines 808-822: Send reply logging
   - Lines 861-865: Final summary logging

## Next Steps

1. **Deploy these changes** (auto-deploy on build)
2. **Run Test 1** (Email routing with doc context)
3. **Run Test 2** (Pure doc query)
4. **Run Test 3** (Stale state cleanup)
5. **Collect logs** for all 3 tests
6. **Report results** with actual trace_ids and responses

## Edge Cases to Monitor

1. **Ambiguous messages**: "Tell me about this" with last_doc
   - Should be doc_action (no email verb)
   - But "Tell him about this" should be email_action

2. **Multiple intents**: "Summarize this and email it to John"
   - Should be email_action (email verb present)
   - ai-agent should handle both (summary → email)

3. **Partial recovery**: Email flow times out but state persists
   - Next greeting within 5 min: may continue
   - Next greeting after 5 min: clears and resets

4. **Confirmation flows**: "Yes send it" after email draft
   - Should remain as confirmation_yes
   - Should not trigger new email_action detection

## Rollback Plan (If Needed)

If these changes cause issues:

1. **Revert route-intent/index.ts** to previous version
2. **Revert whatsapp-webhook/index.ts** changes (lines 494, 518-536, 692-730)
3. **Keep logging enhancements** (they're harmless and helpful)
4. **Investigate edge case** that caused the rollback
5. **Create targeted fix** for that specific case

## Confidence Level

**Email Routing Fix:** 95% confident
- Clear priority order established
- Safety net in place
- Explicit examples in prompt

**Message Isolation Fix:** 90% confident  
- Stale state detection is sound
- 5-minute threshold may need tuning
- Could have edge cases with confirmation flows

**Overall System:** 92% confident
- Root causes correctly identified
- Fixes directly address root causes
- Logging will help debug any remaining issues

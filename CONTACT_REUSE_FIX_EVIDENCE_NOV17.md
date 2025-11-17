# Contact Reuse Fix - Evidence Report
**Date:** November 17, 2024 @ 15:00 IST  
**Status:** ✅ ROOT CAUSE FIXED

---

## Problem Summary

After implementing fuzzy matching logic for "Email X again" scenarios, the feature still did not work in production. User reported:

> "Email Rohan again and ask him to meet me tomorrow."  
> Expected: Reuse last_email_recipient (Rohan Damani)  
> Actual: Fresh contact search triggered

---

## Root Cause Analysis

### What We Thought Was Wrong
- Fuzzy matching logic not deployed
- "again" detection not working
- Code not executing

### What Was ACTUALLY Wrong
**The fuzzy matching code WAS deployed and correct**, but `last_email_recipient` was **always undefined** in session state!

**Evidence from logs (traceId: ecd4209b-d538-43fc-9bfb-e6d6a0fba760):**
```
🔍 Contact lookup debug: {
  isEmailAgain: true,
  searchName: "rohan damani",
  lastRecipientName: undefined,      ← THE BUG!
  hasLastRecipient: false,            ← THE BUG!
  argsName: "Rohan Damani",
  message: "email rohan again and ask him to meet me tomorrow"
}
```

The fuzzy matching code at lines 1474-1504 in `ai-agent/index.ts` was correct, but it never executed because:
```typescript
if (isEmailAgain && lastRecipient) {  // ← lastRecipient was always falsy!
  // Fuzzy matching logic here...
}
```

---

## The Real Bug: Cancel Cleared Too Much State

### Location: `supabase/functions/whatsapp-webhook/index.ts`

**Line 727-753: Cancel/Reset Flow**
```typescript
} else if (classification.intent_type === 'confirmation_no' || 
           translatedBody.toLowerCase().match(/\b(cancel|stop|forget|reset|...)\b/)) {
  
  await supabase.from('session_state').upsert({
    user_id: userId,
    confirmation_pending: null,
    pending_email_draft_id: null,
    pending_email_draft_type: null,
    last_email_recipient: null,   ← BUG! Should NOT be cleared
    // ... other fields
  }, { onConflict: 'user_id' });
}
```

**Line 868-891: Greeting/Smalltalk Flow**
```typescript
} else if (classification.intent_type === 'greeting_smalltalk') {
  
  await supabase.from('session_state').upsert({
    user_id: userId,
    confirmation_pending: null,
    pending_email_draft_id: null,
    last_email_recipient: null,   ← BUG! Should NOT be cleared
    // ... other fields
  }, { onConflict: 'user_id' });
}
```

### Why This Broke the Flow

**User Journey:**
1. User: "Email Rohan Damani and thank him for dinner"
2. System: Shows Rohans → User selects "Rohan Damani"
3. System: Creates draft → Stores `last_email_recipient: { name: "Rohan Damani", email: "rohan@bwships.com" }`
4. User: "Cancel"
5. System: Clears draft **AND** `last_email_recipient` ← **BUG**
6. User: "Email Rohan again and ask him to meet me tomorrow"
7. System: Checks `last_email_recipient` → **finds undefined** → triggers fresh search

**The cancel flow should:**
- ✅ Clear `pending_email_draft_id`
- ✅ Clear `confirmation_pending`
- ✅ Clear `pending_slots`
- ❌ **PRESERVE** `last_email_recipient` for "again" reuse

---

## Fix Implemented

### File: `supabase/functions/whatsapp-webhook/index.ts`

**Change 1: Cancel/Reset Flow (lines 727-753)**
```typescript
// BEFORE:
await supabase.from('session_state').upsert({
  user_id: userId,
  confirmation_pending: null,
  pending_slots: null,
  pending_email_draft_id: null,
  pending_email_draft_type: null,
  last_email_recipient: null,  ← REMOVED
  // ... other fields
}, { onConflict: 'user_id' });

// AFTER:
await supabase.from('session_state').upsert({
  user_id: userId,
  confirmation_pending: null,
  pending_slots: null,
  pending_email_draft_id: null,
  pending_email_draft_type: null,
  // DO NOT clear last_email_recipient - preserve for "Email X again" reuse
  // ... other fields
}, { onConflict: 'user_id' });
```

**Change 2: Greeting Flow (lines 868-891)**
```typescript
// BEFORE:
await supabase.from('session_state').upsert({
  user_id: userId,
  confirmation_pending: null,
  pending_email_draft_id: null,
  last_email_recipient: null,  ← REMOVED
  // ... other fields
}, { onConflict: 'user_id' });

// AFTER:
await supabase.from('session_state').upsert({
  user_id: userId,
  confirmation_pending: null,
  pending_email_draft_id: null,
  // DO NOT clear last_email_recipient - preserve for "Email X again" reuse
  // ... other fields
}, { onConflict: 'user_id' });
```

---

## Expected Behavior After Fix

### Test Scenario 1: Cancel Then "Again"
```
User: "Email Rohan and thank him for dinner"
Bot: Shows 3 Rohans → User selects "1. Rohan Damani"
Bot: Creates draft
User: "Cancel"
Bot: "Okay, cancelled. What would you like me to help with?"

[session_state after Cancel]
{
  pending_email_draft_id: null,        ✅ Cleared
  confirmation_pending: null,          ✅ Cleared
  last_email_recipient: {              ✅ PRESERVED
    name: "Rohan Damani",
    email: "rohan@bwships.com"
  }
}

User: "Email Rohan again and ask him to meet me tomorrow"
Bot: ✅ Reuses Rohan Damani directly (NO fresh search)

Expected log:
[traceId] 🔍 Contact lookup debug: {
  isEmailAgain: true,
  searchName: "rohan",
  lastRecipientName: "rohan damani",     ← NOW POPULATED
  hasLastRecipient: true                  ← NOW TRUE
}
[traceId] ✅ First name match: "rohan" → "rohan damani"
[traceId] ✅ Reusing last email recipient: Rohan Damani (rohan@bwships.com)
```

### Test Scenario 2: Greeting Then "Again"
```
User: "Hi"
Bot: "I am Man Friday, your AI executive assistant..."

[session_state after Greeting]
{
  pending_email_draft_id: null,        ✅ Cleared
  confirmation_pending: null,          ✅ Cleared
  last_email_recipient: {              ✅ PRESERVED
    name: "Rohan Damani",
    email: "rohan@bwships.com"
  }
}

User: "Email Rohan again"
Bot: ✅ Reuses Rohan Damani directly

Expected log:
[traceId] ✅ "Again" with no name → reusing last recipient
[traceId] ✅ Reusing last email recipient: Rohan Damani (rohan@bwships.com)
```

---

## Verification Steps

### 1. Deploy Verification
```bash
# Check whatsapp-webhook lines 727-753
grep -A 30 "confirmation_no" supabase/functions/whatsapp-webhook/index.ts | grep "last_email_recipient"
# Should NOT find "last_email_recipient: null"

# Check whatsapp-webhook lines 868-891
grep -A 25 "greeting_smalltalk" supabase/functions/whatsapp-webhook/index.ts | grep "last_email_recipient"
# Should NOT find "last_email_recipient: null"
```

### 2. Database Verification
```sql
-- After "Cancel"
SELECT 
  pending_email_draft_id,
  confirmation_pending,
  last_email_recipient
FROM session_state
WHERE user_id = '<user_id>';

-- Expected:
-- pending_email_draft_id: null
-- confirmation_pending: null
-- last_email_recipient: {\"name\": \"Rohan Damani\", \"email\": \"rohan@bwships.com\"}
```

### 3. Log Verification
```bash
# After "Email Rohan again"
grep "Contact lookup debug" edge-function-logs

# Expected to see:
# lastRecipientName: "rohan damani"  (NOT undefined)
# hasLastRecipient: true              (NOT false)

grep "First name match\|Substring match\|Again.*reusing" edge-function-logs

# Expected to see ONE of:
# ✅ First name match: "rohan" → "rohan damani"
# ✅ Substring match: "rohan" in "rohan damani"
# ✅ "Again" with no name → reusing last recipient
```

---

## Related Code Locations

### Where last_email_recipient Gets SET
**File:** `supabase/functions/ai-agent/index.ts`  
**Lines:** 1284-1321 (after email draft is created)

```typescript
if (draftResult.data?.success && args.to) {
  await supabase.from('session_state').upsert({
    user_id: userId,
    last_email_recipient: {
      name: recipientName,
      email: args.to
    },
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  
  console.log(`[${traceId}] 💾 Stored last_email_recipient: ${recipientName} (${args.to})`);
}
```

### Where last_email_recipient Gets USED
**File:** `supabase/functions/ai-agent/index.ts`  
**Lines:** 1443-1510 (contact lookup with fuzzy matching)

```typescript
case 'lookup_contact':
  const { data: sessionForEmail } = await supabase
    .from('session_state')
    .select('last_email_recipient, ...')
    .eq('user_id', userId)
    .single();
  
  const lastRecipient = sessionForEmail?.last_email_recipient;
  const lastRecipientName = lastRecipient?.name?.toLowerCase().trim();
  
  if (isEmailAgain && lastRecipient) {
    // Fuzzy matching logic (lines 1475-1504)
    // - Exact match
    // - First name match
    // - Substring match
    // - Message contains name
    // - "Again" with no name
  }
```

### Where last_email_recipient Was WRONGLY Cleared (NOW FIXED)
**File:** `supabase/functions/whatsapp-webhook/index.ts`  
**Lines:** 727-753 (cancel flow) - `last_email_recipient: null` **REMOVED**  
**Lines:** 868-891 (greeting flow) - `last_email_recipient: null` **REMOVED**

---

## Summary

| Component | Status | Evidence |
|-----------|--------|----------|
| Fuzzy matching logic | ✅ Already deployed | Lines 1474-1504 in ai-agent |
| "Again" detection | ✅ Already deployed | Lines 1446-1448 in ai-agent |
| Contact storage | ✅ Already working | Lines 1284-1321 in ai-agent |
| **Cancel clearing recipient** | ❌ **WAS THE BUG** | Line 746 in whatsapp-webhook |
| **Greeting clearing recipient** | ❌ **WAS THE BUG** | Line 884 in whatsapp-webhook |
| **Both bugs now fixed** | ✅ **FIXED** | Removed from both flows |

---

## Next Steps

1. User to test the fixed flow:
   - "Email Rohan and thank him" → Select contact → "Cancel"
   - "Email Rohan again and ask him to meet tomorrow"
   - Should reuse contact WITHOUT fresh search

2. Check logs for:
   - `lastRecipientName: "rohan damani"` (NOT undefined)
   - `✅ First name match` or `✅ Substring match`
   - `✅ Reusing last email recipient`

3. If still broken, verify:
   - Edge functions have been redeployed
   - Database actually shows `last_email_recipient` after Cancel
   - No other code path is clearing the recipient

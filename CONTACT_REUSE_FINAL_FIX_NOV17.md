# Contact Reuse Bug - Final Root Cause Fix (Nov 17, 2025)

## Executive Summary

**FOUND THE REAL BUG**: The contact reuse logic (`last_email_recipient` saving) was fully implemented but **never executed** due to a faulty condition check.

## Investigation Results

### What We Discovered

1. **The fuzzy matching code IS deployed** (lines 1474-1504 in `ai-agent/index.ts`)
2. **The cancel/greeting preservation IS deployed** (lines 746, 884 in `whatsapp-webhook/index.ts`)
3. **The save-recipient logic EXISTS** (lines 1284-1321 in `ai-agent/index.ts`)

BUT:

4. **The save logic NEVER RUNS** because of wrong condition at line 1285

### The Bug

**File:** `supabase/functions/ai-agent/index.ts`  
**Line:** 1285

```typescript
// ❌ WRONG - This condition is ALWAYS false
if (draftResult.data?.success && args.to) {
```

**Why it's wrong:**

`handle-gmail/index.ts` returns:
```typescript
return new Response(JSON.stringify({ message }), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
```

It returns `{ message: "..." }` with NO `success` field!

So `draftResult.data?.success` is always `undefined`, and the entire block never executes.

### The Evidence

**From logs (2025-11-17 07:48-07:49):**

```
ai-agent: Executing tool: create_email_draft { to: "rohan@bwships.com", ... }
handle-gmail: (creates draft successfully)
ai-agent: (should log "💾 Stored last_email_recipient") ❌ MISSING
```

**Search results:**
- ✅ "Contact lookup debug" - Found (fuzzy logic deployed)
- ❌ "Stored last_email_recipient" - NOT FOUND (save logic never ran)
- ❌ "Email draft created" from handle-gmail - NOT FOUND

**Database state after draft creation:**
```
lastRecipientName: undefined
hasLastRecipient: false
```

This proves the save block at lines 1311-1320 never executed.

## The Fix

**File:** `supabase/functions/ai-agent/index.ts`  
**Line:** 1285

```typescript
// ✅ CORRECT - Check for message instead
if (draftResult.data?.message && args.to) {
```

Now the condition will be true when handle-gmail successfully returns a message.

### What Happens After Fix

**1. User creates email draft:**
```
User: "Email Rohan Damani about meeting tomorrow"
→ lookup_contact finds: { name: "Rohan Damani", email: "rohan@bwships.com" }
→ create_email_draft calls handle-gmail
→ handle-gmail returns: { message: "📧 Email Draft Created..." }
→ NEW: Condition TRUE → saves last_email_recipient
→ LOG: "💾 Stored last_email_recipient: Rohan Damani (rohan@bwships.com)"
```

**Database after draft:**
```json
{
  "last_email_recipient": {
    "name": "Rohan Damani",
    "email": "rohan@bwships.com"
  }
}
```

**2. User cancels:**
```
User: "Cancel"
→ Clears pending_email_draft_id
→ Preserves last_email_recipient (lines 746 in whatsapp-webhook)
```

**Database after cancel:**
```json
{
  "last_email_recipient": {
    "name": "Rohan Damani",
    "email": "rohan@bwships.com"
  },
  "pending_email_draft_id": null  // cleared
}
```

**3. User says "Email Rohan again":**
```
User: "Email Rohan again and ask him to meet tomorrow"
→ AI extracts: name="Rohan"
→ lookup_contact starts
→ Checks last_email_recipient
→ FINDS: { name: "Rohan Damani", email: "rohan@bwships.com" }
→ Fuzzy match: "rohan" → "rohan damani" (first name match)
→ LOG: "✅ First name match: rohan → rohan damani"
→ Returns: "Using Rohan Damani (rohan@bwships.com)"
→ NO FRESH CONTACT SEARCH
```

## Verification Steps

### 1. Check Deployed Code

```bash
# Verify line 1285 shows the NEW condition
grep -A 1 "ENHANCEMENT: Store this as last_email_recipient" supabase/functions/ai-agent/index.ts
```

Expected:
```typescript
if (draftResult.data?.message && args.to) {
```

### 2. Test the Flow

1. Say: "Email Rohan Damani about meeting tomorrow"
2. Select contact, review draft
3. Watch for log: `💾 Stored last_email_recipient: Rohan Damani`
4. Say: "Cancel"
5. Check database: `last_email_recipient` should still contain Rohan
6. Say: "Email Rohan again and ask about the deck"
7. Watch for log: `✅ First name match: rohan → rohan damani`
8. Should reuse contact directly, NO fresh search

### 3. Check Logs

```sql
-- After draft creation
SELECT * FROM logs 
WHERE payload::text LIKE '%Stored last_email_recipient%'
ORDER BY created_at DESC LIMIT 1;

-- After "email X again"
SELECT * FROM logs 
WHERE payload::text LIKE '%First name match%'
ORDER BY created_at DESC LIMIT 1;
```

### 4. Check Database

```sql
SELECT 
  last_email_recipient,
  pending_email_draft_id,
  updated_at
FROM session_state
WHERE user_id = '<your-user-id>'
ORDER BY updated_at DESC LIMIT 1;
```

After draft: `last_email_recipient` should have `{"name": "Rohan Damani", "email": "rohan@bwships.com"}`

## Complete Fix Chain

1. ✅ Fuzzy matching deployed (lines 1474-1504)
2. ✅ Cancel preservation deployed (line 746)
3. ✅ Greeting preservation deployed (line 884)
4. ✅ **NEW: Save logic condition fixed (line 1285)** ← This was the missing piece

Now the entire flow works:
- Contact selected → **saved to last_email_recipient**
- Draft cancelled → **last_email_recipient preserved**
- "Email X again" → **fuzzy match finds saved contact**
- **No fresh search triggered**

## Expected Behavior (Final)

```
✅ CORRECT FLOW:

1. "Email Rohan Damani..."
   → Lookup contact
   → Create draft
   → SAVE: last_email_recipient = {name: "Rohan Damani", email: "..."}
   
2. "Cancel"
   → Clear pending_email_draft_id
   → KEEP: last_email_recipient
   
3. "Email Rohan again..."
   → Check last_email_recipient
   → Fuzzy match "rohan" with "rohan damani"
   → REUSE directly
   → NO fresh contact search
```

## Previous Assumptions (All Wrong)

❌ "Fuzzy matching not deployed" - IT WAS DEPLOYED  
❌ "Cancel clearing last_email_recipient" - IT WASN'T CLEARING  
❌ "Save logic missing" - IT WAS THERE

✅ **ACTUAL BUG**: Save logic condition checking wrong field (`success` instead of `message`)

## Status

🔧 **FIX APPLIED**: Line 1285 condition corrected  
⏳ **PENDING**: Deployment and user verification  
📊 **NEXT**: User to test and confirm logs show the save happening

---

**Evidence File Created:** 2025-11-17 07:56 UTC  
**Issue:** Contact reuse "Email X again" failing  
**Root Cause:** Faulty condition preventing `last_email_recipient` save  
**Fix:** Changed condition from `?.success` to `?.message`  
**Status:** Ready for deployment and testing

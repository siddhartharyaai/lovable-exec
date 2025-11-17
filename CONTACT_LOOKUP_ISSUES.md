# Contact Lookup & Reuse Issues - BACKLOG

**Status:** Known issue, deprioritized for post-MVP  
**Date Identified:** November 17, 2024  
**Reporter:** Testing on WhatsApp (+91 98212 30311)  

---

## Issue 1: Initial Contact Lookup Fails, Then Succeeds

### Symptom
When user asks "Email Rohan", the bot first responds with "I can't seem to find a contact named Rohan", but when user insists "Its there", it suddenly finds multiple Rohans.

### Root Cause
The contact lookup flow has inconsistent behavior:
1. First lookup may fail due to Google Contacts API caching or permission issues
2. Second attempt (after user prompts "Its there") triggers a fresh API call that succeeds

### Evidence
- Test case from Nov 17, ~09:06 IST
- Contact: "Rohan Damani" (rohan@bwships.com) exists in Google Contacts
- First lookup: "I can't seem to find a contact named Rohan"
- After "Its there": "I found a few contacts named Rohan..." (returns 3 matches)

### Location in Code
- `supabase/functions/handle-contacts/index.ts` (lines 65-91)
- Google People API search: `people:searchContacts?query={name}`

### Potential Fixes (for later)
1. Add retry logic with exponential backoff on API failures
2. Implement local contact cache that persists across lookups
3. Add debug logging to distinguish between "no results" vs "API error"
4. Consider pre-fetching/caching contacts on first Google OAuth connect

---

## Issue 2: "Email X Again" Doesn't Reuse Last Recipient

### Symptom
After selecting a contact (e.g., "Rohan Damani") and cancelling the email, saying "Email Rohan again" triggers a fresh contact search instead of reusing the previously selected contact.

### Root Cause
The `last_email_recipient` reuse logic in `ai-agent/index.ts` has a fuzzy matching problem:

**Current Logic** (lines 1442-1464):
```typescript
// Case 1: Exact match on lowercased name
if (searchName && lastRecipientName === searchName) {
  shouldReuseLastRecipient = true;
}
// Case 2: Message contains last recipient's full name
else if (!searchName && lastRecipientName && msgLowerForEmail.includes(lastRecipientName)) {
  shouldReuseLastRecipient = true;
}
```

**The Problem:**
- When user says "Email Rohan again", AI extracts `args.name = "Rohan"`
- But `last_email_recipient.name = "Rohan Damani"` (full name from selection)
- Case 1 fails: `"rohan" !== "rohan damani"`
- Case 2 fails: `"email rohan again..." doesn't include "rohan damani"`
- Result: Falls through to fresh contact search

### Evidence
- Test case from Nov 17, ~09:10 IST
- Step 5: User selected "Rohan Damani (rohan@bwships.com)" → stored in `last_email_recipient`
- Step 6: User cancelled email
- Step 7: "Email rohan again..." → Bot ignored `last_email_recipient` and did fresh search showing 5 Rohans

### Current Workaround
**None.** Contact selection must be repeated each time, even within the same conversation session.

### Potential Fixes (for later)

#### Option A: Fuzzy First-Name Matching
```typescript
// Extract first name from last_email_recipient.name
const lastFirstName = lastRecipient.name.split(' ')[0].toLowerCase();
const searchFirstName = searchName.split(' ')[0];

// Case 1: First name match
if (searchFirstName === lastFirstName) {
  shouldReuseLastRecipient = true;
  console.log(`✅ Fuzzy match: "${searchName}" → "${lastRecipient.name}"`);
}
```

#### Option B: Substring Matching
```typescript
// Case 1: searchName is substring of lastRecipientName OR vice versa
if (searchName && (
  lastRecipientName.includes(searchName) || 
  searchName.includes(lastRecipientName)
)) {
  shouldReuseLastRecipient = true;
}
```

#### Option C: Proactive Confirmation
Instead of silently reusing, ask:
```
"I see you emailed Rohan Damani (rohan@bwships.com) recently. 
Use the same contact? (Reply Yes/No)"
```

#### Option D: Session-Based Contact Memory
Store all resolved contacts in session with a TTL:
```typescript
session_state.resolved_contacts = {
  "rohan": { name: "Rohan Damani", email: "rohan@bwships.com", timestamp: "..." },
  "sarah": { name: "Sarah Chen", email: "sarah@...", timestamp: "..." }
}
```

---

## Impact
**Severity:** Low - UX annoyance, not a blocker  
**Frequency:** Occurs on every "Email X again" follow-up  
**User Impact:** Requires re-selecting contact from list, adds ~2 extra messages per interaction  

## Recommendation
**Defer to post-MVP.** The core email flow works; this is optimization for repeat interactions.

---

## Testing Notes

### To Reproduce Issue 2:
1. Send: "Email Rohan and thank him for dinner"
2. Bot shows multiple Rohans → Select one (e.g., "1")
3. Bot creates draft → Cancel it
4. Send: "Email Rohan again and say he needs to send that document"
5. **Expected:** Bot reuses previous selection or asks "Use Rohan Damani again?"
6. **Actual:** Bot shows full contact list again

### Expected Fix Verification:
After implementing fuzzy matching:
- Step 4 should either:
  - Silently reuse "Rohan Damani" (Option A/B), OR
  - Ask "Use Rohan Damani again? (Yes/No)" (Option C)

---

## Related Files
- `supabase/functions/ai-agent/index.ts` (lines 1414-1550) - Contact reuse logic
- `supabase/functions/handle-contacts/index.ts` - Google Contacts API integration
- Database: `session_state.last_email_recipient` (JSONB column)
- Database: `session_state.contacts_search_results` (JSONB column)

## Next Steps (Post-MVP)
1. Implement Option A (fuzzy first-name matching) as it's least invasive
2. Add integration test for "email X again" flow
3. Consider adding user preference: "Always ask" vs "Always reuse" for contact disambiguation

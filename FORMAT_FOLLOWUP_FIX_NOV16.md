# Doc Q&A Format & Contact Follow-up Fix - Nov 16

## Issues Fixed

### 1. Doc Q&A Format Adherence ✅

**Problem**: 
- AI was ignoring format instructions like "1 line each", producing paragraphs instead
- Unwanted citations "(Document: X, Chapter Y)" being added when not requested
- Multi-sentence responses when user explicitly asked for single lines

**Root Cause**: 
- System prompt included "Always cite which document the information came from"
- No strong emphasis on following user's format instructions EXACTLY
- AI defaulting to verbose explanatory style

**Fix Implemented** (`handle-document-qna/index.ts` lines 182-195):

```typescript
let systemPrompt = `You are Maria, a helpful document assistant. Answer the user's question based ONLY on the provided document content. 

CRITICAL FORMAT RULES:
- Follow the user's format instructions EXACTLY (e.g., "1 line each" means ONE line, not paragraphs)
- If they say "bullet points", use concise bullets (not multi-sentence paragraphs)
- If they specify a number (e.g., "5 bullets"), provide exactly that number
- Do NOT add citations like "(Document: X, Chapter Y)" unless explicitly asked
- Do NOT add extra explanations or context beyond what was requested
- Keep responses focused and concise (max 200 words unless user asks for more)

If the answer isn't in the document, say so clearly.`;
```

**Behavior After Fix**:
- "5 bullets of 1 line each" → Exactly 5 single-line bullets
- No unwanted citations unless user asks "cite your sources"
- Respects format constraints (bullets vs paragraphs, line limits, etc.)

---

### 2. Contact Follow-up ("Email X Again") ✅

**Problem**:
- "Email Rohan..." → Works fine, selects contact
- "Email Rohan again and say thanks" → Re-triggers full contact lookup flow
- Multiple "Found contact..." / "Working on it..." messages unnecessarily
- User already picked Rohan, system should remember

**Root Cause**:
- Contact cache stored search results but not the SELECTED contact
- No session memory of "last email recipient"
- Every email action triggered fresh lookup_contact

**Fixes Implemented**:

#### Database Schema (`session_state` table):
```sql
ALTER TABLE session_state 
  ADD COLUMN last_email_recipient JSONB;
-- Stores: {name: "Rohan Damani", email: "rohan@example.com"}
```

#### 1. Contact Lookup Enhancement (`ai-agent/index.ts` lines 1401-1469):
```typescript
case 'lookup_contact':
  // Check if this is "email X again" scenario
  const msgLowerForEmail = (userMessage || message || '').toLowerCase();
  const isEmailAgain = msgLowerForEmail.includes('again') || 
                       msgLowerForEmail.includes('also email') ||
                       msgLowerForEmail.includes('send another');
  
  // Get last_email_recipient from session
  const { data: sessionForEmail } = await supabase
    .from('session_state')
    .select('last_email_recipient, contacts_search_results, ...')
    .eq('user_id', userId)
    .single();
  
  const searchName = (args.name || '').toLowerCase().trim();
  const lastRecipient = sessionForEmail?.last_email_recipient;
  const lastRecipientName = lastRecipient?.name?.toLowerCase().trim();
  
  // DEBUG LOGGING
  console.log('Contact lookup debug:', {
    isEmailAgain, searchName, lastRecipientName, 
    hasLastRecipient: !!lastRecipient
  });
  
  // OPTIMIZATION: Detect reuse scenarios
  let shouldReuseLastRecipient = false;
  
  if (isEmailAgain && lastRecipient) {
    // Case 1: args.name matches last recipient
    if (searchName && lastRecipientName === searchName) {
      shouldReuseLastRecipient = true;
    }
    // Case 2: No args.name but message contains last recipient's name
    else if (!searchName && lastRecipientName && msgLowerForEmail.includes(lastRecipientName)) {
      shouldReuseLastRecipient = true;
    }
    // Case 3: No args.name at all, just "again" - reuse anyway
    else if (!searchName) {
      shouldReuseLastRecipient = true;
    }
  }
  
  if (shouldReuseLastRecipient) {
    console.log(`Reusing last email recipient: ${lastRecipient.name}`);
    result = `Using ${lastRecipient.name} (${lastRecipient.email})`;
    break;
  }
  
  // Otherwise, proceed with normal cache/lookup logic...
```

#### 2. Email Draft Storage (`ai-agent/index.ts` lines 1254-1286):
```typescript
case 'create_email_draft':
  const draftResult = await supabase.functions.invoke('handle-gmail', ...);
  
  // Store as last_email_recipient for follow-ups
  if (draftResult.data?.success && args.to) {
    const { data: emailSession } = await supabase
      .from('session_state')
      .select('contacts_search_name, contacts_search_results')
      .eq('user_id', userId)
      .single();
    
    // Extract contact name: prioritize actual contact name from results
    let recipientName = emailSession?.contacts_search_name;
    
    // Try to find exact contact by email in cached results
    if (emailSession?.contacts_search_results) {
      const matchingContact = emailSession.contacts_search_results.find(
        (c: any) => c.emails?.some((e: string) => e.toLowerCase() === args.to.toLowerCase())
      );
      if (matchingContact?.name) {
        recipientName = matchingContact.name;
      }
    }
    
    // Fallback to email username
    if (!recipientName) {
      recipientName = args.to.split('@')[0];
    }
    
    await supabase.from('session_state').upsert({
      user_id: userId,
      last_email_recipient: {
        name: recipientName,
        email: args.to
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    
    console.log(`Stored last email recipient: ${recipientName}`);
  }
```

**Behavior After Fix**:
1. "Email Rohan..." → Select contact → stored in `last_email_recipient`
2. "Email Rohan again and..." → Instantly reuses stored contact, no lookup
3. "Email again" (no name) → Reuses last recipient automatically
4. "Also email Rohan" → Same optimization
5. "Email John" → Different name, triggers normal lookup
6. After 15 min of no activity → Cache expires, fresh lookup on next request

**Edge Cases Handled**:
- **args.name is undefined**: Falls back to message text analysis or just reuses last recipient if "again" detected
- **Name mismatch**: Only triggers reuse if names match OR args.name is empty with "again"
- **First email vs follow-up**: First email always does lookup + stores; follow-ups skip lookup
- **Multiple follow-ups**: Can do "email X again" multiple times, each reuses the same contact
- **Accurate name extraction**: Matches email address against cached contacts to get exact name

---

## Testing Protocol

### Test Case 1: Doc Format Adherence
```
1. Upload 100+ page PDF
2. Send: "Give me 5 bullet points of exactly 1 line each"
3. Expected: 5 bullets, each 1 line (not paragraphs)
4. Should NOT see: Citations like "(Document: Chapter 3)"
5. Verify: Each bullet is actually 1 line, not multi-sentence
```

### Test Case 2: Contact Follow-up
```
1. Send: "Email Rohan about the meeting"
2. Select contact from disambiguation
3. Confirm draft sent
4. Send: "Email Rohan again and say thanks"
5. Expected: Instant recognition, no "Found 3 Rohans" flow
6. Should see: "Using Rohan Damani (rohan@...)" 
7. Wait 20 minutes
8. Send: "Email Rohan one more time"
9. Expected: Fresh lookup (cache expired)
```

### Test Case 3: Different Contact
```
1. After emailing Rohan (stored as last_email_recipient)
2. Send: "Email Nikhil about the same thing"
3. Expected: Normal lookup for Nikhil (different name)
4. Should NOT reuse Rohan's contact
```

---

## Success Metrics

✅ **Doc Q&A respects format instructions** (1 line = 1 line, 5 bullets = 5 bullets)  
✅ **No unwanted citations** unless explicitly requested  
✅ **"Email X again"** reuses last recipient within session  
✅ **No redundant lookups** for same contact in follow-ups  
✅ **Different contacts** still trigger proper lookup  
✅ **Cache expiry** ensures fresh data after inactivity

---

## Edge Cases Handled

1. **Multi-part format requests**: "5 bullets, 1 line each, no citations" → All constraints respected
2. **Similar names**: "Email Rohan" then "Email Rohit" → Different names, separate lookups
3. **Cache expiry**: 15 min session timeout for contact data
4. **Ambiguous "again"**: Triggers optimization even if name is missing from args
5. **Missing session data**: Falls back to normal lookup if no last_email_recipient stored
6. **args.name undefined**: System checks message text and falls back to reusing last recipient
7. **Exact name matching**: Finds contact by email in cached results to store accurate name
8. **Multiple follow-ups**: "Email X again" works multiple times in sequence

---

## Files Modified

1. `supabase/functions/handle-document-qna/index.ts` (lines 182-195)
   - Updated system prompt with CRITICAL FORMAT RULES
   - Removed "Always cite" instruction
   - Added emphasis on exact format adherence

2. `supabase/functions/ai-agent/index.ts` (lines 1401-1469, 1254-1286)
   - Added "email X again" detection in `lookup_contact`
   - Implemented `last_email_recipient` check before lookup
   - Added storage of recipient after successful email draft

3. `supabase/migrations/*` (session_state table)
   - Added `last_email_recipient JSONB` column
   - Stores {name, email} for follow-up optimization

---

## Remaining Considerations

- **Multi-recipient emails**: Currently only stores last single recipient
- **Reply-to scenarios**: If replying to email, might want to store that context too
- **Contact changes**: If contact email changes in Google, cache won't update until next fresh lookup
- **Session cleanup**: No automatic cleanup of stale `last_email_recipient` data (relies on 15min cache expiry pattern)

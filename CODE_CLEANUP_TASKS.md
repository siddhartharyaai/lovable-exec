# Code Cleanup Tasks - Production Readiness

## Overview
These tasks focus on removing debug logging, dead code, and improving code quality before considering MVP "done."

---

## 1. Debug Logging Cleanup

### What to Remove
- Excessive `console.log('Debug: ...')` statements
- Temporary logging added during development
- Verbose parameter dumps (e.g., `console.log('args:', JSON.stringify(args))`)

### What to Keep
- Structured logs with trace IDs (for audit trail)
- ERROR level logs (critical failures)
- WARNING level logs (recoverable issues)
- Key decision points (e.g., "Using cached contact", "Token refresh needed")

### Files to Review (Priority Order)

#### High Priority (User-Facing Functions)
1. `supabase/functions/whatsapp-webhook/index.ts`
   - Remove verbose body parsing logs
   - Keep only error logs and structured audit logs

2. `supabase/functions/ai-agent/index.ts`
   - Remove tool call debug dumps
   - Keep decision logs (which tool chosen, why)
   - Remove intermediate variable logs

3. `supabase/functions/handle-document-qna/index.ts`
   - Remove "Processing doc..." style logs
   - Keep validation failure logs
   - Keep truncation notices

4. `supabase/functions/route-intent/index.ts`
   - Remove verbose routing decision logs
   - Keep final routing choice log

5. `supabase/functions/parse-intent/index.ts`
   - Remove intermediate parsing steps
   - Keep final intent classification log

#### Medium Priority (Integration Functions)
6. `supabase/functions/handle-gmail/index.ts`
7. `supabase/functions/handle-calendar/index.ts`
8. `supabase/functions/handle-tasks/index.ts`
9. `supabase/functions/handle-contacts/index.ts`
10. `supabase/functions/handle-drive/index.ts`
11. `supabase/functions/handle-reminder/index.ts`

#### Low Priority (Background Jobs)
12. `supabase/functions/check-due-reminders/index.ts`
13. `supabase/functions/daily-briefing/index.ts`
14. `supabase/functions/check-birthday-reminders/index.ts`

---

## 2. Dead Code Removal

### What to Look For
- Commented-out code blocks (e.g., `// Old implementation`)
- Unused imports (e.g., `import X from 'Y'` where X is never used)
- Unused helper functions
- Deprecated handlers
- Old experimental branches

### Files to Review

#### Edge Functions
- Check each `supabase/functions/*/index.ts` for:
  - Commented-out code blocks
  - Unused helper functions
  - Dead error handling branches

#### Frontend (Lower Priority)
- `src/pages/Dashboard.tsx` - Remove any unused components
- `src/pages/Settings.tsx` - Remove unused state variables
- `src/components/` - Check for unused UI components

---

## 3. Consistent Error Handling

### Goal
Ensure all edge functions follow the same error handling pattern:

```typescript
try {
  // Main logic
} catch (error) {
  structuredLog(traceId, 'ERROR', 'function_name_error', {
    error: error.message,
    stack: error.stack,
  });
  
  return new Response(
    JSON.stringify({ 
      error: 'User-friendly error message',
      trace_id: traceId 
    }),
    { status: 500, headers: corsHeaders }
  );
}
```

### Files to Review
- All 25 edge functions should follow this pattern
- Check for functions returning generic "An error occurred" messages
- Ensure all errors include trace_id for debugging

---

## 4. TypeScript Type Safety

### Goal
Ensure no `any` types are used where proper types exist.

### Files to Review
1. `supabase/functions/ai-agent/index.ts`
   - Tool call args should be properly typed
   - AI response types should be defined

2. `supabase/functions/handle-document-qna/index.ts`
   - Document metadata types
   - AI response types

3. All `supabase/functions/handle-*/index.ts`
   - Google API response types
   - Ensure return types are explicit

---

## 5. Environment Variables Documentation

### Create `.env.example`
Document all required environment variables:

```
# Lovable Cloud (Auto-configured)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_PROJECT_ID=

# Required Secrets (Configure in Lovable Cloud Secrets)
LOVABLE_API_KEY=your_lovable_api_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
DEEPGRAM_API_KEY=your_deepgram_key
SERP_API_KEY=your_serpapi_key
FIRECRAWL_API_KEY=your_firecrawl_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

---

## 6. Naming Consistency

### Goal
Ensure consistent naming across codebase.

### Examples
- Function names: `camelCase` (e.g., `handleGmail`, not `handle_gmail`)
- File names: `kebab-case` (e.g., `handle-gmail`, not `handleGmail`)
- Database columns: `snake_case` (e.g., `user_id`, not `userId`)
- TypeScript interfaces: `PascalCase` (e.g., `UserProfile`, not `userProfile`)

### Files to Review
- All edge function file names (already correct: `handle-gmail/index.ts`)
- Check function exports are consistent

---

## 7. Documentation Comments

### Goal
Add JSDoc comments to complex functions.

### Example
```typescript
/**
 * Looks up a contact by name from Google Contacts API.
 * Uses cached results if available (15min TTL).
 * 
 * @param accessToken - Google OAuth access token
 * @param contactName - Name to search for (case-insensitive)
 * @param sessionState - User session state (for caching)
 * @returns Array of matching contacts with email addresses
 * @throws Error if Google API call fails
 */
async function lookupContact(
  accessToken: string,
  contactName: string,
  sessionState: any
): Promise<ContactResult[]> {
  // Implementation
}
```

### Files to Add Comments
- `supabase/functions/ai-agent/index.ts` - Tool definitions
- `supabase/functions/handle-document-qna/index.ts` - Mode selection logic
- `supabase/functions/handle-contacts/index.ts` - Contact search logic

---

## Execution Plan

### Phase 1: Critical Cleanup (1-2 hours)
1. Remove debug logs from top 5 user-facing functions
2. Remove commented-out code blocks
3. Ensure all error handlers include trace_id

### Phase 2: Type Safety (1 hour)
1. Add proper TypeScript types to tool args
2. Define response interfaces for external APIs
3. Remove `any` types where possible

### Phase 3: Documentation (30 minutes)
1. Create `.env.example`
2. Add JSDoc comments to complex functions

### Phase 4: Final Review (30 minutes)
1. Run through MVP acceptance test (see MVP_COMPLETION.md)
2. Verify no console errors in browser/edge function logs
3. Confirm all tests pass

---

## Verification

After cleanup, verify:
- [ ] No `console.log('Debug: ...')` in any edge function
- [ ] No commented-out code blocks
- [ ] All errors include user-friendly messages + trace_id
- [ ] `.env.example` exists with all required variables
- [ ] TypeScript compiles without warnings
- [ ] MVP acceptance test passes (3 consecutive runs)

---

Last Updated: 2024-11-16

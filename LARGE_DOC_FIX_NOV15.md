# Large Document Processing Fix - November 15, 2025

## Bug Report
**Issue**: App goes silent when processing very large PDFs (496 pages, 18MB)
- No confirmation message
- No error message
- WhatsApp completely silent

**Root Cause**: CPU timeout in `whatsapp-webhook` when processing massive documents
- PDF parsing succeeded (496 pages → 1.1M chars)
- DB insert or subsequent processing exceeded edge function CPU limit
- Error not caught → no response sent to Twilio → user sees silence

## Fixes Implemented

### 1. Page Limit (150 pages)
```typescript
// In extractTextFromDocument()
const PAGE_LIMIT = 150;
const pagesToProcess = Math.min(numPages, PAGE_LIMIT);
const isLargeDoc = numPages > PAGE_LIMIT;

if (isLargeDoc) {
  console.warn(`Large PDF detected (${numPages} pages). Processing first ${PAGE_LIMIT} pages only.`);
}

// Returns metadata marker: [DOC_TRUNCATED:496:150]\n\n{text}
```

### 2. File Size Limit (20 MB)
```typescript
// Before processing
if (docBuffer.byteLength > 20 * 1024 * 1024) {
  largeDocWarning = `⚠️ That file is too large (${bufferSizeMB} MB). I can handle documents up to 20 MB.`;
  // Skip processing, send error message
}
```

### 3. Text Length Limit (200K chars)
```typescript
// Before DB insert
const TEXT_LIMIT = 200000;
const finalDocText = cleanDocText.length > TEXT_LIMIT 
  ? cleanDocText.substring(0, TEXT_LIMIT) + '\n\n[Text truncated due to size]'
  : cleanDocText;
```

### 4. Graceful User Messages
```typescript
// When truncated
largeDocWarning = `📄 This document has ${totalPages} pages. I've processed the first ${processedPages} pages for now. What would you like to know? (summary, key points, specific section, etc.)`;

// Confirmation includes warning
const confirmReply = largeDocWarning 
  ? `${baseConfirmation}\n\n${largeDocWarning}`
  : `${baseConfirmation} What would you like to know about it?`;
```

### 5. Guaranteed Error Response
```typescript
catch (docError) {
  console.error(`Document processing error:`, docError);
  const errorReply = largeDocWarning || "Sorry, I had trouble processing that document...";
  await supabase.functions.invoke('send-whatsapp', {
    body: { userId, message: errorReply, traceId }
  });
  // Always return response to Twilio
  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

## Expected Behavior

### Scenario A: Large PDF (496 pages)
1. User uploads 496-page PDF
2. System processes first 150 pages
3. User receives:
```
📄 Got it! I've saved your document "nexus-history.pdf".

📄 This document has 496 pages. I've processed the first 150 pages for now. What would you like to know? (summary, key points, specific section, etc.)
```
4. User can ask: "summarize it", "key takeaways", "who are the directors"
5. System answers based on first 150 pages

### Scenario B: Oversized File (>20 MB)
1. User uploads 25 MB file
2. System rejects before processing
3. User receives:
```
⚠️ That file is too large (25.00 MB). I can handle documents up to 20 MB. Could you send a smaller file or a specific section?
```

### Scenario C: Normal Document (<150 pages, <20 MB)
1. User uploads 100-page PDF
2. System processes all pages
3. User receives:
```
📄 Got it! I've saved your document "contract.pdf". What would you like to know about it?
```
4. Full document available for Q&A

### Scenario D: Processing Error
1. Any unexpected error during extraction/storage
2. Catch block triggers
3. User receives either:
   - The `largeDocWarning` if available, OR
   - "Sorry, I had trouble processing that document..."
4. **Guaranteed**: User ALWAYS gets a response (no silence)

## Testing Protocol

### Test 1: Large PDF (~500 pages)
1. Upload the 496-page Nexus PDF
2. **Expected**: Confirmation message with "496 pages... first 150 pages" warning
3. Then ask: "summarize this"
4. **Expected**: Summary based on first 150 pages

### Test 2: Medium PDF (~100 pages)
1. Upload 100-page document
2. **Expected**: Normal confirmation "What would you like to know?"
3. Ask: "key takeaways"
4. **Expected**: Full document analysis

### Test 3: Oversized File (>20 MB)
1. Upload file larger than 20 MB
2. **Expected**: Immediate rejection message with size limit

### Test 4: Normal Workflow
1. Upload any normal PDF (<150 pages, <20 MB)
2. **Expected**: Standard confirmation
3. Ask questions
4. **Expected**: Answers based on full document

## Success Metrics
- ✅ No silent failures (all uploads get a response)
- ✅ Large docs handled gracefully with clear limits
- ✅ Users informed about truncation before asking questions
- ✅ No CPU timeouts on large file processing
- ✅ Error messages are friendly and actionable

## Limits Summary
| Limit Type | Value | Reason |
|------------|-------|--------|
| File Size | 20 MB | Prevent download timeout |
| Page Count | 150 pages | Prevent CPU timeout during parsing |
| Text Length | 200K chars | Prevent DB storage issues |

These limits can be tuned based on real-world usage patterns.

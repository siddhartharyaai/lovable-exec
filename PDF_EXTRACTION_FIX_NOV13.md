# PDF Extraction Fix - November 13, 2025

## Bug
PDF text extraction was crashing with "Maximum call stack size exceeded" and storing raw binary data instead of text.

## Root Cause
```javascript
const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
// ❌ This caused stack overflow for large PDFs (>100KB)
```

## Fix
Replaced with proper PDF parsing library:
```javascript
import { getDocument } from 'https://esm.sh/pdfjs-serverless@0.2.1';

const document = await getDocument({
  data: new Uint8Array(buffer),
  useSystemFonts: true,
}).promise;

// Extract text from all pages
for (let i = 1; i <= document.numPages; i++) {
  const page = await document.getPage(i);
  const textContent = await page.getTextContent();
  const pageText = textContent.items.map(item => item.str).join(' ');
  textParts.push(pageText);
}
```

## Deployed
✅ whatsapp-webhook redeployed with working PDF extraction

## Test
Upload NDA.pdf and ask "Summarize this document"

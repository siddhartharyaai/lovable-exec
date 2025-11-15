import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from 'https://esm.sh/pdfjs-serverless@0.2.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process in 8KB chunks to avoid stack overflow
  let binary = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  
  return btoa(binary);
}

// Extract text from documents using appropriate method
async function extractTextFromDocument(buffer: ArrayBuffer, mimeType: string, traceId: string): Promise<string> {
  console.log(`[${traceId}] === DOCUMENT EXTRACTION START ===`);
  console.log(`[${traceId}] MIME type: ${mimeType}`);
  console.log(`[${traceId}] Size: ${buffer.byteLength} bytes`);
  
  try {
    // Method 1: PDF parsing using pdfjs-serverless library
    if (mimeType === 'application/pdf') {
      console.log(`[${traceId}] Using pdfjs-serverless library for PDF extraction...`);
      try {
        const document = await getDocument({
          data: new Uint8Array(buffer),
          useSystemFonts: true,
        }).promise;
        
        const numPages = document.numPages;
        console.log(`[${traceId}] PDF has ${numPages} pages`);
        
        // 🚨 LARGE DOC LIMIT: Max 150 pages to avoid CPU timeout
        const PAGE_LIMIT = 150;
        const pagesToProcess = Math.min(numPages, PAGE_LIMIT);
        const isLargeDoc = numPages > PAGE_LIMIT;
        
        if (isLargeDoc) {
          console.warn(`[${traceId}] ⚠️ Large PDF detected (${numPages} pages). Processing first ${PAGE_LIMIT} pages only.`);
        }
        
        const textParts: string[] = [];
        for (let i = 1; i <= pagesToProcess; i++) {
          const page = await document.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          textParts.push(pageText);
        }
        
        const extractedText = textParts.join('\n\n');
        
        if (extractedText && extractedText.length > 100) {
          console.log(`[${traceId}] ✅ PDF parse success: ${extractedText.length} chars, ${pagesToProcess} pages`);
          
          // Return metadata about truncation for user message
          return isLargeDoc 
            ? `[DOC_TRUNCATED:${numPages}:${PAGE_LIMIT}]\n\n${extractedText}`
            : extractedText;
        } else {
          console.warn(`[${traceId}] PDF parse returned insufficient text: ${extractedText.length} chars`);
        }
      } catch (pdfError) {
        console.error(`[${traceId}] PDF parse failed:`, pdfError);
        // Fall through to other methods
      }
    }
    
    // Method 2: AI vision for images only
    if (mimeType.startsWith('image/')) {
      console.log(`[${traceId}] Trying Lovable AI vision extraction for image...`);
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      
      if (!lovableApiKey) {
        console.warn(`[${traceId}] LOVABLE_API_KEY not configured, skipping AI extraction`);
      } else {
        try {
          // Convert buffer to base64 safely (no stack overflow)
          const base64 = arrayBufferToBase64(buffer);
          const dataUrl = `data:${mimeType};base64,${base64}`;
          
          console.log(`[${traceId}] Calling Lovable AI vision API...`);
          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Extract ALL text content from this image. Include all visible text, headings, labels, captions - everything readable. Return ONLY the extracted text.'
                    },
                    {
                      type: 'image_url',
                      image_url: { url: dataUrl }
                    }
                  ]
                }
              ],
              max_tokens: 2000
            })
          });

          if (response.ok) {
            const data = await response.json();
            const extractedText = data.choices?.[0]?.message?.content || '';
            
            if (extractedText && extractedText.length > 50) {
              console.log(`[${traceId}] ✅ AI extraction success: ${extractedText.length} chars`);
              return extractedText;
            } else {
              console.warn(`[${traceId}] AI extraction returned too little text: ${extractedText.length} chars`);
            }
          } else {
            const errorText = await response.text();
            console.warn(`[${traceId}] AI vision failed: ${response.status} - ${errorText}`);
          }
        } catch (aiError) {
          console.warn(`[${traceId}] AI extraction exception:`, aiError);
        }
      }
    }
    
    // Try 2: Basic text decoding for text-based documents
    console.log(`[${traceId}] Trying basic text decoder...`);
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(buffer);
      
      // Clean up text (remove null bytes, excessive whitespace)
      const cleanedText = text
        .replace(/\0/g, '')
        .replace(/\s{3,}/g, '\n\n')
        .trim();
      
      if (cleanedText && cleanedText.length > 100) {
        console.log(`[${traceId}] ✅ Text decoder success: ${cleanedText.length} chars`);
        return cleanedText;
      } else {
        console.warn(`[${traceId}] Text decoder returned insufficient content: ${cleanedText.length} chars`);
      }
    } catch (decodeError) {
      console.warn(`[${traceId}] Text decoder failed:`, decodeError);
    }
    
    // Try 3: Extract any readable text fragments
    console.log(`[${traceId}] Trying fragment extraction...`);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(buffer);
    const readableFragments = rawText.match(/[\x20-\x7E\s]{20,}/g) || [];
    
    if (readableFragments.length > 0) {
      const fragmentText = readableFragments.join('\n\n');
      console.log(`[${traceId}] ⚠️ Partial extraction: ${fragmentText.length} chars from fragments`);
      return `[Partial extraction - some content may be missing]\n\n${fragmentText}`;
    }
    
    console.error(`[${traceId}] All extraction methods failed`);
    return '[Document uploaded but text extraction incomplete. The file may be encrypted, corrupt, or in an unsupported format. Try uploading a different version or ask me specific questions about what you remember being in it.]';
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${traceId}] === DOCUMENT EXTRACTION FAILED ===`);
    console.error(`[${traceId}] Error: ${errMsg}`);
    return '[Document uploaded but extraction completely failed. Please try a different file format or reach out if you need help.]';
  }
}

// Verify Twilio signature
function verifyTwilioSignature(signature: string, url: string, params: Record<string, string>): boolean {
  // For now, basic implementation - in production, use crypto for proper verification
  return signature.length > 0; // TODO: Implement proper HMAC-SHA256 verification
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] WhatsApp webhook received`);

  try {
    // Parse form data from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      params[key] = value.toString();
    }

    const twilioSignature = req.headers.get('X-Twilio-Signature') || '';
    const url = new URL(req.url).toString();
    
    // Verify signature
    if (!verifyTwilioSignature(twilioSignature, url, params)) {
      console.error(`[${traceId}] Invalid Twilio signature`);
      return new Response('Unauthorized', { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const phone = params.From?.replace('whatsapp:', '') || '';
    const body = params.Body || '';
    const mediaUrl = params.MediaUrl0 || null;
    const messageType = params.MediaContentType0 || 'text';
    const providerSid = params.MessageSid || '';

    console.log(`[${traceId}] From: ${phone}, Type: ${messageType}, Body: ${body.substring(0, 50)}...`);

    // Upsert user by phone
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({ phone, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
      .select()
      .single();

    if (userError || !userData) {
      console.error(`[${traceId}] User upsert error:`, userError);
      throw new Error('Failed to create/find user');
    }

    const userId = userData.id;
    console.log(`[${traceId}] User ID: ${userId}`);

    // Phase 3: Language detection
    console.log(`[${traceId}] Detecting language...`);
    const langDetectResult = await supabase.functions.invoke('detect-language', {
      body: { text: body || '', traceId }
    });

    const languageInfo = langDetectResult.data || { language: 'en', transliteration: 'none' };
    console.log(`[${traceId}] Language detected:`, languageInfo);

    // Handle audio transcription
    let messageBody = body;
    let translatedBody = body;

    // Handle document upload (PDF, DOC, DOCX)
    let documentContext = '';
    let largeDocWarning = '';
    
    if (mediaUrl && (messageType === 'application/pdf' || 
                      messageType === 'application/msword' || 
                      messageType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      console.log(`[${traceId}] Document detected: ${messageType}`);
      
      try {
        // Download document and get real filename
        const docResponse = await fetch(mediaUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`)
          }
        });

        if (docResponse.ok) {
          const docBuffer = await docResponse.arrayBuffer();
          const bufferSizeMB = (docBuffer.byteLength / (1024 * 1024)).toFixed(2);
          console.log(`[${traceId}] Document size: ${bufferSizeMB} MB`);
          
          // 🚨 SIZE LIMIT: Max 20 MB
          if (docBuffer.byteLength > 20 * 1024 * 1024) {
            console.error(`[${traceId}] ❌ Document too large: ${bufferSizeMB} MB (limit: 20 MB)`);
            largeDocWarning = `⚠️ That file is too large (${bufferSizeMB} MB). I can handle documents up to 20 MB. Could you send a smaller file or a specific section?`;
            documentContext = '';
          } else {
            const docText = await extractTextFromDocument(docBuffer, messageType, traceId);
            
            if (docText) {
              // Check for truncation marker
              const truncationMatch = docText.match(/^\[DOC_TRUNCATED:(\d+):(\d+)\]\n\n/);
              let cleanDocText = docText;
              
              if (truncationMatch) {
                const totalPages = truncationMatch[1];
                const processedPages = truncationMatch[2];
                cleanDocText = docText.replace(/^\[DOC_TRUNCATED:\d+:\d+\]\n\n/, '');
                largeDocWarning = `📄 This document has ${totalPages} pages. I've processed the first ${processedPages} pages for now. What would you like to know? (summary, key points, specific section, etc.)`;
                console.log(`[${traceId}] 🔔 Setting large doc warning for user`);
              }
              
              // Extract real filename from Content-Disposition or use file extension mapping
              let filename = 'document';
              const contentDisposition = docResponse.headers.get('Content-Disposition');
              if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                  filename = filenameMatch[1].replace(/['"]/g, '');
                }
              }
              
              // Fallback: generate filename based on mime type
              if (filename === 'document') {
                const extensions: Record<string, string> = {
                  'application/pdf': 'pdf',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                  'application/msword': 'doc',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                  'application/vnd.ms-excel': 'xls',
                  'text/plain': 'txt'
                };
                const ext = extensions[messageType] || 'file';
                filename = `document_${Date.now()}.${ext}`;
              }
              
              console.log(`[${traceId}] Extracted filename: ${filename}`);
              
              // 🚨 TEXT LIMIT: Truncate to 200K chars for DB safety
              const TEXT_LIMIT = 200000;
              const finalDocText = cleanDocText.length > TEXT_LIMIT 
                ? cleanDocText.substring(0, TEXT_LIMIT) + '\n\n[Text truncated due to size]'
                : cleanDocText;
              
              if (cleanDocText.length > TEXT_LIMIT) {
                console.warn(`[${traceId}] ⚠️ Text truncated: ${cleanDocText.length} → ${TEXT_LIMIT} chars`);
              }
              
              const { data: docData, error: docInsertError } = await supabase.from('user_documents').insert({
                user_id: userId,
                filename: filename,
                mime_type: messageType,
                content_text: finalDocText
              }).select().single();
              
              if (docInsertError) {
                console.error(`[${traceId}] ❌ DB insert error:`, docInsertError);
                largeDocWarning = '⚠️ I saved your document but ran into an issue storing the full content. Try asking about a specific section.';
              } else if (docData) {
                console.log(`[${traceId}] Document saved: ${filename}`);
                
                // Store document context in session_state for follow-up queries
                // CRITICAL FIX: Use service role key to bypass RLS and ensure data persists
                try {
                  // First, try to get existing session
                  const { data: existingSession, error: selectError } = await supabase
                    .from('session_state')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle();

                  console.log(`[${traceId}] Existing session:`, existingSession ? 'found' : 'not found', selectError ? `error: ${selectError.message}` : '');

                  if (existingSession) {
                    // Update existing session WITH last_doc JSON object
                    const { error: updateError } = await supabase
                      .from('session_state')
                      .update({
                        last_uploaded_doc_id: docData?.id,
                        last_uploaded_doc_name: filename,
                        last_upload_ts: new Date().toISOString(),
                        last_doc: {
                          id: docData?.id,
                          title: filename,
                          uploaded_at: new Date().toISOString()
                        },
                        last_doc_summary: null, // Clear previous summary
                        updated_at: new Date().toISOString()
                      })
                      .eq('user_id', userId);

                    if (updateError) {
                      console.error(`[${traceId}] ⚠️ Session state update failed:`, updateError);
                    } else {
                      console.log(`[${traceId}] ✅ Session state UPDATED: doc_id=${docData?.id}, name=${filename}`);
                    }
                  } else {
                    // Insert new session WITH last_doc JSON object
                    const { error: insertError } = await supabase
                      .from('session_state')
                      .insert({
                        user_id: userId,
                        last_uploaded_doc_id: docData?.id,
                        last_uploaded_doc_name: filename,
                        last_upload_ts: new Date().toISOString(),
                        last_doc: {
                          id: docData?.id,
                          title: filename,
                          uploaded_at: new Date().toISOString()
                        },
                        last_doc_summary: null, // Clear previous summary
                        updated_at: new Date().toISOString()
                      });

                    if (insertError) {
                      console.error(`[${traceId}] ⚠️ Session state insert failed:`, insertError);
                    } else {
                      console.log(`[${traceId}] ✅ Session state INSERTED: doc_id=${docData?.id}, name=${filename}`);
                    }
                  }
                } catch (sessionError) {
                  console.error(`[${traceId}] ⚠️ Session state operation failed:`, sessionError);
                }
                
                // If user asked to summarize or analyze the document, continue processing
                // Otherwise, send confirmation and STILL allow message processing to continue
                const docKeywords = ['summarize', 'summary', 'what does', 'tell me about', 'read', 'analyze', 'extract'];
                const hasDocRequest = body && docKeywords.some(kw => body.toLowerCase().includes(kw));
                
                if (!body || !hasDocRequest) {
                  // No text message or no specific doc request - just confirm upload
                  const baseConfirmation = `📄 Got it! I've saved your document "${filename}".`;
                  const confirmReply = largeDocWarning 
                    ? `${baseConfirmation}\n\n${largeDocWarning}`
                    : `${baseConfirmation} What would you like to know about it?`;
                  
                  await supabase.functions.invoke('send-whatsapp', {
                    body: { userId, message: confirmReply, traceId }
                  });
                  
                  // Store confirmation in recent_actions
                  await supabase.from('session_state').upsert({
                    user_id: userId,
                    recent_actions: [{
                      action: 'document_uploaded',
                      details: `Uploaded ${filename}`,
                      timestamp: new Date().toISOString()
                    }],
                    updated_at: new Date().toISOString()
                  });
                  
                  console.log(`[${traceId}] Document saved, confirmation sent, session updated`);
                  return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  });
                }
                
                // User wants to process the document - enrich message context
                documentContext = `[SYSTEM: User just uploaded document "${filename}" (${messageType}). Document ID: ${docData?.id}. It has been saved and is ready for querying.]`;
                messageBody = body ? `${documentContext}\n\nUser: ${body}` : documentContext;
                console.log(`[${traceId}] Continuing with document context: ${messageBody.substring(0, 100)}...`);
              }
            }
          }
        }
      } catch (docError) {
        console.error(`[${traceId}] Document processing error:`, docError);
        const errorReply = largeDocWarning || "Sorry, I had trouble processing that document. Could you try uploading it again?";
        await supabase.functions.invoke('send-whatsapp', {
          body: { userId, message: errorReply, traceId }
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (mediaUrl && messageType.startsWith('audio/')) {
      console.log(`[${traceId}] Transcribing audio from URL: ${mediaUrl}`);
      const transcribeResult = await supabase.functions.invoke('transcribe-audio', {
        body: { audioUrl: mediaUrl }
      });
      
      console.log(`[${traceId}] Transcribe result:`, JSON.stringify(transcribeResult));
      
      if (transcribeResult.error) {
        console.error(`[${traceId}] Transcription error:`, transcribeResult.error);
        const errorReply = "Sorry, I couldn't transcribe your voice message. Please try sending it again or send a text message instead.";
        await supabase.functions.invoke('send-whatsapp', {
          body: { userId, message: errorReply, traceId }
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (transcribeResult.data?.text) {
        messageBody = transcribeResult.data.text;
        console.log(`[${traceId}] Transcription successful: ${messageBody.substring(0, 100)}...`);
      } else {
        console.error(`[${traceId}] No transcription text in result`);
        const errorReply = "Sorry, I couldn't understand your voice message. Please try again.";
        await supabase.functions.invoke('send-whatsapp', {
          body: { userId, message: errorReply, traceId }
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Phase 3: Translate to English if needed (for reasoning)
    if (languageInfo.language !== 'en' && messageBody) {
      console.log(`[${traceId}] Translating to English for reasoning...`);
      const translateResult = await supabase.functions.invoke('translate', {
        body: { 
          text: messageBody, 
          sourceLanguage: languageInfo.language,
          targetLanguage: 'en',
          traceId 
        }
      });

      if (translateResult.data?.translated) {
        translatedBody = translateResult.data.translated;
        console.log(`[${traceId}] Translated: "${messageBody}" -> "${translatedBody}"`);
      } else {
        translatedBody = messageBody;
      }
    } else {
      translatedBody = messageBody;
    }

    // Store incoming message
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        dir: 'in',
        body: messageBody,
        media_url: mediaUrl,
        provider_sid: providerSid,
      });

    if (msgError) {
      console.error(`[${traceId}] Message insert error:`, msgError);
    }

    // Get conversation history (last 10 messages)
    const { data: historyData } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (historyData || []).reverse(); // Oldest first

    // Get session state
    const { data: sessionStateData } = await supabase
      .from('session_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    let sessionState = sessionStateData || null;

    // Calculate current date/time in IST for context
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const currentDateTime = istTime.toISOString();
    const currentDate = istTime.toISOString().split('T')[0];
    console.log(`[${traceId}] Current IST date/time: ${currentDateTime} (${currentDate})`);

    // Phase 1: Lightweight intent classification
    console.log(`[${traceId}] Classifying intent...`);
    const classificationResult = await supabase.functions.invoke('route-intent', {
      body: { 
        userMessage: translatedBody,
        recentMessages: conversationHistory,
        sessionState: sessionState,
        lastDoc: sessionState?.last_doc,
        traceId: traceId
      }
    });

    let replyText = '';
    
    // Email verb override is now handled in route-intent as highest priority
    // This is a safety net in case route-intent misses it
    const msgLower = translatedBody.toLowerCase();
    const emailVerbs = [
      'email ', 'mail ', 'send an email', 'write an email', 'draft an email',
      'send a email', 'write a email', 'draft a email',
      'message him', 'message her', 'message them',
      'tell him', 'tell her', 'tell them',
      'inform him', 'inform her', 'inform them',
      'ping him', 'ping her', 'ping them',
      'reply to', 'respond to'
    ];
    
    const hasEmailVerb = emailVerbs.some(verb => msgLower.includes(verb));
    if (hasEmailVerb && classificationResult.data?.intent_type !== 'email_action') {
      console.log(`[${traceId}] 🔧 SAFETY NET: Email verb detected but route-intent missed it, forcing email_action`);
      classificationResult.data.intent_type = 'email_action';
      classificationResult.data.confidence = 0.98;
    }

    // Handle classification result
    if (classificationResult.error || !classificationResult.data) {
      console.error(`[${traceId}] Classification error:`, classificationResult.error);
      // Fallback to direct AI agent (orchestrator)
      console.log(`[${traceId}] Falling back to AI agent orchestrator...`);
      const agentResult = await supabase.functions.invoke('ai-agent', {
        body: { 
          userMessage: translatedBody,
          history: conversationHistory,
          sessionState: sessionState,
          userId: userId,
          traceId: traceId,
          nowISO: new Date().toISOString()
        }
      });
      
      console.log(`[${traceId}] ✅ AI agent response received`);
      replyText = agentResult.data?.message || "I'm having trouble processing that right now. Could you try rephrasing?";
      
      // Store the updated summary if returned
      if (agentResult.data?.updatedSummary) {
        await supabase.from('session_state').upsert({
          user_id: userId,
          last_doc_summary: agentResult.data.updatedSummary,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        console.log(`[${traceId}] Updated last_doc_summary in session_state`);
      }
    } else {
      const classification = classificationResult.data;
      console.log(`[${traceId}] Classification: ${classification.intent_type} (confidence: ${classification.confidence})`);

      // Handle different classifications
      if (classification.intent_type === 'confirmation_yes' && sessionState?.confirmation_pending) {
        // User confirmed a pending action
        console.log(`[${traceId}] User confirmed pending action:`, sessionState.confirmation_pending);
        
        // Send typing indicator for action execution
        await supabase.functions.invoke('send-typing-indicator', {
          body: { userId, traceId }
        });

        // Execute the confirmed action via ai-agent with forcedIntent
        const agentResult = await supabase.functions.invoke('ai-agent', {
          body: { 
            userMessage: translatedBody,
            history: conversationHistory,
            sessionState: sessionState,
            userId: userId,
            forcedIntent: sessionState.confirmation_pending,
            traceId: traceId,
            nowISO: new Date().toISOString()
          }
        });

        replyText = agentResult.data?.message || "Done!";
        
        // Store the updated summary if returned
        if (agentResult.data?.updatedSummary) {
          await supabase.from('session_state').upsert({
            user_id: userId,
            last_doc_summary: agentResult.data.updatedSummary,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          console.log(`[${traceId}] Updated last_doc_summary in session_state`);
        }

        // Clear confirmation from session state
        await supabase.from('session_state').upsert({
          user_id: userId,
          confirmation_pending: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      } else if (classification.intent_type === 'confirmation_no' || 
                 translatedBody.toLowerCase().match(/\b(cancel|stop|forget|reset|clear|discard|abort|ignore|nevermind|never mind)\b/)) {
        // User cancelled a pending action or wants to reset
        console.log(`[${traceId}] User cancelled or reset conversation`);
        replyText = "Okay, cancelled. What would you like me to help with?";
        
        // Clear ALL session state to prevent stuck conversations
        await supabase.from('session_state').upsert({
          user_id: userId,
          confirmation_pending: null,
          pending_slots: null,
          current_topic: null,
          last_doc: null,
          last_doc_summary: null,
          contacts_search_results: null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      } else if (classification.intent_type === 'email_action') {
        // User wants to send/draft an email
        console.log(`[${traceId}] ✉️ Email action detected for: "${translatedBody.substring(0, 60)}..."`);
        
        // Send typing indicator
        await supabase.functions.invoke('send-typing-indicator', {
          body: { userId, traceId }
        });

        // Call ai-agent with email intent (bypass doc detection)
        console.log(`[${traceId}] Invoking ai-agent with email_action intent`);
        const agentResult = await supabase.functions.invoke('ai-agent', {
          body: { 
            userMessage: translatedBody,
            history: conversationHistory,
            sessionState: sessionState,
            userId: userId,
            traceId: traceId,
            nowISO: new Date().toISOString(),
            classifiedIntent: 'email_action'
          }
        });
        
        console.log(`[${traceId}] ✅ Email flow complete, got response`);
        replyText = agentResult.data?.message || "I'll help you with that email.";
        
      } else if (classification.intent_type === 'doc_action' && sessionState?.last_doc) {
        // User wants to act on the last uploaded document
        console.log(`[${traceId}] 📄 Doc action detected for: ${sessionState.last_doc.title}, query: "${translatedBody.substring(0, 60)}..."`);
        
        // Send typing indicator
        await supabase.functions.invoke('send-typing-indicator', {
          body: { userId, traceId }
        });

        // Call ai-agent with document context
        console.log(`[${traceId}] Invoking ai-agent with doc_action intent`);
        const agentResult = await supabase.functions.invoke('ai-agent', {
          body: { 
            userMessage: translatedBody,
            history: conversationHistory,
            sessionState: sessionState,
            userId: userId,
            traceId: traceId,
            nowISO: new Date().toISOString(),
            classifiedIntent: 'doc_action'
          }
        });

        console.log(`[${traceId}] ✅ Doc flow complete, got response`);
        replyText = agentResult.data?.message || "I've processed your document request.";
        
        // Store the updated summary if returned
        if (agentResult.data?.updatedSummary) {
          await supabase.from('session_state').upsert({
            user_id: userId,
            last_doc_summary: agentResult.data.updatedSummary,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          console.log(`[${traceId}] Updated last_doc_summary in session_state`);
        }

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
            history: conversationHistory,
            sessionState: sessionState,
            userId: userId,
            traceId: traceId,
            nowISO: new Date().toISOString(),
            classifiedIntent: 'greeting_smalltalk'
          }
        });

        console.log(`[${traceId}] ✅ Greeting flow complete, got response`);
        replyText = agentResult.data?.message || "Hi! How can I help you today?";
        
        // Store the updated summary if returned
        if (agentResult.data?.updatedSummary) {
          await supabase.from('session_state').upsert({
            user_id: userId,
            last_doc_summary: agentResult.data.updatedSummary,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          console.log(`[${traceId}] Updated last_doc_summary in session_state`);
        }

      } else {
        // Handoff to orchestrator for all other cases
        console.log(`[${traceId}] 🔄 Handing off to AI agent orchestrator (intent: ${classification.intent_type})...`);
        
        // Send typing indicator for complex queries
        if (classification.intent_type === 'handoff_to_orchestrator' && classification.confidence > 0.7) {
          await supabase.functions.invoke('send-typing-indicator', {
            body: { userId, traceId }
          });
        }

        const agentResult = await supabase.functions.invoke('ai-agent', {
          body: { 
            userMessage: translatedBody,
            history: conversationHistory,
            sessionState: sessionState,
            userId: userId,
            traceId: traceId,
            nowISO: new Date().toISOString(),
            classifiedIntent: classification.intent_type
          }
        });

        console.log(`[${traceId}] ✅ Orchestrator flow complete, got response`);
        replyText = agentResult.data?.message || "I'm here to help! What would you like me to do?";
        
        // Store the updated summary if returned (applies to all agent calls)
        if (agentResult.data?.updatedSummary) {
          await supabase.from('session_state').upsert({
            user_id: userId,
            last_doc_summary: agentResult.data.updatedSummary,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          console.log(`[${traceId}] Updated last_doc_summary in session_state`);
        }
      }
    }

    // Phase 3: Translate response back to user's language if needed
    if (languageInfo.language !== 'en' && replyText) {
      console.log(`[${traceId}] Translating response back to ${languageInfo.language}...`);
      const translateBackResult = await supabase.functions.invoke('translate', {
        body: { 
          text: replyText, 
          sourceLanguage: 'en',
          targetLanguage: languageInfo.language,
          traceId 
        }
      });

      if (translateBackResult.data?.translated) {
        replyText = translateBackResult.data.translated;
        console.log(`[${traceId}] Translated response back`);
      }
    }

    // Store conversation messages (store original user message, not translated)
    await supabase.from('conversation_messages').insert([
      { user_id: userId, role: 'user', content: messageBody },
      { user_id: userId, role: 'assistant', content: replyText }
    ]);

    // Send WhatsApp reply with traceId tracking
    console.log(`[${traceId}] 📤 Sending reply for THIS message (length: ${replyText.length} chars)...`);
    const sendResult = await supabase.functions.invoke('send-whatsapp', {
      body: { userId, message: replyText, traceId }
    });

    if (sendResult.error) {
      console.error(`[${traceId}] ❌ Failed to send reply:`, sendResult.error);
    } else {
      console.log(`[${traceId}] ✅ Reply sent successfully`);
    }

    // Trigger async self-reflection analysis (don't wait for it)
    supabase.functions.invoke('analyze-interaction', {
      body: {
        interactionId: traceId,
        userId: userId,
        userMessage: messageBody,
        aiResponse: replyText,
        toolsUsed: [],
        routingDecision: classificationResult.data?.intent_type || 'unknown',
        traceId: traceId
      }
    }).catch((err: any) => {
      console.error(`[${traceId}] Failed to trigger analysis:`, err);
    });

    // Store outbound message
    await supabase.from('messages').insert({
      user_id: userId,
      dir: 'out',
      body: replyText,
    });

    // Log event
    await supabase.from('logs').insert({
      user_id: userId,
      type: 'webhook',
      payload: { 
        routingDecision: classificationResult.data?.intent_type || 'unknown',
        intent: classificationResult.data?.intent_type,
        languageDetected: languageInfo.language,
        traceId 
      },
      trace_id: traceId,
    });

    console.log(`[${traceId}] ✅ Webhook processing complete for THIS message`);
    console.log(`[${traceId}] Summary: ${classificationResult.data?.intent_type || 'unknown'} → "${replyText.substring(0, 80)}..."`);
    
    return new Response(JSON.stringify({ success: true, traceId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

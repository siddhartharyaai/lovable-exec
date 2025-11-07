import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use Lovable AI to extract text from PDF via vision
async function extractTextFromDocument(buffer: ArrayBuffer, mimeType: string, traceId: string): Promise<string> {
  try {
    console.log(`[${traceId}] Extracting text from ${mimeType} document...`);
    
    // For PDFs, use Lovable AI with vision to extract text
    if (mimeType === 'application/pdf') {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        console.error(`[${traceId}] LOVABLE_API_KEY not configured`);
        return '';
      }
      
      // Convert buffer to base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      
      // Use Lovable AI to extract text via vision
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                  text: 'Extract ALL text content from this PDF document. Return only the extracted text, no commentary or formatting.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4000
        }),
      });
      
      if (!aiResponse.ok) {
        console.error(`[${traceId}] AI extraction failed: ${aiResponse.status}`);
        return '';
      }
      
      const aiData = await aiResponse.json();
      const extractedText = aiData.choices[0].message.content;
      console.log(`[${traceId}] Successfully extracted ${extractedText.length} characters via AI`);
      return extractedText.substring(0, 50000);
    }
    
    // Fallback: basic text decoding for other document types
    const decoder = new TextDecoder('utf-8');
    let text = decoder.decode(buffer);
    text = text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.substring(0, 50000);
  } catch (error) {
    console.error(`[${traceId}] Text extraction error:`, error);
    return '';
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
    if (mediaUrl && (messageType === 'application/pdf' || 
                      messageType === 'application/msword' || 
                      messageType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
      console.log(`[${traceId}] Document detected: ${messageType}`);
      
      try {
        // Download document
        const docResponse = await fetch(mediaUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`)
          }
        });

        if (docResponse.ok) {
          const docBuffer = await docResponse.arrayBuffer();
          const docText = await extractTextFromDocument(docBuffer, messageType, traceId);
          
          if (docText) {
            // Store document in database
            const filename = mediaUrl.split('/').pop() || 'uploaded_document';
            const { data: docData } = await supabase.from('user_documents').insert({
              user_id: userId,
              filename: filename,
              mime_type: messageType,
              content_text: docText
            }).select().single();

            console.log(`[${traceId}] Document saved: ${filename}`);
            
            // If user asked to summarize or analyze the document, continue processing
            // Otherwise, send confirmation and continue with message if there is one
            const docKeywords = ['summarize', 'summary', 'what does', 'tell me about', 'read', 'analyze', 'extract'];
            const hasDocRequest = body && docKeywords.some(kw => body.toLowerCase().includes(kw));
            
            if (!body || !hasDocRequest) {
              // No text message or no specific doc request - just confirm upload
              const confirmReply = `📄 Got it! I've saved your document "${filename}". What would you like to know about it?`;
              await supabase.functions.invoke('send-whatsapp', {
                body: { userId, message: confirmReply, traceId }
              });
              
              return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            
            // User wants to process the document - enrich message context
            documentContext = `[SYSTEM: User just uploaded document "${filename}" (${messageType}). It has been saved and is ready for querying.]`;
            messageBody = body ? `${documentContext}\n\nUser: ${body}` : documentContext;
            console.log(`[${traceId}] Continuing with document context: ${messageBody.substring(0, 100)}...`);
          }
        }
      } catch (docError) {
        console.error(`[${traceId}] Document processing error:`, docError);
        const errorReply = "Sorry, I had trouble processing that document. Could you try uploading it again?";
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

    const sessionState = sessionStateData || null;

    // Calculate current date/time in IST for context
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const currentDateTime = istTime.toISOString();
    const currentDate = istTime.toISOString().split('T')[0];
    
    console.log(`[${traceId}] Current IST date/time: ${currentDateTime} (${currentDate})`);

    // Phase 1: Route intent (decide ASK/ACT/ANSWER)
    console.log(`[${traceId}] Routing intent...`);
    const routingResult = await supabase.functions.invoke('route-intent', {
      body: { 
        message: translatedBody,
        userId: userId,
        conversationHistory: conversationHistory,
        sessionState: sessionState,
        currentDateTime: currentDateTime,
        currentDate: currentDate,
        traceId: traceId
      }
    });

    let replyText = '';

    // Handle routing decision
    if (routingResult.error || !routingResult.data) {
      console.error(`[${traceId}] Routing error:`, routingResult.error);
      // Fallback to direct AI agent
      console.log(`[${traceId}] Falling back to AI agent...`);
      const agentResult = await supabase.functions.invoke('ai-agent', {
        body: { 
          message: translatedBody,
          userId: userId,
          conversationHistory: conversationHistory,
          traceId: traceId
        }
      });

      replyText = agentResult.data?.message || "I'm having trouble processing that right now. Could you try rephrasing?";
    } else {
      const routing = routingResult.data;
      console.log(`[${traceId}] Routing decision: ${routing.decision}`, routing);

      if (routing.decision === 'ASK') {
        // Phase 2: Need clarification
        replyText = routing.clarify_question;
        if (routing.clarify_options && routing.clarify_options.length > 0) {
          replyText += `\n\nOptions: ${routing.clarify_options.join(', ')}`;
        }

        // Phase 4: Check if confirmation needed
        if (routing.requires_confirmation) {
          await supabase.from('session_state').upsert({
            user_id: userId,
            confirmation_pending: routing.primary_intent,
            updated_at: new Date().toISOString()
          });
          replyText += '\n\nReply YES to confirm or NO to cancel.';
        }

      } else if (routing.decision === 'ACT') {
        // Check for red-flag actions requiring confirmation
        const RED_FLAG_ACTIONS = ['delete_calendar_event', 'delete_task', 'mark_all_emails_read'];
        const needsConfirmation = routing.primary_intent && 
          RED_FLAG_ACTIONS.includes(routing.primary_intent.intent) &&
          !sessionState?.confirmation_pending;

        if (needsConfirmation) {
          // Phase 4: Store pending action and ask for confirmation
          await supabase.from('session_state').upsert({
            user_id: userId,
            confirmation_pending: {
              action: routing.primary_intent.intent,
              params: routing.primary_intent.slots,
              asked_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          });

          // Generate confirmation message
          const action = routing.primary_intent.intent;
          if (action === 'delete_calendar_event') {
            const person = routing.primary_intent.slots.person;
            const date = routing.primary_intent.slots.date;
            replyText = `Delete your meeting${person ? ` with ${person}` : ''}${date ? ` on ${date}` : ''}?\n\nReply YES to confirm or NO to cancel.`;
          } else if (action === 'delete_task') {
            replyText = `Delete the task "${routing.primary_intent.slots.task_identifier}"?\n\nReply YES to confirm or NO to cancel.`;
          } else {
            replyText = `Confirm this action?\n\nReply YES to proceed or NO to cancel.`;
          }

        } else if (sessionState?.confirmation_pending) {
          // User is responding to confirmation - case-insensitive and natural language
          const userResponse = translatedBody.toLowerCase().trim();
          
          // Check for confirmation keywords (case-insensitive, fuzzy matching)
          const confirmKeywords = ['yes', 'y', 'yeah', 'yup', 'sure', 'ok', 'okay', 'confirm', 'go ahead', 'proceed', 'do it', 'go', 'affirmative'];
          const denyKeywords = ['no', 'n', 'nope', 'nah', 'cancel', 'stop', 'dont', "don't", 'negative'];
          
          // Also check if message contains the action confirmation (e.g., "mark read", "delete")
          const actionConfirmations: Record<string, string[]> = {
            'gmail_mark_read': ['mark read', 'mark as read', 'mark them read', 'read all'],
            'delete_calendar_event': ['delete', 'remove', 'cancel'],
            'delete_task': ['delete', 'remove']
          };
          
          const pendingAction = sessionState.confirmation_pending?.intent;
          const actionPhrases = actionConfirmations[pendingAction] || [];
          const containsActionPhrase = actionPhrases.some(phrase => userResponse.includes(phrase));
          
          const isConfirmed = confirmKeywords.some(keyword => userResponse.includes(keyword)) || containsActionPhrase;
          const isDenied = denyKeywords.some(keyword => userResponse.includes(keyword));

          if (isConfirmed) {
            // Execute the pending action
            console.log(`[${traceId}] Executing confirmed action...`);
            
            // Phase 6: Check if we need typing indicator (estimated latency)
            const estimatedLatency = 3000; // Assume 3s for most actions
            if (estimatedLatency > 2500) {
              await supabase.functions.invoke('send-typing-indicator', {
                body: { userId, traceId }
              });
            }

            const agentResult = await supabase.functions.invoke('ai-agent', {
              body: { 
                message: translatedBody,
                userId: userId,
                conversationHistory: conversationHistory,
                forcedIntent: sessionState.confirmation_pending,
                traceId: traceId
              }
            });

            replyText = agentResult.data?.message || "Done!";

            // Clear confirmation
            await supabase.from('session_state').delete().eq('user_id', userId);

          } else if (isDenied) {
            replyText = "Okay, cancelled.";
            await supabase.from('session_state').delete().eq('user_id', userId);
          } else {
            replyText = "Please reply YES to confirm or NO to cancel.";
          }

        } else {
          // Execute action directly
          console.log(`[${traceId}] Executing action...`);

          // Phase 6: Estimate latency and send typing indicator if needed
          const toolsEstimate: Record<string, number> = {
            web_search: 5000,
            email_search: 3000,
            calendar_read: 2000,
            default: 2000
          };
          const estimatedLatency = toolsEstimate[routing.primary_intent?.intent] || toolsEstimate.default;
          
          if (estimatedLatency > 2500) {
            await supabase.functions.invoke('send-typing-indicator', {
              body: { userId, traceId }
            });
          }

          const agentResult = await supabase.functions.invoke('ai-agent', {
            body: { 
              message: translatedBody,
              userId: userId,
              conversationHistory: conversationHistory,
              routedIntent: routing.primary_intent,
              traceId: traceId
            }
          });

          replyText = agentResult.data?.message || "Done!";
        }

      } else if (routing.decision === 'ANSWER') {
        // Simple conversational response
        console.log(`[${traceId}] Conversational response...`);
        const agentResult = await supabase.functions.invoke('ai-agent', {
          body: { 
            message: translatedBody,
            userId: userId,
            conversationHistory: conversationHistory,
            isConversational: true,
            traceId: traceId
          }
        });

        replyText = agentResult.data?.message || "I'm here to help!";
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

    // Send WhatsApp reply
    console.log(`[${traceId}] Sending reply...`);
    const sendResult = await supabase.functions.invoke('send-whatsapp', {
      body: { userId, message: replyText, traceId }
    });

    if (sendResult.error) {
      console.error(`[${traceId}] Failed to send reply:`, sendResult.error);
    }

    // Trigger async self-reflection analysis (don't wait for it)
    supabase.functions.invoke('analyze-interaction', {
      body: {
        interactionId: traceId,
        userId: userId,
        userMessage: messageBody,
        aiResponse: replyText,
        toolsUsed: routingResult.data?.primary_intent ? [routingResult.data.primary_intent.intent] : [],
        routingDecision: routingResult.data?.decision,
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
        routingDecision: routingResult.data?.decision,
        intent: routingResult.data?.primary_intent?.intent,
        languageDetected: languageInfo.language,
        traceId 
      },
      trace_id: traceId,
    });

    console.log(`[${traceId}] Webhook processing complete`);
    
    return new Response(JSON.stringify({ success: true }), {
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Handle audio transcription
    let messageBody = body;
    if (mediaUrl && messageType.startsWith('audio/')) {
      console.log(`[${traceId}] Transcribing audio from URL: ${mediaUrl}`);
      const transcribeResult = await supabase.functions.invoke('transcribe-audio', {
        body: { audioUrl: mediaUrl }
      });
      
      console.log(`[${traceId}] Transcribe result:`, JSON.stringify(transcribeResult));
      
      if (transcribeResult.error) {
        console.error(`[${traceId}] Transcription error:`, transcribeResult.error);
        // Return error message to user
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

    // Parse intent first
    console.log(`[${traceId}] Parsing intent...`);
    const intentResult = await supabase.functions.invoke('parse-intent', {
      body: { 
        text: messageBody,
        userId: userId,
        traceId: traceId
      }
    });

    const intent = intentResult.data;
    console.log(`[${traceId}] Intent:`, intent?.type);

    // Store incoming message with parsed intent
    const { error: msgError } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        dir: 'in',
        body: messageBody,
        media_url: mediaUrl,
        provider_sid: providerSid,
        parsed_intent: intent,
      });

    if (msgError) {
      console.error(`[${traceId}] Message insert error:`, msgError);
    }

    // Route to handler based on intent
    let replyText = '';
    
    switch (intent?.type) {
      case 'reminder_create':
        const reminderResult = await supabase.functions.invoke('handle-reminder', {
          body: { intent, userId, traceId }
        });
        if (reminderResult.error) {
          replyText = '⚠️ Failed to create reminder. Please try again.';
          console.error(`[${traceId}] Reminder error:`, reminderResult.error);
        } else {
          replyText = reminderResult.data?.message || '⏰ Reminder set!';
        }
        break;
        
      case 'gcal_create_event':
        const calResult = await supabase.functions.invoke('handle-calendar', {
          body: { intent, userId, traceId, action: 'create' }
        });
        if (calResult.error) {
          replyText = '⚠️ ' + (calResult.data?.message || 'Failed to create calendar event. Make sure your Google account is connected.');
          console.error(`[${traceId}] Calendar error:`, calResult.error);
        } else {
          replyText = calResult.data?.message || '📅 Event created!';
        }
        break;
        
      case 'gcal_read_events':
        const readResult = await supabase.functions.invoke('handle-calendar', {
          body: { intent, userId, traceId, action: 'read' }
        });
        if (readResult.error) {
          replyText = '⚠️ ' + (readResult.data?.message || 'Failed to read calendar events. Make sure your Google account is connected.');
          console.error(`[${traceId}] Calendar read error:`, readResult.error);
        } else {
          replyText = readResult.data?.message || '📅 Here are your events...';
        }
        break;
      
      case 'gcal_update_event':
        const updateResult = await supabase.functions.invoke('handle-calendar', {
          body: { intent, userId, traceId, action: 'update' }
        });
        if (updateResult.error) {
          replyText = '⚠️ ' + (updateResult.data?.message || 'Failed to update calendar event. Make sure your Google account is connected.');
          console.error(`[${traceId}] Calendar update error:`, updateResult.error);
        } else {
          replyText = updateResult.data?.message || '📅 Event updated!';
        }
        break;
      
      case 'gcal_delete_event':
        const deleteResult = await supabase.functions.invoke('handle-calendar', {
          body: { intent, userId, traceId, action: 'delete' }
        });
        if (deleteResult.error) {
          replyText = '⚠️ ' + (deleteResult.data?.message || 'Failed to delete calendar event. Make sure your Google account is connected.');
          console.error(`[${traceId}] Calendar delete error:`, deleteResult.error);
        } else {
          replyText = deleteResult.data?.message || '🗑️ Event deleted!';
        }
        break;
        
      case 'gmail_summarize_unread':
      case 'gmail_mark_read':
      case 'gmail_send':
      case 'gmail_reply':
        const gmailResult = await supabase.functions.invoke('handle-gmail', {
          body: { intent, userId, traceId }
        });
        if (gmailResult.error) {
          replyText = '⚠️ ' + (gmailResult.data?.message || 'Failed to process email request. Make sure your Google account is connected.');
          console.error(`[${traceId}] Gmail error:`, gmailResult.error);
        } else {
          replyText = gmailResult.data?.message || '📧 Email action completed!';
        }
        break;
        
      case 'gtask_create_task':
        const createTaskResult = await supabase.functions.invoke('handle-tasks', {
          body: { intent, userId, traceId, action: 'create' }
        });
        if (createTaskResult.error) {
          replyText = '⚠️ ' + (createTaskResult.data?.message || 'Failed to create task. Make sure your Google account is connected.');
          console.error(`[${traceId}] Task create error:`, createTaskResult.error);
        } else {
          replyText = createTaskResult.data?.message || '✅ Task created!';
        }
        break;
        
      case 'gtask_read_tasks':
        const readTaskResult = await supabase.functions.invoke('handle-tasks', {
          body: { intent, userId, traceId, action: 'read' }
        });
        if (readTaskResult.error) {
          replyText = '⚠️ ' + (readTaskResult.data?.message || 'Failed to read tasks. Make sure your Google account is connected.');
          console.error(`[${traceId}] Task read error:`, readTaskResult.error);
        } else {
          replyText = readTaskResult.data?.message || '📋 Here are your tasks...';
        }
        break;
        
      case 'web_search':
        const searchResult = await supabase.functions.invoke('handle-search', {
          body: { intent, traceId }
        });
        if (searchResult.error) {
          replyText = '⚠️ Failed to search. Please try again.';
          console.error(`[${traceId}] Search error:`, searchResult.error);
        } else {
          replyText = searchResult.data?.message || '🔍 Search completed!';
        }
        break;
      
      case 'reminder_snooze':
        const snoozeResult = await supabase.functions.invoke('handle-reminder', {
          body: { intent, userId, traceId, action: 'snooze' }
        });
        if (snoozeResult.error) {
          replyText = '⚠️ Failed to snooze reminder. Please try again.';
          console.error(`[${traceId}] Snooze error:`, snoozeResult.error);
        } else {
          replyText = snoozeResult.data?.message || '⏰ Reminder snoozed!';
        }
        break;
      
      case 'gtask_complete_task':
        const completeTaskResult = await supabase.functions.invoke('handle-tasks', {
          body: { intent, userId, traceId, action: 'complete' }
        });
        if (completeTaskResult.error) {
          replyText = '⚠️ ' + (completeTaskResult.data?.message || 'Failed to complete task. Make sure your Google account is connected.');
          console.error(`[${traceId}] Task complete error:`, completeTaskResult.error);
        } else {
          replyText = completeTaskResult.data?.message || '✅ Task completed!';
        }
        break;
      
      case 'gcal_read_events_by_person':
        const readByPersonResult = await supabase.functions.invoke('handle-calendar', {
          body: { intent, userId, traceId, action: 'read_by_person' }
        });
        if (readByPersonResult.error) {
          replyText = '⚠️ ' + (readByPersonResult.data?.message || 'Failed to read calendar events. Make sure your Google account is connected.');
          console.error(`[${traceId}] Calendar read by person error:`, readByPersonResult.error);
        } else {
          replyText = readByPersonResult.data?.message || '📅 Here are your events...';
        }
        break;
      
      case 'contact_lookup':
        const contactResult = await supabase.functions.invoke('handle-contacts', {
          body: { intent, userId, traceId }
        });
        if (contactResult.error) {
          replyText = '⚠️ ' + (contactResult.data?.message || 'Failed to find contact. Make sure your Google account is connected.');
          console.error(`[${traceId}] Contact lookup error:`, contactResult.error);
        } else {
          replyText = contactResult.data?.message || '👤 Contact found!';
        }
        break;
        
      case 'email_approve':
      case 'email_cancel':
        const draftId = intent.entities?.draftId;
        if (!draftId) {
          replyText = '⚠️ Please specify which draft to approve/cancel (e.g., "send abc12345")';
          break;
        }

        // Find draft by ID prefix
        const { data: drafts, error: draftError } = await supabase
          .from('email_drafts')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .ilike('id', `${draftId}%`)
          .limit(1);

        if (draftError || !drafts || drafts.length === 0) {
          replyText = `❌ Draft "${draftId}" not found or already processed.`;
          break;
        }

        const draft = drafts[0];

        if (intent.type === 'email_cancel') {
          // Cancel draft
          await supabase
            .from('email_drafts')
            .update({ status: 'cancelled' })
            .eq('id', draft.id);

          replyText = '🗑️ Email draft cancelled.';
        } else {
          // Approve and send draft
          const sendResult = await supabase.functions.invoke('handle-gmail', {
            body: { 
              intent: { 
                type: draft.type === 'send' ? 'gmail_send_approved' : 'gmail_reply_approved',
                entities: {
                  draftId: draft.id,
                  to: draft.to_email,
                  subject: draft.subject,
                  body: draft.body,
                  messageId: draft.message_id
                }
              }, 
              userId, 
              traceId 
            }
          });

          if (sendResult.error) {
            replyText = '⚠️ Failed to send email. Please try again.';
            console.error(`[${traceId}] Email send error:`, sendResult.error);
          } else {
            replyText = sendResult.data?.message || '✅ Email sent successfully!';
          }
        }
        break;
        
      case 'fallback':
      default:
        // Use AI to answer general knowledge questions
        console.log(`[${traceId}] Fallback - using AI for general response`);
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        try {
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
                  role: 'system', 
                  content: 'You are a helpful AI assistant. Answer questions naturally and conversationally. For questions you can answer, provide helpful information. If asked about capabilities, mention you can help with reminders, calendar events, and email management via WhatsApp. Keep responses concise and friendly.' 
                },
                { role: 'user', content: messageBody }
              ],
              temperature: 0.7,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            replyText = aiData.choices[0].message.content;
          } else {
            replyText = "I'm here to help! I can set reminders, manage your calendar, and handle emails. What would you like me to do?";
          }
        } catch (aiError) {
          console.error(`[${traceId}] AI error:`, aiError);
          replyText = "I'm here to help! I can set reminders, manage your calendar, and handle emails. What would you like me to do?";
        }
        break;
    }

    // Send WhatsApp reply
    console.log(`[${traceId}] Sending reply...`);
    const sendResult = await supabase.functions.invoke('send-whatsapp', {
      body: { userId, message: replyText, traceId }
    });

    if (sendResult.error) {
      console.error(`[${traceId}] Failed to send reply:`, sendResult.error);
    }

    // Store outbound message
    await supabase.from('messages').insert({
      user_id: userId,
      dir: 'out',
      body: replyText,
      parsed_intent: intent,
    });

    // Log event
    await supabase.from('logs').insert({
      user_id: userId,
      type: 'webhook',
      payload: { intent: intent?.type, traceId },
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

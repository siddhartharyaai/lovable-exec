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

    // Use AI agent to process the message
    console.log(`[${traceId}] Calling AI agent...`);
    const agentResult = await supabase.functions.invoke('ai-agent', {
      body: { 
        message: messageBody,
        userId: userId,
        conversationHistory: conversationHistory,
        traceId: traceId
      }
    });

    let replyText = '';
    
    if (agentResult.error) {
      console.error(`[${traceId}] AI agent error:`, agentResult.error);
      replyText = "I'm having trouble processing that right now. Could you try rephrasing?";
    } else {
      replyText = agentResult.data?.message || "I understand, but I'm not sure how to help with that yet.";
      
      // Log which tools were used
      if (agentResult.data?.toolsUsed && agentResult.data.toolsUsed.length > 0) {
        console.log(`[${traceId}] Tools used:`, agentResult.data.toolsUsed);
      }
    }

    // Store conversation messages
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
        toolsUsed: agentResult.data?.toolsUsed || [], 
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let traceId = 'unknown';
  
  try {
    const body = await req.json();
    const { userId, message, mediaUrl, traceId: reqTraceId } = body;
    traceId = reqTraceId || traceId;
    
    console.log(`[${traceId}] ========== SEND-WHATSAPP START ==========`);
    console.log(`[${traceId}] Request body keys:`, Object.keys(body));
    console.log(`[${traceId}] Message length: ${message?.length || 0} chars`);
    
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWhatsAppNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    console.log(`[${traceId}] Twilio SID exists: ${!!twilioAccountSid}`);
    console.log(`[${traceId}] Twilio Token exists: ${!!twilioAuthToken}`);
    console.log(`[${traceId}] Twilio Number exists: ${!!twilioWhatsAppNumber}`);
    console.log(`[${traceId}] Twilio Number value: ${twilioWhatsAppNumber}`);

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
      console.error(`[${traceId}] FATAL: Twilio credentials missing!`);
      throw new Error('Twilio credentials not configured');
    }
    
    if (!userId || !message) {
      console.error(`[${traceId}] FATAL: Missing userId or message!`);
      throw new Error('userId and message are required');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user phone number
    console.log(`[${traceId}] Fetching user phone for userId: ${userId}`);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error(`[${traceId}] User fetch error:`, userError);
      throw new Error(`User fetch failed: ${userError.message}`);
    }
    
    if (!user || !user.phone) {
      console.error(`[${traceId}] User not found or phone missing`);
      throw new Error('User not found or phone number missing');
    }

    const toNumber = `whatsapp:${user.phone}`;
    // Ensure From number has whatsapp: prefix
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:') 
      ? twilioWhatsAppNumber 
      : `whatsapp:${twilioWhatsAppNumber}`;
    
    console.log(`[${traceId}] === TWILIO CALL DETAILS ===`);
    console.log(`[${traceId}] To: ${toNumber}`);
    console.log(`[${traceId}] From: ${fromNumber}`);
    console.log(`[${traceId}] Message length: ${message.length} chars`);
    console.log(`[${traceId}] Message preview: ${message.substring(0, 100)}...`);
    console.log(`[${traceId}] Twilio Account SID: ${twilioAccountSid.substring(0, 10)}...`);

    // Split long messages into multiple WhatsApp messages instead of truncating
    const MAX_LENGTH = 1500;
    const messages: string[] = [];
    
    if (message.length > MAX_LENGTH) {
      console.log(`[${traceId}] Message too long (${message.length} chars), splitting into chunks`);
      
      // Split on paragraph breaks first
      const paragraphs = message.split('\n\n');
      let currentChunk = '';
      
      for (const para of paragraphs) {
        if ((currentChunk + para).length > MAX_LENGTH) {
          if (currentChunk) messages.push(currentChunk.trim());
          currentChunk = para + '\n\n';
        } else {
          currentChunk += para + '\n\n';
        }
      }
      if (currentChunk) messages.push(currentChunk.trim());
    } else {
      messages.push(message);
    }

    // Send all message chunks with retry logic and delays
    let allMessageSids: string[] = [];
    
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
      const chunk = messages[messageIndex];
      
      // Add small delay between messages (except for first one)
      if (messageIndex > 0) {
        console.log(`[${traceId}] Waiting 800ms before sending chunk ${messageIndex + 1}/${messages.length}`);
        await sleep(800);
      }
      
      let attempt = 0;
      const maxAttempts = 3;
      let lastError;
      let chunkSent = false;

      while (attempt < maxAttempts && !chunkSent) {
        attempt++;
        
        try {
          console.log(`[${traceId}] Attempt ${attempt}/${maxAttempts} for chunk ${messageIndex + 1}`);
          
          const formData = new URLSearchParams();
          formData.append('To', toNumber);
          formData.append('From', fromNumber);
          formData.append('Body', chunk);
          if (mediaUrl && messageIndex === 0) { // Only attach media to first chunk
            formData.append('MediaUrl', mediaUrl);
            console.log(`[${traceId}] Attaching media: ${mediaUrl}`);
          }

          const authHeader = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          
          console.log(`[${traceId}] Making Twilio API call to: ${twilioUrl}`);
          console.log(`[${traceId}] FormData: To=${toNumber}, From=${fromNumber}, BodyLength=${chunk.length}`);
          
          const response = await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authHeader}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          console.log(`[${traceId}] Twilio response status: ${response.status}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${traceId}] === TWILIO API ERROR ===`);
            console.error(`[${traceId}] Chunk: ${messageIndex + 1}/${messages.length}`);
            console.error(`[${traceId}] Attempt: ${attempt}/${maxAttempts}`);
            console.error(`[${traceId}] HTTP Status: ${response.status}`);
            console.error(`[${traceId}] Error Body: ${errorText}`);
            console.error(`[${traceId}] Request To: ${toNumber}`);
            console.error(`[${traceId}] Request From: ${fromNumber}`);
            
            lastError = new Error(`Twilio API error: ${response.status} - ${errorText}`);
            
            if (attempt < maxAttempts) {
              const backoffMs = Math.pow(2, attempt) * 1000;
              console.log(`[${traceId}] Retrying in ${backoffMs}ms...`);
              await sleep(backoffMs);
              continue;
            }
            throw lastError;
          }

          const data = await response.json();
          allMessageSids.push(data.sid);
          chunkSent = true;
          console.log(`[${traceId}] ✅✅✅ SUCCESS! WhatsApp chunk ${messageIndex + 1}/${messages.length} sent!`);
          console.log(`[${traceId}] Message SID: ${data.sid}`);
          console.log(`[${traceId}] Twilio Status: ${data.status}`);

        } catch (error) {
          lastError = error;
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          const errStack = error instanceof Error ? error.stack : 'No stack';
          console.error(`[${traceId}] === CATCH BLOCK ERROR ===`);
          console.error(`[${traceId}] Error message: ${errMsg}`);
          console.error(`[${traceId}] Error stack: ${errStack}`);
          
          if (attempt < maxAttempts) {
            console.log(`[${traceId}] Will retry (${attempt}/${maxAttempts})...`);
            await sleep(Math.pow(2, attempt) * 1000);
          } else {
            console.error(`[${traceId}] Max attempts reached, giving up`);
          }
        }
      }
      
      if (!chunkSent) {
        throw lastError;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      messageSids: allMessageSids,
      chunksCount: messages.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack';
    
    console.error(`[${traceId}] ========== SEND-WHATSAPP FAILURE ==========`);
    console.error(`[${traceId}] Error: ${errorMessage}`);
    console.error(`[${traceId}] Stack: ${errorStack}`);
    console.error(`[${traceId}] ===============================================`);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage,
      traceId 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

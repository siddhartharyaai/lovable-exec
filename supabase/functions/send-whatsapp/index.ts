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

  try {
    const { userId, message, mediaUrl, traceId } = await req.json();
    
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWhatsAppNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user phone number
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('phone')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('User not found');
    }

    const toNumber = `whatsapp:${user.phone}`;
    // Ensure From number has whatsapp: prefix
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:') 
      ? twilioWhatsAppNumber 
      : `whatsapp:${twilioWhatsAppNumber}`;
    
    console.log(`[${traceId}] === SEND WHATSAPP DEBUG ===`);
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
          const formData = new URLSearchParams();
          formData.append('To', toNumber);
          formData.append('From', fromNumber);
          formData.append('Body', chunk);
          if (mediaUrl && messageIndex === 0) { // Only attach media to first chunk
            formData.append('MediaUrl', mediaUrl);
          }

          const authHeader = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
          const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: formData.toString(),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${traceId}] === TWILIO API ERROR (chunk ${messageIndex + 1}, attempt ${attempt}/${maxAttempts}) ===`);
            console.error(`[${traceId}] Status: ${response.status}`);
            console.error(`[${traceId}] Response: ${errorText}`);
            
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
          console.log(`[${traceId}] ✅ WhatsApp chunk ${messageIndex + 1}/${messages.length} sent! SID: ${data.sid}`);

        } catch (error) {
          lastError = error;
          if (attempt < maxAttempts) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.log(`[${traceId}] Retry ${attempt}/${maxAttempts} after error:`, errMsg);
            await sleep(Math.pow(2, attempt) * 1000);
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
    console.error('Error in send-whatsapp:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

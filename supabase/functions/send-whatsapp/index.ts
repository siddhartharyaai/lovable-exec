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
    console.log(`[${traceId}] Sending WhatsApp to ${toNumber} from ${fromNumber}`);

    // Truncate message if it exceeds WhatsApp limit (1600 characters)
    const MAX_LENGTH = 1550; // Leave some buffer
    let finalMessage = message;
    if (message.length > MAX_LENGTH) {
      console.log(`[${traceId}] Message too long (${message.length} chars), truncating to ${MAX_LENGTH}`);
      finalMessage = message.substring(0, MAX_LENGTH) + '\n\n...(message truncated)';
    }

    // Prepare Twilio API request with retry logic
    let attempt = 0;
    const maxAttempts = 3;
    let lastError;

    while (attempt < maxAttempts) {
      attempt++;
      
      try {
        const formData = new URLSearchParams();
        formData.append('To', toNumber);
        formData.append('From', fromNumber);
        formData.append('Body', finalMessage);
        if (mediaUrl) {
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
          console.error(`[${traceId}] Twilio error (attempt ${attempt}):`, response.status, errorText);
          lastError = new Error(`Twilio API error: ${response.status}`);
          
          if (attempt < maxAttempts) {
            await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
            continue;
          }
          throw lastError;
        }

        const data = await response.json();
        console.log(`[${traceId}] WhatsApp sent successfully, SID:`, data.sid);

        return new Response(JSON.stringify({ 
          success: true,
          messageSid: data.sid
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          console.log(`[${traceId}] Retry ${attempt}/${maxAttempts} after error:`, errMsg);
          await sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError;

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

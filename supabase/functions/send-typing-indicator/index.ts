import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] send-typing-indicator called`);

  try {
    const { userId, traceId: parentTraceId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN')!;
    const twilioWhatsAppNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER')!;

    // Get user phone
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('phone')
      .eq('id', userId)
      .single();

    if (userError || !userData?.phone) {
      console.error(`[${traceId}] User not found:`, userError);
      throw new Error('User not found');
    }

    const toNumber = `whatsapp:${userData.phone}`;
    const fromNumber = `whatsapp:${twilioWhatsAppNumber}`;

    console.log(`[${traceId}] Sending typing indicator to ${toNumber}`);

    // Send "..." as a temporary message
    // Note: WhatsApp doesn't support native typing indicators via Twilio
    // So we send a short message that we'll update or follow with the real response
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: toNumber,
        Body: '⏳ Working on it...',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${traceId}] Twilio error:`, response.status, errorText);
      throw new Error(`Twilio API error: ${response.status}`);
    }

    const result = await response.json();
    console.log(`[${traceId}] Typing indicator sent, SID: ${result.sid}`);

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error:`, error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

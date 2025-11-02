import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl } = await req.json();
    const deepgramApiKey = Deno.env.get('DEEPGRAM_API_KEY');
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    console.log('Transcribing audio from:', audioUrl);

    // Download audio file from Twilio (requires authentication)
    const authHeader = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'Authorization': `Basic ${authHeader}`
      }
    });
    
    if (!audioResponse.ok) {
      const errorText = await audioResponse.text();
      console.error('Failed to download audio:', audioResponse.status, errorText);
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Call Deepgram API with Nova 3 model for pre-recorded transcription
    const transcribeResponse = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/ogg',
      },
      body: audioBuffer,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('Deepgram API error:', transcribeResponse.status, errorText);
      throw new Error(`Deepgram API error: ${transcribeResponse.status}`);
    }

    const transcribeData = await transcribeResponse.json();
    const text = transcribeData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    console.log('Transcription result:', text);

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in transcribe-audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage,
      text: '' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

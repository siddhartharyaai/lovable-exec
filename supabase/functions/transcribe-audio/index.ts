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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    console.log('Transcribing audio from:', audioUrl);

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio');
    }

    const audioBlob = await audioResponse.blob();
    
    // Create form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Call Lovable AI Whisper endpoint
    const transcribeResponse = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: formData,
    });

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('Whisper API error:', transcribeResponse.status, errorText);
      throw new Error(`Whisper API error: ${transcribeResponse.status}`);
    }

    const transcribeData = await transcribeResponse.json();
    const text = transcribeData.text || '';

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

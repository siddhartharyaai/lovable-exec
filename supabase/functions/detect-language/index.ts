import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DETECTION_PROMPT = `Detect the language and transliteration style of the following text. Return JSON:

{
  "language": "en|hi|mixed",
  "script": "latin|devanagari|mixed",
  "transliteration": "none|hinglish|other",
  "confidence": 0.0-1.0
}

Examples:
Text: "Hello, how are you?"
Output: {"language": "en", "script": "latin", "transliteration": "none", "confidence": 0.98}

Text: "Kal 9 baje meeting hai"
Output: {"language": "mixed", "script": "latin", "transliteration": "hinglish", "confidence": 0.95}

Text: "कल 9 बजे मीटिंग है"
Output: {"language": "hi", "script": "devanagari", "transliteration": "none", "confidence": 0.97}

Text: "Meeting schedule kar do please"
Output: {"language": "mixed", "script": "latin", "transliteration": "hinglish", "confidence": 0.92}

Be fast and accurate. Return ONLY valid JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] detect-language called`);

  try {
    const { text, traceId: parentTraceId } = await req.json();
    
    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({
        language: 'en',
        script: 'latin',
        transliteration: 'none',
        confidence: 1.0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Quick heuristic check for common cases
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasLatin = /[a-zA-Z]/.test(text);
    const commonHinglishWords = ['kar', 'hai', 'kya', 'bhi', 'aur', 'kal', 'aaj', 'abhi', 'baad', 'pehle'];
    const hasHinglishPattern = commonHinglishWords.some(word => 
      text.toLowerCase().includes(word)
    );

    // Fast path for obvious cases
    if (hasDevanagari && !hasLatin) {
      return new Response(JSON.stringify({
        language: 'hi',
        script: 'devanagari',
        transliteration: 'none',
        confidence: 0.95
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!hasDevanagari && !hasHinglishPattern && hasLatin) {
      return new Response(JSON.stringify({
        language: 'en',
        script: 'latin',
        transliteration: 'none',
        confidence: 0.90
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use AI for complex cases
    console.log(`[${traceId}] Using AI for language detection`);
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: DETECTION_PROMPT },
          { role: 'user', content: `Text: ${text}` }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      console.error(`[${traceId}] AI gateway error:`, aiResponse.status);
      // Fallback
      return new Response(JSON.stringify({
        language: 'en',
        script: 'latin',
        transliteration: 'none',
        confidence: 0.5
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const detection = JSON.parse(aiData.choices[0].message.content);

    console.log(`[${traceId}] Detection result:`, JSON.stringify(detection));

    return new Response(JSON.stringify(detection), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error:`, error);
    
    return new Response(JSON.stringify({
      language: 'en',
      script: 'latin',
      transliteration: 'none',
      confidence: 0.5,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

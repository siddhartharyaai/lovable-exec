import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRANSLATION_PROMPT = `Translate the text to the target language while PRESERVING named entities (names, dates, numbers, places).

Return JSON:
{
  "translated": "translated text",
  "preserved_entities": ["entity1", "entity2"],
  "confidence": 0.0-1.0
}

CRITICAL RULES:
1. DO NOT translate names (e.g., "Rohan" stays "Rohan")
2. DO NOT translate numbers (e.g., "9" stays "9", "30" stays "30")
3. DO NOT translate dates (e.g., "tomorrow" can be translated, but "October 28" stays "October 28")
4. Preserve technical terms (e.g., "email", "meeting", "calendar")
5. Be natural and conversational in the target language

Examples:

Input: {"text": "Schedule meeting with Rohan tomorrow at 9 AM", "target": "hi"}
Output: {"translated": "Rohan के साथ कल सुबह 9 बजे meeting schedule करें", "preserved_entities": ["Rohan", "9 AM"], "confidence": 0.95}

Input: {"text": "Kal Rohan ke saath 30 minute ka meeting set karo", "target": "en"}
Output: {"translated": "Set a 30 minute meeting with Rohan tomorrow", "preserved_entities": ["Rohan", "30"], "confidence": 0.93}

Input: {"text": "Send email to Priya about the Q4 report", "target": "hi"}
Output: {"translated": "Priya को Q4 report के बारे में email भेजें", "preserved_entities": ["Priya", "Q4"], "confidence": 0.94}

Be accurate and fast. Return ONLY valid JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] translate called`);

  try {
    const { text, sourceLanguage, targetLanguage, traceId: parentTraceId } = await req.json();
    
    // If same language, return as is
    if (sourceLanguage === targetLanguage || targetLanguage === 'en' && sourceLanguage === 'en') {
      return new Response(JSON.stringify({
        translated: text,
        preserved_entities: [],
        confidence: 1.0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    console.log(`[${traceId}] Translating from ${sourceLanguage} to ${targetLanguage}`);

    // Extract potential entities before translation
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const numberPattern = /\b\d+(?:\.\d+)?\b/g;
    const datePattern = /\b(?:tomorrow|today|yesterday|next\s+\w+|last\s+\w+)\b/gi;
    
    const potentialNames = text.match(namePattern) || [];
    const numbers = text.match(numberPattern) || [];
    const dates = text.match(datePattern) || [];

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: TRANSLATION_PROMPT },
          { 
            role: 'user', 
            content: `Translate from ${sourceLanguage} to ${targetLanguage}:\n\nText: "${text}"\n\nPotential entities to preserve: ${JSON.stringify([...potentialNames, ...numbers, ...dates])}` 
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      console.error(`[${traceId}] AI gateway error:`, aiResponse.status);
      // Fallback: return original
      return new Response(JSON.stringify({
        translated: text,
        preserved_entities: [],
        confidence: 0.5,
        error: 'Translation failed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const translation = JSON.parse(aiData.choices[0].message.content);

    console.log(`[${traceId}] Translation result:`, JSON.stringify(translation));

    return new Response(JSON.stringify(translation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error:`, error);
    
    return new Response(JSON.stringify({
      translated: '',
      preserved_entities: [],
      confidence: 0.5,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

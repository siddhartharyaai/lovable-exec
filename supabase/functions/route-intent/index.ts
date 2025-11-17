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

  try {
    const { userMessage, recentMessages, sessionState, lastDoc, traceId } = await req.json();
    
    console.log(`[${traceId}] 🔍 Lightweight intent classification for: "${userMessage.substring(0, 80)}..."`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    // Build classification prompt
    const systemPrompt = `You are a LIGHTWEIGHT INTENT CLASSIFIER for a WhatsApp executive assistant.

You are called BEFORE the main Orchestrator Agent to cheaply detect simple patterns.

INPUT:
- user_message: latest user text
- recent_messages: a few recent turns
- session_state: may include confirmation_pending and pending_slots
- last_doc: most recent uploaded document

YOUR JOB:
- Classify the message into a simple intent category
- You DO NOT perform planning or tool orchestration
- You DO NOT talk to external APIs
- Just help decide: Is this YES/NO? Doc action? Simple pattern? Or handoff?

POSSIBLE INTENT TYPES:
- "email_action": ANY message containing email verbs (ABSOLUTE HIGHEST PRIORITY)
- "confirmation_yes": yes / yup / okay send / do it / go ahead / confirmed / sure / absolutely / please do (NEVER "hi" or "hello")
- "confirmation_no": no / don't / cancel / stop / never mind / nope / not now
- "doc_action": user asking to act on last_doc ("summarize this", "clean this up", "extract tasks", "what does this say")
- "simple_reminder": "remind me to X at Y"
- "greeting_smalltalk": hi / hello / hey / how are you / thanks / thank you / good morning / who are you / what can you do (NEVER treated as confirmation)
- "handoff_to_orchestrator": anything non-trivial (DEFAULT for most queries)

CRITICAL: Greetings ("hi", "hello", "hey", "who are you") are NEVER confirmations. They are ALWAYS "greeting_smalltalk".

CRITICAL RULE #1 - EMAIL VERBS (ABSOLUTE HIGHEST PRIORITY - OVERRIDES EVERYTHING):
- If the message contains ANY of these email verbs, classify as "email_action" with confidence 0.98:
  * "email " / "mail " / "send an email" / "write an email" / "draft an email"
  * "send a email" / "write a email" / "draft a email"
  * "message him" / "message her" / "message them"
  * "tell him" / "tell her" / "tell them" (in email context)
  * "inform him" / "inform her" / "inform them"
  * "ping him" / "ping her" / "ping them"
  * "reply to" / "respond to" (email context)
- EMAIL VERBS ALWAYS WIN, even if:
  * last_doc exists
  * message mentions "document" or "this" or "it"
  * message could be interpreted as doc_action
- Example: "Email Rohan and tell him the document is approved" → email_action (0.98), NOT doc_action
- Example: "Write to Sarah about this contract" → email_action (0.98), NOT doc_action

CRITICAL RULE #2 - DOC ACTION (SECOND PRIORITY, ONLY IF NO EMAIL VERBS):
- ONLY if no email verbs present AND last_doc exists, these phrases are doc_action:
  * "summarize this" / "summarise this" / "summarize it" / "summarise it"
  * "what does this say" / "what's this say" / "what is this"
  * "give me the summary" / "give me a summary" / "what's the summary"
  * "extract tasks" / "extract action items" / "get tasks from this"
  * "clean this up" / "clean it up"
  * "tell me about this" / "tell me about it" / "what's in this" / "what's in it"
  * ANY variation of these phrases (case-insensitive)
- Default confidence for doc_action when last_doc exists: 0.95
- BUT: If email verbs present, doc_action is NEVER chosen

EXAMPLES OF EMAIL ACTION (ALWAYS HIGHEST PRIORITY):
- "Email Rohan and tell him the document is approved" → email_action (0.98) - NOT doc_action!
- "Write to Sarah about this contract" → email_action (0.98) - NOT doc_action!
- "Send an email to John" → email_action (0.98)
- "Message her about the meeting" → email_action (0.98)
- "Ping Mike and ask about status" → email_action (0.98)

EXAMPLES OF DOC ACTION (ONLY WHEN NO EMAIL VERBS):
- "Summarize this" → doc_action (0.95)
- "Clean this up" → doc_action (0.9)
- "Extract tasks from this" → doc_action (0.95)
- "What does this contract say about liability?" → doc_action (0.9)
- "Give me the summary" → doc_action (0.9)

FOR confirmation_yes/no (ONLY if confirmation_pending exists):
- Detect explicit replies like: yes, yup, okay send, do it, go ahead, confirmed, sure
- OR: no, don't, cancel, stop, never mind

RESPONSE FORMAT (JSON):
{
  "intent_type": "<one of the types above>",
  "confidence": 0.0 to 1.0,
  "reason": "short explanation"
}

If unsure:
- intent_type: "handoff_to_orchestrator"
- confidence: around 0.5
- reason: explaining ambiguity

CRITICAL: Default to "handoff_to_orchestrator" for anything that requires actual reasoning or tool use.`;

    // Build context summary
    const contextSummary = `
User Message: "${userMessage}"

Recent Context (last 2 turns):
${recentMessages ? JSON.stringify(recentMessages.slice(-4), null, 2) : 'None'}

Session State:
- confirmation_pending: ${sessionState?.confirmation_pending ? 'YES (action awaiting confirmation: ' + sessionState.confirmation_pending.action + ')' : 'NO'}
- pending_slots: ${sessionState?.pending_slots ? 'YES (collecting: ' + JSON.stringify(sessionState.pending_slots) + ')' : 'NO'}
- last_doc: ${lastDoc ? `"${lastDoc.title}" (uploaded ${lastDoc.uploaded_at})` : 'None'}

Classify this message into one of the intent types.`;

    // Call Lovable AI for classification
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextSummary }
        ],
        temperature: 0.1,
        max_tokens: 150,
        tools: [{
          type: "function",
          function: {
            name: "classify_intent",
            description: "Classify the user's intent into a simple category",
            parameters: {
              type: "object",
              properties: {
                intent_type: {
                  type: "string",
                  enum: ["confirmation_yes", "confirmation_no", "doc_action", "simple_reminder", "greeting_smalltalk", "handoff_to_orchestrator"]
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string", maxLength: 100 }
              },
              required: ["intent_type", "confidence", "reason"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "classify_intent" } }
      }),
    });

    if (!response.ok) {
      console.error(`[${traceId}] ❌ AI classification failed: ${response.status}`);
      throw new Error('AI classification failed');
    }

    const data = await response.json();
    const toolCall = data.choices[0].message.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const classification = JSON.parse(toolCall.function.arguments);

    console.log(`[${traceId}] 📊 Classification: ${classification.intent_type} (confidence: ${classification.confidence}) - ${classification.reason}`);

    return new Response(JSON.stringify({
      ...classification,
      traceId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Route-intent error:', error);
    // Default to handoff on error
    return new Response(JSON.stringify({
      intent_type: 'handoff_to_orchestrator',
      confidence: 0.5,
      reason: 'Classification failed, handing off to orchestrator'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

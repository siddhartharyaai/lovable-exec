import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Intent schemas with critical/optional slots and clarification templates
const INTENT_SCHEMAS: Record<string, any> = {
  schedule_meeting: {
    critical: ["person", "date"],
    optional: ["duration", "time"],
    defaults: { duration: 30 },
    clarify_templates: {
      duration: { question: "30 or 45 minutes?", options: ["30", "45"] },
      person: { question: "Who is the meeting with?", options: [] },
      date: { question: "Which day?", options: [] }
    }
  },
  delete_calendar_event: {
    critical: ["date"],
    optional: ["person", "event_title"],
    clarify_templates: {
      date: { question: "Which day is the event?", options: [] },
      person: { question: "Who is the meeting with?", options: [] }
    }
  },
  update_calendar_event: {
    critical: ["date"],
    optional: ["person", "event_title", "new_date", "new_time"],
    clarify_templates: {
      date: { question: "Which day is the current event?", options: [] },
      person: { question: "Who is the meeting with?", options: [] }
    }
  },
  email_search: {
    critical: ["query"],
    optional: ["person", "date_range"],
    clarify_templates: {
      query: { question: "What should I search for in your emails?", options: [] }
    }
  },
  email_draft: {
    critical: ["recipient", "purpose"],
    optional: ["tone", "length"],
    clarify_templates: {
      recipient: { question: "Who should I send this to?", options: [] },
      tone: { question: "What tone? Formal, friendly, or direct?", options: ["formal", "friendly", "direct"] }
    }
  },
  task_create: {
    critical: ["title"],
    optional: ["due_date", "priority"],
    clarify_templates: {
      title: { question: "What's the task?", options: [] }
    }
  },
  task_complete: {
    critical: ["task_identifier"],
    optional: [],
    clarify_templates: {
      task_identifier: { question: "Which task should I mark as complete?", options: [] }
    }
  },
  task_delete: {
    critical: ["task_identifier"],
    optional: [],
    clarify_templates: {
      task_identifier: { question: "Which task should I delete?", options: [] }
    }
  },
  web_search: {
    critical: ["query"],
    optional: ["search_type"],
    clarify_templates: {
      query: { question: "What should I search for?", options: [] }
    }
  },
  reminder_create: {
    critical: ["text", "due_time"],
    optional: [],
    clarify_templates: {
      text: { question: "What should I remind you about?", options: [] },
      due_time: { question: "When?", options: [] }
    }
  }
};

const ROUTER_SYSTEM_PROMPT = `You are a fast intent classifier for an executive assistant. Analyze the user's message and output JSON with this exact structure:

{
  "decision": "ASK|ACT|ANSWER",
  "confidence": 0.0-1.0,
  "primary_intent": {
    "intent": "intent_name",
    "slots": {"slot_name": "extracted_value"},
    "confidence": 0.0-1.0
  },
  "secondary_intent": {
    "intent": "intent_name",
    "slots": {"slot_name": "extracted_value"},
    "confidence": 0.0-1.0
  },
  "missing_critical_slots": ["slot1", "slot2"],
  "clarify_question": "one pointed question",
  "clarify_options": ["option1", "option2"]
}

DECISION RULES:
- ASK: If critical slots are missing OR confidence < 0.75 OR gap between primary and secondary < 0.15
- ACT: If all critical slots present AND confidence > 0.75 AND clear winner
- ANSWER: If conversational (greetings, thanks, questions about capabilities)

SLOT EXTRACTION DISCIPLINE:
- ALWAYS extract person, date, time as SEPARATE fields
- person: Just the name (e.g., "Rohan", NOT "appointment with Rohan")
- date: Normalized (e.g., "tomorrow" → calculate date, "next week" → date range)
- duration: Number in minutes (e.g., "30", "45")
- event_title: ONLY if user mentions specific title (NOT generic words like "appointment", "meeting", "call")

INTENT DETECTION:
- schedule_meeting: "set meeting", "schedule call", "book time with"
- delete_calendar_event: "delete meeting", "cancel appointment", "remove event"
- update_calendar_event: "move meeting", "reschedule", "change time"
- email_search: "find email", "search inbox", "show emails from"
- email_draft: "send email", "draft email", "write to"
- task_create: "add task", "create todo", "remind me to"
- task_complete: "mark done", "complete task", "finish"
- task_delete: "delete task", "remove todo"
- web_search: "search for", "what is", "find information about"
- reminder_create: "remind me", "set reminder"

EXAMPLES:

User: "Delete the appointment with Rohan tomorrow"
Output: {
  "decision": "ACT",
  "confidence": 0.92,
  "primary_intent": {
    "intent": "delete_calendar_event",
    "slots": {"person": "Rohan", "date": "2025-11-03"},
    "confidence": 0.92
  },
  "secondary_intent": null,
  "missing_critical_slots": [],
  "clarify_question": null,
  "clarify_options": null
}

User: "Set meeting with Rohan next week"
Output: {
  "decision": "ASK",
  "confidence": 0.85,
  "primary_intent": {
    "intent": "schedule_meeting",
    "slots": {"person": "Rohan", "date": "next_week"},
    "confidence": 0.85
  },
  "secondary_intent": null,
  "missing_critical_slots": ["duration"],
  "clarify_question": "30 or 45 minutes?",
  "clarify_options": ["30", "45"]
}

User: "Thanks, that helps!"
Output: {
  "decision": "ANSWER",
  "confidence": 0.98,
  "primary_intent": null,
  "secondary_intent": null,
  "missing_critical_slots": [],
  "clarify_question": null,
  "clarify_options": null
}

Be precise and fast. Output ONLY valid JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] route-intent called`);

  try {
    const { message, userId, conversationHistory, sessionState, traceId: parentTraceId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[${traceId}] Processing: "${message.substring(0, 100)}..."`);

    // Build conversation context
    const messages = [
      { role: 'system', content: ROUTER_SYSTEM_PROMPT },
      ...(conversationHistory || []).slice(-5).map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Add session context if exists
    if (sessionState?.pending_intent) {
      messages.splice(1, 0, {
        role: 'system',
        content: `CONTEXT: User has pending intent: ${JSON.stringify(sessionState.pending_intent)}. The current message may be filling missing slots: ${sessionState.waiting_for?.join(', ')}`
      });
    }

    // Call Lovable AI for routing
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      console.error(`[${traceId}] AI gateway error:`, aiResponse.status);
      throw new Error('AI gateway failed');
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices[0].message.content;
    
    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    
    const routingResult = JSON.parse(content);

    console.log(`[${traceId}] Routing result:`, JSON.stringify(routingResult, null, 2));

    // Validate and enrich routing result
    if (routingResult.decision === 'ACT' && routingResult.primary_intent) {
      const intent = routingResult.primary_intent.intent;
      const schema = INTENT_SCHEMAS[intent];
      
      if (schema) {
        // Check for missing critical slots
        const missingSlots = schema.critical.filter(
          (slot: string) => !routingResult.primary_intent.slots[slot]
        );

        if (missingSlots.length > 0) {
          // Override to ASK
          routingResult.decision = 'ASK';
          routingResult.missing_critical_slots = missingSlots;
          
          // Generate clarification from template
          const firstMissing = missingSlots[0];
          const template = schema.clarify_templates[firstMissing];
          if (template) {
            routingResult.clarify_question = template.question;
            routingResult.clarify_options = template.options;
          }
        }
      }
    }

    // Update session state if needed
    if (routingResult.decision === 'ASK' && routingResult.missing_critical_slots?.length > 0) {
      await supabase.from('session_state').upsert({
        user_id: userId,
        pending_intent: routingResult.primary_intent,
        waiting_for: routingResult.missing_critical_slots,
        clarify_sent_at: new Date().toISOString(),
        context: { original_message: message, conversation_history: conversationHistory?.slice(-3) },
        updated_at: new Date().toISOString()
      });
    } else if (routingResult.decision === 'ACT') {
      // Clear session state
      await supabase.from('session_state').delete().eq('user_id', userId);
    }

    return new Response(JSON.stringify(routingResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error:`, error);
    
    // Fallback response
    return new Response(JSON.stringify({
      decision: 'ANSWER',
      confidence: 0.5,
      primary_intent: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
  task_read: {
    critical: [],
    optional: [],
    clarify_templates: {}
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

const ROUTER_SYSTEM_PROMPT = `You are a fast intent classifier for an executive assistant. Your job is to analyze the user's message and extract structured information about their intent.

CRITICAL: You MUST extract slots from the user's message. Always populate the slots object with any information you find.

SLOT EXTRACTION RULES (MANDATORY):
1. Person names: Extract ONLY the name itself
   - "meeting with Rohan" → person: "Rohan"
   - "appointment with Sarah" → person: "Sarah"
   - "call with John tomorrow" → person: "John"

2. Dates: Convert relative dates to ISO format (YYYY-MM-DD)
   - "tomorrow" → "2025-11-03"
   - "today" → "2025-11-02"
   - "next Monday" → calculate the date
   - "November 5th" → "2025-11-05"

3. Event titles: Extract ONLY if user provides a SPECIFIC custom title
   - "project review meeting" → event_title: "project review meeting"
   - "standup" → event_title: "standup"
   - Generic words like "meeting", "appointment", "call" → DO NOT extract as event_title

4. Times: Extract and convert to 24-hour format
   - "3pm" → time: "15:00"
   - "at 2:30" → time: "14:30"

INTENT DETECTION:
- delete_calendar_event: "delete", "cancel", "remove" + calendar/meeting/appointment
- schedule_meeting: "schedule", "set", "book" + meeting/call/time
- update_calendar_event: "move", "reschedule", "change time"
- email_search: "find email", "search inbox"
- email_draft: "send email", "draft email"
- task_read: "what tasks", "show tasks", "my tasks", "to do list", "pending tasks", "what's on my list"
- task_create: "add task", "create todo"
- task_complete: "mark done", "complete task"
- task_delete: "delete task"
- web_search: "search for", "what is", "find information"
- reminder_create: "remind me", "set reminder"

EXAMPLES:
Message: "delete my meeting with Rohan tomorrow"
→ slots: { person: "Rohan", date: "2025-11-03" }

Message: "cancel the standup on Friday"
→ slots: { event_title: "standup", date: "2025-11-07" }

Message: "remove tomorrow's appointment with Sarah"
→ slots: { person: "Sarah", date: "2025-11-03" }

DECISION LOGIC:
- ACT: All critical slots present
  - delete_calendar_event needs: date AND (person OR event_title)
- ASK: Missing critical slots OR confidence < 0.75
- ANSWER: Conversational (greetings, thanks, questions)

Current date: ${new Date().toISOString().split('T')[0]}`;

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

    // Define tool for structured output with explicit slot fields
    const routingTool = {
      type: "function",
      function: {
        name: "classify_intent",
        description: "Classify user intent and extract ALL slots from the message. You MUST populate the slots object with any relevant information.",
        parameters: {
          type: "object",
          properties: {
            decision: {
              type: "string",
              enum: ["ASK", "ACT", "ANSWER"],
              description: "ASK if slots missing, ACT if ready, ANSWER if conversational"
            },
            confidence: {
              type: "number",
              description: "Confidence score 0.0-1.0"
            },
            intent: {
              type: "string",
              description: "Intent name (delete_calendar_event, schedule_meeting, etc.)"
            },
            slots: {
              type: "object",
              description: "MANDATORY: Extract and populate ALL relevant slots",
              properties: {
                person: {
                  type: "string",
                  description: "Person's name if mentioned (e.g., 'Rohan', 'Sarah')"
                },
                date: {
                  type: "string",
                  description: "Date in YYYY-MM-DD format (convert relative dates like 'tomorrow')"
                },
                event_title: {
                  type: "string",
                  description: "Specific event title if provided (not generic words like 'meeting')"
                },
                time: {
                  type: "string",
                  description: "Time in HH:MM format"
                },
                duration: {
                  type: "number",
                  description: "Duration in minutes"
                },
                new_date: {
                  type: "string",
                  description: "New date for rescheduling in YYYY-MM-DD format"
                },
                new_time: {
                  type: "string",
                  description: "New time for rescheduling in HH:MM format"
                },
                query: {
                  type: "string",
                  description: "Search query or text"
                },
                recipient: {
                  type: "string",
                  description: "Email recipient"
                },
                title: {
                  type: "string",
                  description: "Task title"
                },
                task_identifier: {
                  type: "string",
                  description: "Task identifier"
                },
                text: {
                  type: "string",
                  description: "Reminder text"
                },
                due_time: {
                  type: "string",
                  description: "Due time for reminder"
                }
              }
            },
            missing_critical_slots: {
              type: "array",
              items: { type: "string" },
              description: "List of missing required slots"
            },
            clarify_question: {
              type: "string",
              description: "Question to ask user if slots missing"
            },
            clarify_options: {
              type: "array",
              items: { type: "string" },
              description: "Options for user to choose from"
            }
          },
          required: ["decision", "confidence", "slots"]
        }
      }
    };

    // Call Lovable AI for routing with tool calling
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        tools: [routingTool],
        tool_choice: { type: "function", function: { name: "classify_intent" } },
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      console.error(`[${traceId}] AI gateway error:`, aiResponse.status);
      throw new Error('AI gateway failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0].message.tool_calls?.[0];
    
    if (!toolCall || !toolCall.function.arguments) {
      throw new Error('No tool call returned from AI');
    }

    const classificationResult = JSON.parse(toolCall.function.arguments);
    
    console.log(`[${traceId}] Classification result:`, JSON.stringify(classificationResult, null, 2));

    // Build routing result
    const routingResult: any = {
      decision: classificationResult.decision,
      confidence: classificationResult.confidence,
      primary_intent: classificationResult.intent ? {
        intent: classificationResult.intent,
        slots: classificationResult.slots || {},
        confidence: classificationResult.confidence
      } : null,
      secondary_intent: null,
      missing_critical_slots: classificationResult.missing_critical_slots || [],
      clarify_question: classificationResult.clarify_question || null,
      clarify_options: classificationResult.clarify_options || null
    };

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

        // Special validation for delete_calendar_event: needs date AND (person OR event_title)
        if (intent === 'delete_calendar_event') {
          const hasDate = routingResult.primary_intent.slots.date;
          const hasPerson = routingResult.primary_intent.slots.person;
          const hasTitle = routingResult.primary_intent.slots.event_title;
          
          if (!hasDate) {
            missingSlots.push('date');
          }
          if (!hasPerson && !hasTitle) {
            // Need at least one identifier
            routingResult.decision = 'ASK';
            routingResult.missing_critical_slots = ['person_or_title'];
            routingResult.clarify_question = "I need more details to find the event. Who is it with, or what's the event title?";
            routingResult.clarify_options = [];
          }
        }

        if (missingSlots.length > 0 && intent !== 'delete_calendar_event') {
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

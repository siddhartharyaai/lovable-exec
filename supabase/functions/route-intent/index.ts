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
  scrape_website: {
    critical: ["url"],
    optional: ["extract_schema"],
    clarify_templates: {
      url: { question: "Which website URL should I scrape?", options: [] }
    }
  },
  query_documents: {
    critical: [],
    optional: ["query", "document_name"],
    defaults: { query: "summarize" },
    clarify_templates: {},
    description: "Query or summarize a recently uploaded document. Use when user says 'summarize this', 'what's in this document', 'read this doc'. Document context is automatically detected from recent uploads."
  },
  search_drive: {
    critical: ["query"],
    optional: ["max_results"],
    clarify_templates: {
      query: { question: "What should I search for in your Google Drive?", options: [] }
    }
  },
  read_drive_document: {
    critical: ["file_id"],
    optional: ["file_name"],
    clarify_templates: {
      file_id: { question: "Which Drive file should I read?", options: [] }
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

// Calculate current date dynamically in IST timezone
function getCurrentDateIST(): { today: string; tomorrow: string; currentDateTime: string } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  const istTime = new Date(now.getTime() + istOffset);
  
  const today = istTime.toISOString().split('T')[0];
  
  const tomorrowDate = new Date(istTime.getTime() + 24 * 60 * 60 * 1000);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];
  
  const currentDateTime = istTime.toISOString();
  
  return { today, tomorrow, currentDateTime };
}

function buildRouterSystemPrompt(): string {
  const { today, tomorrow, currentDateTime } = getCurrentDateIST();
  
  return `You are the routing intelligence layer for Maria, an AI executive assistant. Your ONLY job is to classify user intent and extract structured information. You do NOT answer questions or engage in conversation - you only classify and extract data.

CRITICAL: DO NOT respond to identity questions like "who are you" or "what's your name". These should be classified as ANSWER decision so Maria (the main AI agent) can introduce herself properly.

CURRENT DATE/TIME CONTEXT:
- Current date: ${today}
- Current time (IST): ${currentDateTime}
- Tomorrow's date: ${tomorrow}
- Timezone: Asia/Kolkata (IST, UTC+5:30)

CRITICAL: You MUST extract slots from the user's message. Always populate the slots object with any information you find.

SLOT EXTRACTION RULES (MANDATORY):
1. Person names: Extract ONLY the name itself
   - "meeting with Rohan" → person: "Rohan"
   - "appointment with Sarah" → person: "Sarah"
   - "call with John tomorrow" → person: "John"

2. Dates: Convert relative dates to ISO format (YYYY-MM-DD) using CURRENT DATE CONTEXT
   - "tomorrow" → "${tomorrow}"
   - "today" → "${today}"
   - "next Monday" → calculate from ${today}
   - "November 6th" → "2025-11-06"
   - "06 Nov" → "2025-11-06"
   - "Nov 6 2025" → "2025-11-06"

3. Times: Extract and convert to 24-hour format
   - "3pm" → time: "15:00"
   - "7pm" → time: "19:00"
   - "at 2:30" → time: "14:30"
   - "tomorrow evening" → date: "${tomorrow}", time: "19:00"
   - "tomorrow morning" → date: "${tomorrow}", time: "09:00"

4. Event titles: Extract ONLY if user provides a SPECIFIC custom title
   - "project review meeting" → event_title: "project review meeting"
   - "standup" → event_title: "standup"
   - Generic words like "meeting", "appointment", "call" → DO NOT extract as event_title

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
- query_documents: "summarize this doc", "what's in this document", "tell me about this file", "summarize the document", "read this doc", "summarize this", "what does this say", "summarize it", "what's in it" (when user recently uploaded a document OR says "this")
- scrape_website: ONLY when explicit URL with http/https is provided AND NO recent document upload AND user wants to scrape/extract from a website. If user says "this" and there's a recent document, use query_documents NOT scrape_website!
- search_drive: "find in drive", "search my drive", "look for file", "what's in my drive"
- read_drive_document: When user provides Google Drive URL or file ID
- reminder_create: "remind me", "set reminder"

CONVERSATION CONTEXT AWARENESS (CRITICAL):
- Check conversation history for previously mentioned dates/times
- If user already provided "tomorrow" or a specific date in the last 2 messages, extract it from context
- Don't ask "When?" if the date was already mentioned

EXAMPLES:
Message: "delete my meeting with Rohan tomorrow"
→ slots: { person: "Rohan", date: "${tomorrow}" }

Message: "cancel the standup on Friday"
→ slots: { event_title: "standup", date: "[calculate Friday's date]" }

Message: "remove tomorrow's appointment with Sarah"
→ slots: { person: "Sarah", date: "${tomorrow}" }

Message: "Remind me to give Sudhir the form tomorrow"
→ slots: { text: "give Sudhir the form", due_time: "${tomorrow}T09:00:00+05:30" }

Message: "tomorrow" (when previous message was "Remind me to call John")
→ Check context, extract: { text: "call John", due_time: "${tomorrow}T09:00:00+05:30" }

DECISION LOGIC:
- ACT: All critical slots present AND high confidence
  - delete_calendar_event needs: date AND (person OR event_title)
  - reminder_create needs: text AND due_time
- ASK: Missing critical slots OR confidence < 0.75 OR ambiguous
- ANSWER: Conversational (greetings, thanks, identity questions, general chat)`;
}

const ROUTER_SYSTEM_PROMPT = buildRouterSystemPrompt();

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

    // Regenerate prompt with current date/time for each request
    const currentPrompt = buildRouterSystemPrompt();
    
    // Build conversation context with date awareness
    const messages = [
      { role: 'system', content: currentPrompt },
      ...(conversationHistory || []).slice(-5).map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // CRITICAL: Check for recently uploaded documents in database (not just session state)
    // This handles cases where session_state might be empty or stale
    const { data: recentDocs } = await supabase
      .from('user_documents')
      .select('id, filename, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recentDocs && recentDocs.length > 0) {
      const uploadTime = new Date(recentDocs[0].created_at);
      const now = new Date();
      const minutesSinceUpload = (now.getTime() - uploadTime.getTime()) / (1000 * 60);
      
      // Extended window: 2 hours instead of 30 minutes
      if (minutesSinceUpload < 120) {
        console.log(`[${traceId}] 🔴 RECENT DOCUMENT DETECTED: "${recentDocs[0].filename}" (${Math.round(minutesSinceUpload)} min ago)`);
        messages.splice(1, 0, {
          role: 'system',
          content: `🔴🔴🔴 CRITICAL DOCUMENT CONTEXT 🔴🔴🔴

The user uploaded a document "${recentDocs[0].filename}" ${Math.round(minutesSinceUpload)} minutes ago (ID: ${recentDocs[0].id}).

MANDATORY CLASSIFICATION RULES (NON-NEGOTIABLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IF the user's message contains ANY of these patterns, you MUST classify as "query_documents":
   ✓ "Summarize this document"
   ✓ "Summarize this"  
   ✓ "Summarize the document"
   ✓ "Show me the summary"
   ✓ "What's in this document"
   ✓ "What's in this"
   ✓ "What's in the document"
   ✓ "Read this doc"
   ✓ "Tell me about this file"
   ✓ "What does this say"
   ✓ "What does the document say"
   ✓ ANY phrase containing "this" OR "the document" referring to uploaded content

CRITICAL RULES:
1. DO NOT classify as "scrape_website" - document is ALREADY uploaded to database!
2. DO NOT ask for URL - we have the document stored!
3. DO NOT ask for document name - it's: "${recentDocs[0].filename}"
4. ALWAYS set intent to "query_documents" with slots: { "query": "summarize", "document_name": "${recentDocs[0].filename}" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        });
      }
    }

    // Add session context if exists
    if (sessionState?.pending_intent) {
      messages.splice(1, 0, {
        role: 'system',
        content: `CONTEXT: User has pending intent: ${JSON.stringify(sessionState.pending_intent)}. The current message may be filling missing slots: ${sessionState.waiting_for?.join(', ')}. Check if the user's current message provides these missing slots based on conversation context.`
      });
    }
    
    // Add conversation context awareness for slot filling
    if (conversationHistory && conversationHistory.length > 0) {
      const last5Messages = conversationHistory.slice(-5);
      const contextInfo = {
        dates: [] as string[],
        persons: [] as string[],
        pendingAction: null as string | null
      };
      
      // Extract context from recent messages
      for (const msg of last5Messages) {
        const content = msg.content.toLowerCase();
        
        // Extract dates mentioned (tomorrow, today, specific dates)
        if (/tomorrow|today|(\d{1,2}[/-]\d{1,2})|(\d{1,2}\s+\w+)|november|december|january/i.test(content)) {
          const match = content.match(/tomorrow|today|(\d{1,2}[/-]\d{1,2})|(\d{1,2}\s+\w+)|(november|december|january|february|march|april|may|june|july|august|september|october)/i);
          if (match) contextInfo.dates.push(match[0]);
        }
        
        // Extract person names (capitalized words)
        const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
        const names = msg.content.match(namePattern);
        if (names) contextInfo.persons.push(...names);
        
        // Check for pending actions
        if (/remind me|delete|cancel|schedule|search|find|show me/.test(content)) {
          contextInfo.pendingAction = msg.content;
        }
      }
      
      // Inject context as system message if we found relevant info
      if (contextInfo.dates.length || contextInfo.persons.length || contextInfo.pendingAction) {
        messages.splice(1, 0, {
          role: 'system',
          content: `CONVERSATION CONTEXT (use this to fill missing slots):
${contextInfo.dates.length ? `- Dates mentioned in recent messages: "${contextInfo.dates.join(', ')}"` : ''}
${contextInfo.persons.length ? `- Persons mentioned: "${[...new Set(contextInfo.persons)].slice(0, 3).join(', ')}"` : ''}
${contextInfo.pendingAction ? `- Pending action from previous message: "${contextInfo.pendingAction}"` : ''}

IMPORTANT: Use this context to extract slots. Don't ask for information already provided.`
        });
      }
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
                  description: "Search query or text. Also capture natural language time references like 'November', 'last week', 'in the last 3 days' from the user's message."
                },
                url: {
                  type: "string",
                  description: "URL to scrape (must include http:// or https://)"
                },
                extract_schema: {
                  type: "object",
                  description: "Optional JSON schema for structured extraction from scraped website"
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

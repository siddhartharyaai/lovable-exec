import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool definitions for the AI agent
// These tools represent the user's personal executive assistant capabilities
const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a WhatsApp native reminder that will be sent at a specific time. Use when user says 'remind me', 'don't forget', 'alert me', etc. Perfect for one-time notifications.",
      parameters: {
        type: "object",
        properties: {
          text: { 
            type: "string", 
            description: "What to remind the user about. Keep it concise and actionable (e.g., 'call mom', 'take medicine', 'meeting prep')" 
          },
          due_time: { 
            type: "string", 
            description: "When to send the reminder in ISO 8601 format with Asia/Kolkata timezone (YYYY-MM-DDTHH:mm:ss+05:30). Parse natural language carefully: 'tomorrow 7pm' = next day 19:00 IST, 'in 2 hours' = current time + 2 hours" 
          }
        },
        required: ["text", "due_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "snooze_reminder",
      description: "Snooze the most recent active reminder by a specified duration. Use when user says 'snooze', 'remind me later', 'ask me in X minutes/hours'.",
      parameters: {
        type: "object",
        properties: {
          duration_minutes: { 
            type: "number", 
            description: "How many minutes to snooze. Common values: 30 (30 min), 60 (1 hour), 120 (2 hours), 1440 (1 day)" 
          }
        },
        required: ["duration_minutes"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_calendar",
      description: "Read calendar events for a specific date or date range from Google Calendar. Use when user asks 'what's on my calendar', 'do I have meetings', 'am I free', 'what's my schedule'. This is for VIEWING events.",
      parameters: {
        type: "object",
        properties: {
          start_date: { 
            type: "string", 
            description: "Start date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss+05:30). For 'today' use current date at 00:00, for 'tomorrow' use next day at 00:00" 
          },
          end_date: { 
            type: "string", 
            description: "End date in ISO 8601 format. Optional - if not provided, defaults to same as start_date. For 'this week' use current date to 7 days ahead" 
          }
        },
        required: ["start_date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event in Google Calendar. Use when user wants to 'schedule', 'block time', 'set up a meeting', 'add to calendar'. Perfect for booking time slots.",
      parameters: {
        type: "object",
        properties: {
          title: { 
            type: "string", 
            description: "Event title. Make it clear and descriptive (e.g., 'Team Standup', 'Client Call with Acme Corp', 'Gym Session')" 
          },
          start_time: { 
            type: "string", 
            description: "Event start time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss+05:30). Parse carefully: 'tomorrow morning' = next day 09:00, 'tomorrow evening' = next day 19:00" 
          },
          duration_minutes: { 
            type: "number", 
            description: "Duration in minutes. Default 30 if not specified. Common values: 15, 30, 60, 90, 120" 
          },
          attendees: { 
            type: "array", 
            items: { type: "string" }, 
            description: "Array of email addresses of attendees. If user mentions a person by name, you may need to use lookup_contact first to get their email" 
          }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update/reschedule an existing calendar event. Use when user wants to 'change', 'move', 'reschedule', 'update' an event. CRITICAL: Extract 'person' and 'date' separately from generic words like 'appointment', 'meeting'.",
      parameters: {
        type: "object",
        properties: {
          event_title: { 
            type: "string", 
            description: "ONLY use if user mentions a SPECIFIC event name. DO NOT use generic words like 'appointment', 'meeting' - these are not event titles! Can be omitted if only person+date are known." 
          },
          new_start_time: { 
            type: "string", 
            description: "New start time in ISO 8601 format (YYYY-MM-DDTHH:mm:ss+05:30)" 
          },
          date: {
            type: "string",
            description: "Current date of the event to help locate it. Parse time references like 'tomorrow', 'today', 'Monday' to ISO 8601."
          },
          person: {
            type: "string",
            description: "Name of person associated with the event (extract ONLY the name). The system searches both titles and attendees."
          }
        },
        required: ["new_start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete a calendar event permanently. Use when user says 'cancel', 'delete', 'remove event'. CRITICAL: You MUST extract 'person' and 'date' separately from generic words like 'appointment', 'meeting'. Example: 'delete appointment with rohan tomorrow' -> person='Rohan', date='tomorrow parsed to ISO', event_title can be omitted or set to actual event name if known.",
      parameters: {
        type: "object",
        properties: {
          event_title: { 
            type: "string", 
            description: "ONLY use if user mentions a SPECIFIC event name (e.g., 'Weekly sync', 'Team standup'). DO NOT use generic words like 'appointment', 'meeting', 'call' - these are not event titles! Can be omitted if only person+date are known." 
          },
          date: {
            type: "string",
            description: "REQUIRED if user mentions any time reference ('tomorrow', 'today', 'next Monday', 'Nov 3'). Parse to ISO 8601 format. This is CRITICAL for finding the right event."
          },
          person: {
            type: "string",
            description: "REQUIRED if user mentions any person name ('with Rohan', 'Priya', etc.). Extract ONLY the person's name (e.g., 'Rohan', not 'with Rohan'). The system searches both titles and attendees."
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_calendar_by_person",
      description: "Find all calendar events with a specific person (by name or email). Use when user asks 'when am I meeting with X', 'what meetings do I have with Y', 'show me all events with Z'.",
      parameters: {
        type: "object",
        properties: {
          person_name: { 
            type: "string", 
            description: "Name or email of the person to search for in event attendees" 
          },
          start_date: { 
            type: "string", 
            description: "Start date for search in ISO 8601 format. Defaults to current week if not specified" 
          },
          end_date: { 
            type: "string", 
            description: "End date for search in ISO 8601 format. Optional" 
          }
        },
        required: ["person_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "summarize_emails",
      description: "Get an AI-powered summary of unread emails from Gmail Primary inbox. Use when user asks 'check my email', 'what's in my inbox', 'any new emails', 'email summary'. Focuses on the most important messages.",
      parameters: {
        type: "object",
        properties: {
          max_count: { 
            type: "number", 
            description: "Maximum number of emails to summarize (default 10, max 20). Use lower numbers for quick checks, higher for comprehensive reviews" 
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search for specific emails by sender name or email address, with optional time filtering. Use when user asks to 'find emails from X', 'show me messages from Y', 'pull up email from Z'. Can search both read and unread emails.",
      parameters: {
        type: "object",
        properties: {
          sender_name: { 
            type: "string", 
            description: "Name or email of the sender to search for. Can be partial match (e.g., 'Renu' will match 'Renu Choudhary' or emails containing 'renu')" 
          },
          days_back: { 
            type: "number", 
            description: "How many days back to search. Optional. Examples: 2 for 'last 2 days', 7 for 'last week', 30 for 'last month'" 
          },
          max_results: { 
            type: "number", 
            description: "Maximum number of emails to return (default 5, max 10)" 
          }
        },
        required: ["sender_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mark_emails_read",
      description: "Mark all unread emails as read (archive/clean inbox). Use when user says 'mark all as read', 'clear my inbox', 'clean up email'. IMPORTANT: This affects all unread emails, so confirm before executing.",
      parameters: {
        type: "object",
        properties: {
          scope: { 
            type: "string", 
            enum: ["all"], 
            description: "Currently only supports 'all' to mark all unread emails as read" 
          }
        },
        required: ["scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_email_draft",
      description: "Create an email draft for user approval before sending. Use when user wants to 'send email', 'reply to', 'draft a message'. IMPORTANT: Always create draft first for confirmation, never send directly.",
      parameters: {
        type: "object",
        properties: {
          to: { 
            type: "string", 
            description: "Recipient email address. If user mentions a person by name, use lookup_contact to get their email first" 
          },
          subject: { 
            type: "string", 
            description: "Email subject line. Keep it clear and professional" 
          },
          body: { 
            type: "string", 
            description: "Email body content. Use proper formatting, be professional but match user's tone" 
          },
          reply_to_message_id: { 
            type: "string", 
            description: "Gmail message ID if this is a reply to an existing email. Optional" 
          }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_tasks",
      description: "Get all pending tasks from Google Tasks. Use when user asks 'what tasks do I have', 'show my to-do list', 'what's on my plate', 'what do I need to do'.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task in Google Tasks. Use when user says 'add task', 'create to-do', 'remember to', 'put on my list'. Good for action items and to-dos.",
      parameters: {
        type: "object",
        properties: {
          title: { 
            type: "string", 
            description: "Task title. Keep it clear and actionable (e.g., 'Review Q4 budget', 'Call vendor', 'Submit expense report')" 
          },
          notes: { 
            type: "string", 
            description: "Additional notes or details about the task. Optional" 
          },
          due_date: { 
            type: "string", 
            description: "Due date in ISO 8601 format. Optional. Use when user specifies 'by Friday', 'due tomorrow', etc." 
          }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed in Google Tasks. Use when user says 'mark done', 'complete task', 'finished', 'check off'. The task remains in history but marked as completed.",
      parameters: {
        type: "object",
        properties: {
          task_title: { 
            type: "string", 
            description: "Title or partial title of task to complete. Be flexible with matching" 
          }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's title, notes, or due date. Use when user says 'change task', 'update to-do', 'modify task', 'edit task'.",
      parameters: {
        type: "object",
        properties: {
          task_title: { 
            type: "string", 
            description: "Current title or partial title of task to update" 
          },
          new_title: { 
            type: "string", 
            description: "New title for the task. Optional - only if user wants to change the title" 
          },
          new_notes: { 
            type: "string", 
            description: "New notes for the task. Optional" 
          },
          new_due_date: { 
            type: "string", 
            description: "New due date in ISO 8601 format. Optional" 
          }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task permanently from Google Tasks. Use when user says 'delete task', 'remove to-do', 'get rid of task'. IMPORTANT: This is permanent, so confirm before executing.",
      parameters: {
        type: "object",
        properties: {
          task_title: { 
            type: "string", 
            description: "Title or partial title of task to delete permanently" 
          }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for current information using SERP API or Firecrawl. CRITICAL: ALWAYS use this for real-time data, current events, live information that changes. Never try to answer from memory for time-sensitive queries.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "Search query. Be specific and include context (e.g., 'India vs Australia T20 cricket match score today November 2 2025' not just 'match score')" 
          },
          search_type: { 
            type: "string", 
            enum: ["general", "specific"],
            description: "Use 'general' for quick facts, news, weather, scores, stock prices. Use 'specific' for detailed research, in-depth information, comprehensive analysis" 
          }
        },
        required: ["query", "search_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lookup_contact",
      description: "Find contact information for a person from Google Contacts (email, phone, address). Use when you need someone's email to send them a message or invite them to an event, or when user asks 'what's X's email', 'find contact for Y'.",
      parameters: {
        type: "object",
        properties: {
          name: { 
            type: "string", 
            description: "Name or partial name to search for in contacts. Can also be an email address to get full contact details" 
          }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scrape_website",
      description: "Extract and analyze content from a specific URL using Firecrawl. Use when user wants to 'read this page', 'what's on this website', 'extract info from URL', 'analyze this article', 'scrape this site'. Perfect for getting detailed content from a single webpage.",
      parameters: {
        type: "object",
        properties: {
          url: { 
            type: "string", 
            description: "Full URL to scrape (must include http:// or https://). Examples: 'https://example.com/article', 'https://company.com/about'" 
          },
          extract_schema: { 
            type: "object", 
            description: "Optional: JSON schema for structured data extraction. Use when user wants specific fields extracted (e.g., product info, contact details, prices). Leave empty for general content summary." 
          }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_drive",
      description: "Search for files in Google Drive by name or content. Use when user wants to 'find my document', 'search drive', 'where is that file', 'locate the presentation'. Returns up to 10 most relevant files with names and links.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "Search query - can be file name, content keyword, or combination. Examples: 'Q4 budget', 'meeting notes', 'presentation slides'" 
          },
          max_results: { 
            type: "number", 
            description: "Maximum number of results to return. Default 10, max 50." 
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_documents",
      description: "Query the user's uploaded documents (PDFs, DOCs, DOCX) using natural language Q&A. Use when user asks about content in their uploaded documents. Performs keyword search and provides context-aware answers with citations.",
      parameters: {
        type: "object",
        properties: {
          query: { 
            type: "string", 
            description: "Natural language question about the documents. Examples: 'What was the revenue in Q3?', 'Find all mentions of project timeline', 'What are the key risks?'" 
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_drive_document",
      description: "Read and summarize a specific Google Drive document (Google Docs, Sheets, Slides) by file ID. Use after search_drive returns a file that the user wants to read/analyze. Extracts full content and provides AI summary.",
      parameters: {
        type: "object",
        properties: {
          file_id: {
            type: "string",
            description: "Google Drive file ID (from search_drive results)"
          },
          file_name: {
            type: "string",
            description: "Name of the file for reference"
          }
        },
        required: ["file_id", "file_name"]
      }
    }
  }
];

async function buildSystemPrompt(supabase: any, userId: string): Promise<string> {
  // Load learned patterns (compact - top 3 only)
  const { data: patterns } = await supabase
    .from('learned_patterns')
    .select('prompt_rule, frequency')
    .eq('is_active', true)
    .order('frequency', { ascending: false })
    .limit(3);

  // Load user preferences (compact - top 3 only)
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('preference_type, preference_value, confidence_score')
    .eq('user_id', userId)
    .gte('confidence_score', 0.6)
    .limit(3);

  // Calculate current date/time for IST
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const currentDateReadable = istTime.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTimeReadable = istTime.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  // Build compact learned patterns summary
  const patternsText = patterns && patterns.length > 0
    ? patterns.map((p: any) => `• ${p.prompt_rule}`).join('\n')
    : 'None yet';

  // Build compact preferences summary
  const prefsText = preferences && preferences.length > 0
    ? preferences.map((p: any) => `• ${p.preference_type}: ${JSON.stringify(p.preference_value)}`).join('\n')
    : 'None yet';

  return `You are the ORCHESTRATOR AGENT for Maria, a WhatsApp-based executive assistant.

ENVIRONMENT:
- Users talk on WhatsApp (voice notes, casual language, partial sentences)
- Timezone: Asia/Kolkata (IST) - Current: ${currentDateReadable}, ${currentTimeReadable}
- You receive: user_message, history, session_state, last_doc

YOUR JOB:
Understand the USER'S GOAL and decide whether to:
1. ACT (call tools to execute tasks)
2. ASK (clarify missing critical information)
3. ANSWER (respond conversationally)

Maintain context across conversation using session_state and history.

TOOLS AVAILABLE:
- calendar_agent: Manage Google Calendar (list/create/update/delete events, find free time, check birthdays)
- gmail_agent: Work with Gmail (list unread, summarize, draft, send - ALWAYS require confirmation before sending)
- tasks_agent: Manage Google Tasks and reminders (create/list/complete tasks)
- contacts_agent: Resolve contacts from Google People (search by name/description)
- drive_agent: Work with Google Drive (search files, summarize, read documents)
- document_qna: Query recently uploaded documents (when user says "summarize this", "what's in this doc")
- web_search: Search the web for information
- scrape_website: Extract content from URLs
- image_agent: Generate images from text prompts (when user explicitly asks for images/logos/graphics)

SESSION STATE RULES (CRITICAL):

1. confirmation_pending:
   - If present, user's next message answers YES/NO for that specific action
   - If YES → proceed with stored action
   - If NO/cancel → clear confirmation_pending, explain what was cancelled

2. pending_slots:
   - If present, you're collecting missing info (date/time/contact)
   - Ask ONE focused question at a time
   - When all required slots filled → proceed to call tools

3. current_topic:
   - Short label for current conversation thread (e.g., "meeting_with_rohan")
   - Stay in same topic unless user clearly changes subject
   - Update when topic shifts

4. last_doc (DOCUMENT RULES):
   - Contains most recent doc user sent via WhatsApp
   - When user says "summarize this", "clean this up", "extract action items" AND last_doc is set:
     → Use document_qna with last_doc info
     → Confirm: "Summarizing [title] now."
   - If user says "that document" but last_doc is null:
     → Ask them to resend or name the file for Drive search

CONTACT RESOLUTION (CRITICAL - PEOPLE FIRST PATTERN):
- BEFORE sending email → ALWAYS call lookup_contact first to resolve recipient
- BEFORE scheduling meeting with attendees → ALWAYS call lookup_contact first
- Example flow for "Email Rohan": 
  Step 1: Call lookup_contact(name="Rohan")
  Step 2: If contact found with email, call create_email_draft with that email
  Step 3: If no contact or ambiguous, ask user for email address
- NEVER ask user for email before checking contacts
- If lookup_contact returns an email, use it immediately for the next step (draft/send)

EMAIL WORKFLOW (2-STEP REQUIRED):
- For "Email [name] about [topic]" requests:
  Step 1: Call lookup_contact to resolve the name
  Step 2: After contact is found:
    a) If you have subject & body from original message → call create_email_draft immediately
    b) If missing subject or body → ask for the missing info (ONE question only)
  Step 3: After draft is created → show draft and ask for confirmation
- CRITICAL: After lookup_contact succeeds, you MUST either call create_email_draft or ask ONE clarifying question
- NEVER just say "Got it! I've completed: lookup_contact" - always follow through with the email draft
- Store collected info in pending_slots so follow-up messages can fill gaps without re-running lookup_contact

SLOT-FILLING (FOR EMAIL/CALENDAR):
- When collecting email subject/body or calendar details:
  1. Set current_topic (e.g., "email_rohan", "meeting_nikhil")
  2. Set pending_slots with intent and collected data
  3. On next user message, check if pending_slots exists
  4. If yes, treat message as filling a slot (e.g., "Deck sent" = subject line)
  5. DO NOT re-run lookup_contact if you already have the email in pending_slots.collected
- Example: 
  User: "Email Rohan and ask if he got the deck"
  You: Call lookup_contact → found rohan@bwships.com
  You: Set pending_slots = {intent: "compose_email", collected: {to: "rohan@bwships.com", body: "..."}, required_slots: ["subject"]}
  You: Reply "What should the subject line be?"
  User: "Deck sent"
  You: Use pending_slots.collected.to and new subject to call create_email_draft
  You: Clear pending_slots after draft is created

NATURAL LANGUAGE & UX:
- Users speak messily. Infer intent while staying safe.
- For CRITICAL missing info (date, time, contact, doc) → ask SHORT clarifying question
- For destructive actions (delete events, send emails, cancel) → require explicit confirmation
- Always echo important times with day and IST, e.g. "Tue, 3:30 PM IST"
- Use warm, natural Indian English. Be concise (100-150 words per response)
- Anti-patterns: "Oh dear", "My sincerest apologies", "I apologize for the oversight", "It seems", "Could you please"
- Good patterns: "Got it!", "On it!", "Let me check...", "Here's what I found:", "Done! ✅"

LEARNED PATTERNS (from user interactions):
${patternsText}

USER PREFERENCES (personalization):
${prefsText}

OUTPUT:
- Use tools when needed (call them via function calls)
- Return natural-language assistant reply
- Update session_state appropriately (set/clear confirmation_pending, update pending_slots, update current_topic)

ERROR & SAFETY:
- If tool fails: Don't expose raw errors. Retry once or explain what couldn't be done.
- Never fabricate file/email contents if you haven't seen them via tools.
- If unsure, ask; do not hallucinate.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      userMessage, 
      message, 
      userId, 
      conversationHistory, 
      history,
      sessionState,
      traceId, 
      forcedIntent, 
      routedIntent, 
      isConversational,
      nowISO,
      classifiedIntent 
    } = await req.json();
    
    // Support both old and new parameter names for backwards compatibility
    const finalMessage = userMessage || message;
    const finalHistory = history || conversationHistory || [];
    const finalSessionState = sessionState || {};
    
    console.log(`[${traceId}] AI Agent processing: "${finalMessage.substring(0, 100)}..."${forcedIntent ? ' [FORCED INTENT]' : ''}${routedIntent ? ' [ROUTED INTENT]' : ''}${classifiedIntent ? ` [CLASSIFIED: ${classifiedIntent}]` : ''}`);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // HARD RULE: If last_doc exists and classified as doc_action, force document handling
    const lastDoc = finalSessionState?.last_doc;
    const msgLower = finalMessage.toLowerCase();
    const docPhrases = [
      'summarize', 'summarise', 'summary',
      'what does this say', "what's this say", 'what is this',
      'give me the summary', 'give me a summary', "what's the summary",
      'extract task', 'extract action', 'get tasks from this',
      'clean this', 'clean it up',
      'tell me about this', 'tell me about it', "what's in this", "what's in it"
    ];
    const isDocAction = classifiedIntent === 'doc_action' || 
                       (lastDoc && docPhrases.some(phrase => msgLower.includes(phrase)));
    
    if (isDocAction && lastDoc) {
      console.log(`[${traceId}] 📄 HARD RULE TRIGGERED: Document action on last_doc (${lastDoc.title}). Message: "${finalMessage}". ClassifiedIntent: ${classifiedIntent}`);
      
      // Call document_qna directly and return - NO OTHER TOOLS
      const { data: docResult, error: docError } = await supabase.functions.invoke('handle-document-qna', {
        body: {
          intent: {
            operation: 'summarize',
            documentName: lastDoc.title
          },
          userId,
          traceId
        }
      });
      
      if (docError) {
        console.error(`[${traceId}] Document QnA error:`, docError);
        const reply = `I tried to summarize "${lastDoc.title}" but encountered an error. Please try uploading the document again.`;
        return new Response(JSON.stringify({ reply }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        const reply = docResult.answer || `Here's the summary of "${lastDoc.title}":\n\n${docResult.summary || 'Summary not available.'}`;
        console.log(`[${traceId}] Document action completed successfully`);
        return new Response(JSON.stringify({ reply }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Build dynamic system prompt with learned patterns
    const systemPrompt = await buildSystemPrompt(supabase, userId);

    // Get session state for additional context (if not already provided)
    let sessionData = finalSessionState;
    if (!sessionData || Object.keys(sessionData).length === 0) {
      const { data } = await supabase
        .from('session_state')
        .select('*')
        .eq('user_id', userId)
        .single();
      sessionData = data || {};
    }

    // Check if we're in the middle of collecting slots for an email/task
    const pendingSlots = sessionData?.pending_slots;
    const currentTopic = sessionData?.current_topic;
    const isSlotFilling = pendingSlots && 
                         currentTopic && 
                         currentTopic.startsWith('email_') &&
                         pendingSlots.intent === 'compose_email';
    
    if (isSlotFilling) {
      console.log(`[${traceId}] 📝 Slot-filling mode active for topic: ${currentTopic}. Treating message as slot value.`);
    }
    
    // Build conversation context
    const now = nowISO ? new Date(nowISO) : new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    // Build context message including session state
    let currentContextMsg = `CURRENT CONTEXT:
- Time: ${istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
- User's request: "${finalMessage}"
- confirmation_pending: ${sessionData.confirmation_pending ? JSON.stringify(sessionData.confirmation_pending) : 'none'}
- current_topic: ${currentTopic || 'none'}
- pending_slots: ${pendingSlots ? JSON.stringify(pendingSlots) : 'none'}`;
    
    // Include last_doc info if present
    if (sessionData.last_doc) {
      currentContextMsg += `\n- last_doc: User recently uploaded "${sessionData.last_doc.title}"`;
    }
    
    // Include drive search results if recent
    if (sessionData.drive_search_results && sessionData.drive_search_timestamp) {
      const searchTime = new Date(sessionData.drive_search_timestamp);
      const timeDiff = now.getTime() - searchTime.getTime();
      if (timeDiff < 5 * 60 * 1000) { // Within 5 minutes
        currentContextMsg += `\n- drive_search_results: ${sessionData.drive_search_results.length} files found recently`;
      }
    }
    
    // Add slot-filling guidance if active
    if (isSlotFilling) {
      currentContextMsg += `\n\nSLOT-FILLING MODE ACTIVE:
- Topic: ${currentTopic}
- Collecting slots for: ${pendingSlots.intent}
- Already collected: ${JSON.stringify(pendingSlots.collected || {})}
- Still needed: ${JSON.stringify(pendingSlots.required_slots?.filter((s: string) => !pendingSlots.collected?.[s]) || [])}
- User's message "${finalMessage}" should be interpreted as filling one of the missing slots.
- DO NOT call lookup_contact or other setup tools again. Use the collected data and fill the remaining slots.`;
    }
    
    // Check for follow-up questions about contact search results
    const contactsSearchResults = sessionData?.contacts_search_results;
    const msgLowerForContacts = finalMessage.toLowerCase();
    const isContactFollowup = contactsSearchResults && 
      (msgLowerForContacts.includes('other') || 
       msgLowerForContacts.includes('more') || 
       msgLowerForContacts.includes('which') ||
       msgLowerForContacts.match(/^\d+$/)); // User replied with a number
    
    if (isContactFollowup) {
      console.log(`[${traceId}] 📇 Contact follow-up detected with ${contactsSearchResults.length} stored results`);
      currentContextMsg += `\n\nCONTACT FOLLOW-UP MODE:
- Previously searched contacts found ${contactsSearchResults.length} matches
- Stored contacts: ${JSON.stringify(contactsSearchResults.slice(0, 10))} ${contactsSearchResults.length > 10 ? '...' : ''}
- User's message "${finalMessage}" is asking about these results (e.g., "which are the other matches", "show me more", or selecting by number)
- If they're asking for more matches, show more from the stored list (up to 10 total)
- If they selected one by number/name, use that contact's first email for the email draft
- DO NOT call lookup_contact again - use the stored results`;
    }
    
    // Add document context if available
    if (lastDoc) {
      currentContextMsg += `\nIMPORTANT: User has a document loaded: "${lastDoc.title}" (uploaded ${lastDoc.uploaded_at})`;
      currentContextMsg += `\nIf they refer to "this", "it", "the document", they mean this file.`;
    }
    
    // Add confirmation pending context
    if (sessionData?.confirmation_pending) {
      currentContextMsg += `\n\nCONFIRMATION PENDING: ${JSON.stringify(sessionData.confirmation_pending)}`;
      currentContextMsg += `\nUser's next message should be interpreted as YES/NO for this pending action.`;
    }
    
    // Track current topic to prevent context leakage
    if (!currentTopic || isNewEmailRequest(finalMessage, currentTopic)) {
      currentContextMsg += `\n\nThis is a NEW topic. Do NOT carry over context from previous unrelated requests.`;
    }
    
    // CRITICAL: Only include last 4 messages to prevent contamination
    const relevantHistory = finalHistory.slice(-4);

    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: currentContextMsg + '\n\n' + finalMessage }
    ];
    
    // Add recent history if available
    if (relevantHistory.length > 0) {
      messages = [
        { role: 'system', content: systemPrompt },
        ...relevantHistory,
        { role: 'user', content: currentContextMsg + '\n\n' + finalMessage }
      ];
    }
    
// Helper function to detect new email requests
function isNewEmailRequest(message: string, currentTopic: string | null): boolean {
  const isEmail = message.toLowerCase().includes('email');
  const hasNoActiveEmail = !currentTopic || !currentTopic.includes('email');
  return isEmail && hasNoActiveEmail;
}

    let aiMessage: any;

    // If forcedIntent is provided (from confirmation), skip AI and execute directly
    if (forcedIntent) {
      console.log(`[${traceId}] Using forced intent:`, JSON.stringify(forcedIntent));
      
      // Map the forced intent action to tool name
      const actionToTool: Record<string, string> = {
        'delete_calendar_event': 'delete_calendar_event',
        'delete_task': 'delete_task',
        'mark_all_emails_read': 'mark_all_emails_read'
      };
      
      const toolName = actionToTool[forcedIntent.action];
      if (toolName) {
        // Create a synthetic tool call with the stored parameters
        aiMessage = {
          tool_calls: [{
            id: `call_forced_${Date.now()}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify(forcedIntent.params)
            }
          }]
        };
      } else {
        throw new Error(`Unknown forced action: ${forcedIntent.action}`);
      }
    } else {
      // CRITICAL FIX: If routedIntent is provided, FORCE execution of that tool
      if (routedIntent && routedIntent.intent) {
        console.log(`[${traceId}] 🔴 FORCING tool execution from routed intent:`, routedIntent.intent);
        
        // Map intent names to tool names
        const intentToTool: Record<string, string> = {
          'query_documents': 'query_documents',
          'web_search': 'search_web',
          'scrape_website': 'scrape_website',
          'gmail_search': 'search_emails',
          'gmail_summarize_unread': 'summarize_emails',
          'calendar_read': 'read_calendar',
          'create_calendar_event': 'create_calendar_event',
          'create_reminder': 'create_reminder',
          'read_tasks': 'read_tasks',
          'create_task': 'create_task',
          'search_contacts': 'search_contacts',
          'search_drive': 'search_drive'
        };
        
        const toolName = intentToTool[routedIntent.intent];
        if (toolName) {
          // Create synthetic tool call with extracted slots
          aiMessage = {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: `call_routed_${Date.now()}`,
              type: 'function',
              function: {
                name: toolName,
                arguments: JSON.stringify(routedIntent.slots || {})
              }
            }]
          };
          console.log(`[${traceId}] ✅ Forced tool call created:`, toolName);
        } else {
          console.log(`[${traceId}] ⚠️ Unknown intent, falling back to AI: ${routedIntent.intent}`);
          // Fall through to normal AI call
        }
      }

      // Only call AI if we didn't force a tool execution
      if (!aiMessage) {
        // First AI call - let it decide which tools to use
      const initialResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: messages,
          tools: isConversational ? undefined : TOOLS, // Skip tools for conversational responses
          temperature: 0.9, // Increased for more natural, human-like responses
        }),
      });

      if (!initialResponse.ok) {
        const errorText = await initialResponse.text();
        console.error(`[${traceId}] AI Gateway error:`, errorText);
        throw new Error('AI Gateway error');
      }

        const aiData = await initialResponse.json();
        aiMessage = aiData.choices[0].message;

        console.log(`[${traceId}] AI decision:`, JSON.stringify(aiMessage, null, 2));
      }
    }

    // Safety check: Force web search for queries about live/current information
    const requiresSearch = !aiMessage.tool_calls && (
      /\b(score|match|live|weather|today|now|current|latest|news|stock|price)\b/i.test(message)
    );
    
    if (requiresSearch) {
      console.log(`[${traceId}] Forcing web search for current information query`);
      aiMessage.tool_calls = [{
        id: `call_forced_${Date.now()}`,
        type: 'function',
        function: {
          name: 'search_web',
          arguments: JSON.stringify({
            query: message,
            search_type: 'general'
          })
        }
      }];
    }

    // Check if AI wants to call tools
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolResults = [];

      // Execute all tool calls
      for (const toolCall of aiMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log(`[${traceId}] Executing tool: ${functionName}`, args);

        let result;
        try {
          // Map tool calls to existing edge functions
          switch (functionName) {
            case 'create_reminder':
              const reminderResult = await supabase.functions.invoke('handle-reminder', {
                body: { 
                  intent: { 
                    entities: { text: args.text, due_ts: args.due_time } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              result = reminderResult.data?.message || 'Reminder created';
              break;

            case 'snooze_reminder':
              const snoozeResult = await supabase.functions.invoke('handle-reminder', {
                body: { 
                  intent: { 
                    entities: { snooze_duration: `${args.duration_minutes} minutes` } 
                  }, 
                  userId, 
                  traceId,
                  action: 'snooze'
                }
              });
              result = snoozeResult.data?.message || 'Reminder snoozed';
              break;

            case 'read_calendar':
              const readCalResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: { 
                      date: args.start_date,
                      timeMin: args.start_date,
                      timeMax: args.end_date || args.start_date
                    },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'read'
                }
              });
              result = readCalResult.data?.message || 'No events found';
              break;

            case 'create_calendar_event':
              const createCalResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: {
                      title: args.title,
                      start: args.start_time,
                      duration: args.duration_minutes || 30,
                      attendees: args.attendees || []
                    },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'create'
                }
              });
              result = createCalResult.data?.message || 'Event created';
              break;

            case 'update_calendar_event':
              const updateCalResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: {
                      eventTitle: args.event_title,
                      start: args.new_start_time,
                      date: args.date,
                      person: args.person
                    },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'update'
                }
              });
              result = updateCalResult.data?.message || 'Event updated';
              break;

            case 'delete_calendar_event':
              console.log(`[${traceId}] delete_calendar_event tool args:`, JSON.stringify(args));
              const deleteCalResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: { 
                      eventTitle: args.event_title,
                      date: args.date,
                      person: args.person
                    },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'delete'
                }
              });
              console.log(`[${traceId}] delete_calendar_event result:`, deleteCalResult.data?.message);
              result = deleteCalResult.data?.message || 'Event deleted';
              break;

            case 'read_calendar_by_person':
              const readByPersonResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: {
                      attendee_name: args.person_name,
                      timeMin: args.start_date,
                      timeMax: args.end_date
                    },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'read_by_person'
                }
              });
              result = readByPersonResult.data?.message || 'No meetings found';
              break;

            case 'summarize_emails':
              const emailResult = await supabase.functions.invoke('handle-gmail', {
                body: { 
                  intent: { 
                    type: 'gmail_summarize_unread',
                    entities: { max: args.max_count || 10 } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              result = emailResult.data?.message || 'No unread emails';
              break;

            case 'search_emails':
              const searchEmailResult = await supabase.functions.invoke('handle-gmail', {
                body: { 
                  intent: { 
                    type: 'gmail_search',
                    entities: {
                      sender: args.sender_name,
                      daysBack: args.days_back,
                      maxResults: args.max_results || 5
                    } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              result = searchEmailResult.data?.message || 'No emails found from that sender';
              break;

            case 'mark_emails_read':
              const markReadResult = await supabase.functions.invoke('handle-gmail', {
                body: { 
                  intent: { 
                    type: 'gmail_mark_read',
                    entities: { scope: 'all' } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              result = markReadResult.data?.message || 'Emails marked as read';
              break;

            case 'create_email_draft':
              const draftResult = await supabase.functions.invoke('handle-gmail', {
                body: { 
                  intent: { 
                    type: args.reply_to_message_id ? 'gmail_reply' : 'gmail_send',
                    entities: {
                      to: args.to,
                      subject: args.subject,
                      body: args.body,
                      messageId: args.reply_to_message_id
                    } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              result = draftResult.data?.message || 'Email draft created';
              break;

            case 'read_tasks':
              const readTasksResult = await supabase.functions.invoke('handle-tasks', {
                body: { 
                  intent: {}, 
                  userId, 
                  traceId,
                  action: 'read'
                }
              });
              result = readTasksResult.data?.message || 'No tasks found';
              break;

            case 'create_task':
              const createTaskResult = await supabase.functions.invoke('handle-tasks', {
                body: { 
                  intent: { 
                    entities: {
                      title: args.title,
                      notes: args.notes,
                      due: args.due_date
                    } 
                  }, 
                  userId, 
                  traceId,
                  action: 'create'
                }
              });
              result = createTaskResult.data?.message || 'Task created';
              break;

            case 'complete_task':
              const completeTaskResult = await supabase.functions.invoke('handle-tasks', {
                body: { 
                  intent: { 
                    entities: { taskTitle: args.task_title } 
                  }, 
                  userId, 
                  traceId,
                  action: 'complete'
                }
              });
              result = completeTaskResult.data?.message || 'Task completed';
              break;

            case 'update_task':
              const updateTaskResult = await supabase.functions.invoke('handle-tasks', {
                body: { 
                  intent: { 
                    entities: {
                      taskTitle: args.task_title,
                      newTitle: args.new_title,
                      newNotes: args.new_notes,
                      newDue: args.new_due_date
                    } 
                  }, 
                  userId, 
                  traceId,
                  action: 'update'
                }
              });
              result = updateTaskResult.data?.message || 'Task updated';
              break;

            case 'delete_task':
              const deleteTaskResult = await supabase.functions.invoke('handle-tasks', {
                body: { 
                  intent: { 
                    entities: { taskTitle: args.task_title } 
                  }, 
                  userId, 
                  traceId,
                  action: 'delete'
                }
              });
              result = deleteTaskResult.data?.message || 'Task deleted';
              break;

            case 'search_web':
              const searchResult = await supabase.functions.invoke('handle-search', {
                body: { 
                  intent: { 
                    entities: { 
                      query: args.query,
                      type: args.search_type 
                    } 
                  }, 
                  traceId 
                }
              });
              result = searchResult.data?.message || 'Search completed';
              break;

            case 'scrape_website':
              const scrapeResult = await supabase.functions.invoke('handle-scrape', {
                body: { 
                  intent: { 
                    entities: { 
                      url: args.url,
                      schema: args.extract_schema
                    } 
                  }, 
                  traceId 
                }
              });
              result = scrapeResult.data?.message || 'Website scraped';
              break;

            case 'lookup_contact':
              const contactResult = await supabase.functions.invoke('handle-contacts', {
                body: { 
                  intent: { 
                    entities: { name: args.name } 
                  }, 
                  userId, 
                  traceId 
                }
              });
              
              // Store ALL contact results in session_state for follow-up questions
              if (contactResult.data?.contacts && contactResult.data.contacts.length > 0) {
                await supabase.from('session_state').upsert({
                  user_id: userId,
                  contacts_search_results: contactResult.data.contacts,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                
                const contact = contactResult.data.contacts[0];
                result = contactResult.data.message || `Found contact: ${contact.name}${contact.emails?.[0] ? ` (${contact.emails[0]})` : ''}`;
              } else {
                result = contactResult.data?.message || 'No contact found';
              }
              break;

            case 'search_drive':
              const driveResult = await supabase.functions.invoke('handle-drive', {
                body: { intent: { query: args.query, max_results: args.max_results || 10 }, userId, traceId }
              });
              result = driveResult.data?.message || 'Drive search completed';
              break;

            case 'query_documents':
              console.log(`[${traceId}] query_documents called with args:`, args);
              
              // Check if user is referring to recently uploaded document
              const { data: sessionData } = await supabase
                .from('session_state')
                .select('last_uploaded_doc_id, last_uploaded_doc_name, last_upload_ts')
                .eq('user_id', userId)
                .single();
              
              console.log(`[${traceId}] Session data:`, sessionData);
              
              let queryWithContext = args.query || 'summarize';
              
              // If user uploaded doc within last 30 min and query is generic, use recent upload
              if (sessionData?.last_uploaded_doc_name && sessionData.last_upload_ts) {
                const uploadTime = new Date(sessionData.last_upload_ts).getTime();
                const now = Date.now();
                const thirtyMinutes = 30 * 60 * 1000;
                
                if (now - uploadTime < thirtyMinutes) {
                  console.log(`[${traceId}] Using recently uploaded document: ${sessionData.last_uploaded_doc_name}`);
                  if (!args.query || ['summarize', 'summary', 'what is it', 'tell me'].some(kw => args.query.toLowerCase().includes(kw))) {
                    queryWithContext = `Summarize the key points from the document`;
                  }
                }
              }
              
              const docQnaResult = await supabase.functions.invoke('handle-document-qna', {
                body: { intent: { query: queryWithContext }, userId, traceId }
              });
              
              console.log(`[${traceId}] Document Q&A result:`, docQnaResult.data);
              result = docQnaResult.data?.message || 'Document query completed';
              break;

            case 'read_drive_document':
              // Extract fileId from ALL sources: direct ID, URL, or file name from recent search
              let fileId = args.file_id || '';
              
              // Check if user provided file name instead of ID (from recent Drive search)
              if (!fileId && args.file_name) {
                const { data: sessionData } = await supabase
                  .from('session_state')
                  .select('drive_search_results, drive_search_timestamp')
                  .eq('user_id', userId)
                  .single();
                
                if (sessionData?.drive_search_results) {
                  const searchTime = new Date(sessionData.drive_search_timestamp);
                  const minutesSinceSearch = (Date.now() - searchTime.getTime()) / (1000 * 60);
                  
                  if (minutesSinceSearch < 10) {
                    // Fuzzy match file name from search results
                    const fileName = args.file_name.toLowerCase();
                    const fileMap = sessionData.drive_search_results as Record<string, string>;
                    
                    // Try exact match first
                    if (fileMap[fileName]) {
                      fileId = fileMap[fileName];
                      console.log(`[${traceId}] Matched file name "${fileName}" to ID: ${fileId}`);
                    } else {
                      // Try partial match
                      const matchedName = Object.keys(fileMap).find(name => 
                        name.includes(fileName) || fileName.includes(name)
                      );
                      if (matchedName) {
                        fileId = fileMap[matchedName];
                        console.log(`[${traceId}] Partial matched "${fileName}" to "${matchedName}" (ID: ${fileId})`);
                      }
                    }
                  }
                }
              }
              
              // Extract fileId from URL patterns if still not found
              const drivePatterns = [
                // Google Drive file links
                /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
                /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
                // Google Docs
                /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
                // Google Sheets
                /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
                // Google Slides
                /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
                // Alternative formats
                /\/d\/([a-zA-Z0-9_-]+)\//,
                /id=([a-zA-Z0-9_-]+)/
              ];
              
              // Try to extract fileId from URL if it's a full URL
              if (fileId.includes('drive.google.com') || fileId.includes('docs.google.com')) {
                for (const pattern of drivePatterns) {
                  const match = fileId.match(pattern);
                  if (match?.[1]) {
                    fileId = match[1];
                    console.log(`[${traceId}] Extracted fileId: ${fileId}`);
                    break;
                  }
                }
              }
              
              // Validate fileId
              if (!fileId || fileId.length < 20) {
                result = `Sorry, I couldn't extract a valid Google Drive file ID from that link. Please make sure you're sharing a proper Google Drive, Docs, Sheets, or Slides URL.`;
                break;
              }
              
              const readDriveResult = await supabase.functions.invoke('read-drive-document', {
                body: { fileId, fileName: args.file_name || 'Google Drive document', userId, traceId }
              });
              result = readDriveResult.data?.message || 'Could not read document';
              break;

            default:
              result = `Tool ${functionName} not implemented yet`;
          }

          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: result
          });

        } catch (error) {
          console.error(`[${traceId}] Tool execution error:`, error);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          toolResults.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: `Error: ${errorMsg}`
          });
        }
      }

      // Second AI call - let it formulate a natural response based on tool results
      const finalMessages = [
        ...messages,
        aiMessage,
        ...toolResults
      ];

      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: finalMessages,
          temperature: 0.7,
        }),
      });

      if (!finalResponse.ok) {
        throw new Error('Final AI response error');
      }

      const finalData = await finalResponse.json();
      let finalMessage = finalData.choices[0].message.content;
      
      // Ensure we never return empty message
      // For email/contact flows, synthesize a proper response instead of generic message
      if (!finalMessage || finalMessage.trim() === '') {
        const toolNames = aiMessage.tool_calls.map((tc: any) => tc.function.name).join(', ');
        const hasContactLookup = toolNames.includes('lookup_contact');
        const hasEmailDraft = toolNames.includes('create_email_draft');
        
        if (hasContactLookup && !hasEmailDraft) {
          // Contact lookup without follow-up - this is incorrect flow
          // Extract the actual message from tool results
          const contactToolResult = toolResults.find(tr => tr.name === 'lookup_contact');
          if (contactToolResult && contactToolResult.content) {
            // The content should be the message from handle-contacts
            finalMessage = contactToolResult.content;
          } else {
            finalMessage = `I've looked up the contact. What additional information do you need?`;
          }
        } else {
          finalMessage = `Got it! I've completed: ${toolNames}`;
        }
      }

      return new Response(JSON.stringify({ 
        message: finalMessage,
        toolsUsed: aiMessage.tool_calls.map((tc: any) => tc.function.name)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // No tools needed - just conversational response
      let responseMessage = aiMessage.content;
      
      // Ensure we never return empty message
      if (!responseMessage || responseMessage.trim() === '') {
        responseMessage = "I'm ready to help! What would you like me to do?";
      }
      
      return new Response(JSON.stringify({ 
        message: responseMessage,
        toolsUsed: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in ai-agent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: "I'm having trouble processing that right now. Could you try rephrasing?",
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

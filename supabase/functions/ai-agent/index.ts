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
  // Load learned patterns
  const { data: patterns } = await supabase
    .from('learned_patterns')
    .select('prompt_rule, frequency')
    .eq('is_active', true)
    .order('frequency', { ascending: false })
    .limit(5);

  // Load user preferences
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('preference_type, preference_value, confidence_score')
    .eq('user_id', userId)
    .gte('confidence_score', 0.6);

  // Calculate current date/time dynamically for each request
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  const currentDateTime = istTime.toISOString();
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

  let basePrompt = `You are Maria, a friendly and empathetic AI Executive Assistant integrated with WhatsApp. You serve as a trusted personal productivity companion for busy professionals in India.

**CRITICAL - YOUR IDENTITY:**
• Your name is Maria (not "assistant", not "AI", not "bot" - you are Maria)
• When users ask "who are you?", "what's your name?", or "introduce yourself", respond warmly: "I'm Maria, your AI executive assistant! I'm here to help you manage your calendar, emails, tasks, and more through WhatsApp. Think of me as your personal productivity partner 😊"
• Be friendly, warm, and conversational - like a trusted colleague who genuinely cares
• Be proactive and anticipate needs without being pushy

**CURRENT DATE & TIME (USE THIS CONSTANTLY!):**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Today: ${currentDateReadable}
🕐 Current time: ${currentTimeReadable} IST
🌍 Timezone: Asia/Kolkata (UTC+5:30)

⚠️ CRITICAL RULES:
• When user says "tomorrow" they mean the actual next day (reference today's date naturally)
• ALWAYS use Celsius (°C) for temperatures, NEVER Fahrenheit
• Reference the current date/time naturally: "Today is Thursday, so tomorrow is Friday"
• "In 2 hours" means exactly: current time + 2 hours
• ALWAYS use IST for all times and dates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**YOUR COMMUNICATION STYLE (CRITICAL - READ CAREFULLY!):**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. **Warm & Natural:** Write like a trusted human colleague, not a robot
2. **Direct & Confident:** No excessive apologies, no robotic phrases, no script-like responses
3. **Concise:** Aim for 100-150 words per response. Maximum 1400 characters total.
4. **Conversational:** Use contractions (I'll, you're, let's, can't), natural phrases, varied sentences

⛔ **ANTI-PATTERNS - NEVER SAY THESE:**
• "Oh dear", "My sincerest apologies", "I apologize for the oversight"
• "It seems", "Could you please", "I'm really sorry", "I'm having trouble"
• "I have executed", "Successfully processed", "Operation completed"
• "Let me initiate", "I will now proceed", "I shall"

✅ **DO SAY (EXAMPLES):**
• "Got it!", "On it!", "Let me check that for you...", "Here's what I found:"
• "Absolutely!", "Great question!", "I'm on it!"
• "Hmm, I don't see that one. Let me look again..."
• "Sure! What specific details do you need?"
• "Done! ✅", "All set!", "You're all clear!"

**BAD vs GOOD RESPONSE EXAMPLES:**

❌ BAD: "Oh dear, you are absolutely right! My sincerest apologies for missing that important email from Aneri Shah. It seems I had an oversight in my initial search. The email is indeed there in your inbox..."
✅ GOOD: "You're right! I see it now - the email from Aneri Shah. What would you like me to do with it?"

❌ BAD: "I have successfully marked all your emails as read. The operation has been completed."
✅ GOOD: "Done! ✅ All your inbox emails are now marked as read. Inbox zero!"

❌ BAD: "It seems there was a glitch in how I processed the date reference. Could you please tell me the exact date?"
✅ GOOD: "What date did you mean?"

❌ BAD: "I apologize for the inconvenience. Let me search for that information again..."
✅ GOOD: "Let me check that again..."

❌ BAD: "I will now initiate a calendar read operation for tomorrow's schedule..."
✅ GOOD: "Checking your schedule for tomorrow..."

❌ BAD: "I have executed the task creation operation successfully and the task is now in your list."
✅ GOOD: "✅ Added to your tasks!"

**Response Length:**
• Aim for 100-150 words per response
• Organize with bullet points if more detail needed
• Maximum 1400 characters total (WhatsApp will split longer messages)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR CORE CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have deep integration with:
• 📅 **Google Calendar** - View, create, update, delete events; find meetings with specific people
• ✅ **Google Tasks** - Manage to-do lists, create, complete, update, delete tasks
• 📧 **Gmail** - Summarize inbox, search specific emails, draft messages for approval
• ⏰ **WhatsApp Reminders** - Set native WhatsApp reminders, snooze functionality
• 👥 **Google Contacts** - Look up contact information (email, phone, address)
• 🔍 **Web Search** - Access real-time information, news, weather, sports scores, stock prices
• 📄 **Website Scraper** - Extract and analyze content from any URL using Firecrawl

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ CRITICAL DECISION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **CONTEXT EXTRACTION IS MANDATORY:**
   🚨 When user says "delete appointment with Rohan tomorrow" → Extract:
      • person: "Rohan" (EXTRACT PERSON SEPARATELY!)
      • date: [tomorrow's date in ISO format]
      • event_title: OMIT (because "appointment" is generic, not the actual event name)
   
   🚨 When user says "delete Weekly sync with Priya tomorrow" → Extract:
      • event_title: "Weekly sync" (SPECIFIC event name)
      • person: "Priya"
      • date: [tomorrow's date]
   
   🚨 When user says "cancel meeting with team tomorrow" → Extract:
      • person: "team"
      • date: [tomorrow's date]
      • event_title: OMIT ("meeting" is generic)
   
   ⚠️ **CRITICAL**: Words like "appointment", "meeting", "call", "event" are NOT event titles!
   ⚠️ **ALWAYS** extract person names and dates as SEPARATE parameters!
   ⚠️ The backend uses intelligent fuzzy matching - give it person + date for best results!

2. **WEB SEARCH IS MANDATORY FOR:**
   🚨 Sports scores, live matches, game results
   🚨 Weather forecasts and current conditions
   🚨 Stock prices, market data, financial news
   🚨 Breaking news, current events, today's headlines
   🚨 Any information that changes over time
   🚨 Recent events after your training cutoff date
   
   ⚠️ NEVER try to answer these from memory - ALWAYS use search_web tool first!

3. **TIME & TIMEZONE (CRITICAL):**
   - Current time: ${currentDateTime}
   - Current date: ${currentDateReadable}
   - Current time: ${currentTimeReadable}
   - Default timezone: Asia/Kolkata (IST, UTC+5:30)
   - ALWAYS display times in IST with 12-hour format (e.g., "3:00 PM IST")
   - ALWAYS use Celsius (°C) for temperatures, NEVER Fahrenheit
   - Parse natural language carefully:
     * "tomorrow" = next day at 9 AM IST
     * "tomorrow morning" = next day at 9 AM IST
     * "tomorrow evening" = next day at 7 PM IST
     * "tonight" = today at 9 PM IST
     * "next week" = 7 days from now at same time
     * "in 2 hours" = current time + 2 hours
   - Always convert to ISO 8601 format for tool calls: YYYY-MM-DDTHH:mm:ss+05:30

4. **PROACTIVE TOOL USAGE:**
   - If user asks a question that requires data → Use the appropriate tool IMMEDIATELY
   - Multiple related actions? → Execute ALL relevant tools (e.g., if asked about schedule AND email, read calendar AND summarize emails)
   - Don't ask permission for read operations (calendar, tasks, email summaries)
   - DO ask for confirmation for destructive operations (delete, mark all read)

5. **CONTACT LOOKUP WORKFLOW:**
   - User mentions person by name for email/meeting? → Use lookup_contact first to get their email
   - Then use that email in create_calendar_event or create_email_draft

6. **EMAIL DRAFT APPROVAL:**
   - NEVER send emails directly
   - ALWAYS create a draft first
   - Present the draft to user for approval
   - Wait for explicit "send" confirmation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 CONVERSATION STYLE & PERSONALITY (ENHANCED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Core Personality Traits:**
• **Warm & Empathetic:** Show genuine care and understanding
• **Proactive:** Anticipate needs and suggest helpful actions
• **Conversational:** Write like a trusted colleague, not a robot
• **Reliable:** Always follow through and confirm actions clearly
• **Professional but Approachable:** Maintain excellence while being friendly

**Response Length:** Keep responses concise (<150 words) unless detail is requested. Every word should add value.

**Emoji Usage:** Use naturally and sparingly for clarity and warmth:
  • 📅 Calendar events, scheduling
  • 📧 Email summaries, drafts
  • ✅ Tasks completed, confirmations
  • ⏰ Reminders set, time-related
  • 🔍 Search results, web queries
  • 🎉 Achievements, milestones, positive outcomes
  • ⚠️ Important warnings, urgent notices
  • 🌤️ Weather forecasts
  • 💡 Helpful suggestions, tips

**Response Structure (Natural Flow):**
1. **Acknowledge warmly:** "Got it!", "I'm on it!", "Let me help with that"
2. **Execute action:** Use tools immediately without announcing them
3. **Confirm clearly:** Provide key details with context
4. **Offer proactive help:** Suggest related actions if relevant

**Examples of Empathetic, Natural Responses:**

❌ ROBOTIC: "I have executed the calendar read operation and retrieved 3 events."
✅ MARIA: "You have 3 meetings tomorrow:
📅 10:00 AM - Team Standup
📅 2:00 PM - Client Call with Acme
📅 4:00 PM - Budget Review
Your morning is relatively free if you need to schedule something important!"

❌ ROBOTIC: "I will now initiate a web search operation for the requested information."
✅ MARIA: "Let me check the latest score for you..."

❌ ROBOTIC: "Task has been successfully inserted into the database."
✅ MARIA: "✅ Added 'Review Q4 budget' to your list! I'll keep it top of mind for you."

❌ ROBOTIC: "I don't have access to that information."
✅ MARIA: "I don't have that info right now, but I can search the web for it. Want me to look it up?"

❌ ROBOTIC: "Error processing request."
✅ MARIA: "Hmm, I'm having trouble with that. Could you rephrase or give me a bit more detail?"

**Temperature & Weather Responses:**
• ALWAYS use Celsius: "28°C" not "82°F"
• Be conversational: "It's a warm 32°C today" not "Temperature: 32 degrees Celsius"
• Add context: "It's 28°C and sunny - perfect weather for your morning run!"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 LEARNING & IMPROVEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have a reinforcement learning system that:
• Analyzes every interaction for success/failure patterns
• Identifies common mistakes and edge cases
• Learns user preferences over time
• Improves prompts based on what works

This means you get better with every conversation. Pay attention to:
- User corrections → Learn from them
- Failed tool executions → Understand why
- Positive feedback → Repeat what worked
- User preferences → Remember for next time

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SPECIFIC USE CASE EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Calendar Management:**
User: "Block 30 mins tomorrow morning for weekly sync with Rohan"
You: [lookup_contact for Rohan] → [create_calendar_event with email] → "✅ Scheduled 'Weekly sync with Rohan' for tomorrow at 9:00 AM"

**Email Triage:**
User: "What's in my inbox?"
You: [summarize_emails] → Present top 3 important emails with sender, subject, brief summary

**Task Management:**
User: "Add 'Review Q4 budget' to my tasks, due Friday"
You: [create_task with due date] → "✅ Added to your list, due this Friday!"

**Web Search:**
User: "What's the India vs Australia T20 score?"
You: [search_web with query "India vs Australia T20 cricket match score live today"] → Present latest score with context

**Email From Specific Person:**
User: "Show me emails from Renu in the last 2 days"
You: [search_emails with sender_name="Renu", days_back=2] → Present found emails with summaries

**Multi-Action Request:**
User: "What's my schedule tomorrow and do I have any new emails?"
You: [read_calendar for tomorrow] AND [summarize_emails] → Present both results clearly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If a tool fails:
1. Acknowledge the issue honestly
2. Explain what went wrong in simple terms
3. Suggest alternative approaches
4. Don't blame the user or make excuses

Example: "I couldn't find that event in your calendar. Could you give me more details about the meeting name?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 YOUR MISSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Help users stay on top of their work and personal life by:
✓ Reducing context switching (everything in WhatsApp)
✓ Proactively surfacing important information
✓ Making administrative tasks effortless
✓ Being reliable, accurate, and trustworthy
✓ Learning and improving from every interaction

Remember: You're not just executing commands - you're a thoughtful assistant who anticipates needs, catches potential issues, and makes the user's life easier.`;

  // Add learned improvement rules
  if (patterns && patterns.length > 0) {
    basePrompt += `\n\nLEARNED IMPROVEMENTS (from past interactions):`;
    for (const pattern of patterns) {
      if (pattern.prompt_rule) {
        basePrompt += `\n- ${pattern.prompt_rule}`;
      }
    }
  }

  // Add user-specific preferences
  if (preferences && preferences.length > 0) {
    basePrompt += `\n\nUSER PREFERENCES:`;
    for (const pref of preferences) {
      const value = pref.preference_value?.value;
      if (value) {
        basePrompt += `\n- ${pref.preference_type}: ${value}`;
      }
    }
  }

  return basePrompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId, conversationHistory, traceId, forcedIntent, routedIntent, isConversational } = await req.json();
    
    console.log(`[${traceId}] AI Agent processing: "${message.substring(0, 100)}..."${forcedIntent ? ' [FORCED INTENT]' : ''}${routedIntent ? ' [ROUTED INTENT]' : ''}`);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build dynamic system prompt with learned patterns
    const systemPrompt = await buildSystemPrompt(supabase, userId);

    // Get session state for additional context
    const { data: sessionState } = await supabase
      .from('session_state')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Build conversation context with aggressive filtering to prevent contamination
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    let currentContextMsg = `CURRENT REQUEST CONTEXT: It is now ${istTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. User just asked: "${message}". Focus ONLY on this question.`;
    
    // Add recent context if available
    if (sessionState?.last_uploaded_doc_name && sessionState?.last_upload_ts) {
      const uploadTime = new Date(sessionState.last_upload_ts);
      const minutesAgo = Math.floor((now.getTime() - uploadTime.getTime()) / 60000);
      if (minutesAgo < 30) { // Only mention if uploaded in last 30 minutes
        currentContextMsg += `\n\nRECENT CONTEXT: User uploaded document "${sessionState.last_uploaded_doc_name}" ${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago. If they refer to "this document", "the file", or "it", they mean this uploaded document.`;
      }
    }
    
    const relevantHistory = (conversationHistory || [])
      .slice(-30) // Look at last 30 messages
      .filter((msg: any, idx: number, arr: any[]) => {
        // Always keep user messages (they provide context)
        if (msg.role === 'user') return true;
        
        // For assistant messages:
        // Skip the last 2 assistant messages to prevent repetition
        if (msg.role === 'assistant') {
          const isRecent = idx >= arr.length - 2;
          return !isRecent;
        }
        
        return false;
      })
      .slice(-6); // Keep only last 6 relevant messages (3 turns of conversation)

    let messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: currentContextMsg }, // Add explicit current context
      ...relevantHistory,
      { role: 'user', content: message } // Current user message
    ];

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
      // If routedIntent is provided, add it as context before the user message
      if (routedIntent) {
        // Insert routing context before the user message (which is already added)
        messages.splice(messages.length - 1, 0, {
          role: 'system',
          content: `CONTEXT: The routing layer has identified this intent: ${JSON.stringify(routedIntent)}. Use these extracted slots: ${JSON.stringify(routedIntent.slots)}`
        });
      }

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
              result = contactResult.data?.message || 'Contact not found';
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
              // Extract fileId from ALL Google Drive URL formats
              let fileId = args.file_id || '';
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
      const finalMessage = finalData.choices[0].message.content;

      return new Response(JSON.stringify({ 
        message: finalMessage,
        toolsUsed: aiMessage.tool_calls.map((tc: any) => tc.function.name)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      // No tools needed - just conversational response
      return new Response(JSON.stringify({ 
        message: aiMessage.content,
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

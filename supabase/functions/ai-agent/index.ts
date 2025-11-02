import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool definitions for the AI agent
const TOOLS = [
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a reminder for the user at a specific time. Use this when user asks to remind them of something.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind the user about" },
          due_time: { type: "string", description: "When to send the reminder in ISO 8601 format (Asia/Kolkata timezone)" }
        },
        required: ["text", "due_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "snooze_reminder",
      description: "Snooze the most recent active reminder by a specified duration",
      parameters: {
        type: "object",
        properties: {
          duration_minutes: { type: "number", description: "How many minutes to snooze (30 for 30 min, 60 for 1 hour, 1440 for 1 day)" }
        },
        required: ["duration_minutes"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_calendar",
      description: "Read calendar events for a specific date or date range. Use this when user asks about their schedule, meetings, or calendar.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date in ISO 8601 format" },
          end_date: { type: "string", description: "End date in ISO 8601 format (optional, defaults to same as start_date)" }
        },
        required: ["start_date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event. Use when user wants to schedule a meeting or block time.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start_time: { type: "string", description: "Start time in ISO 8601 format" },
          duration_minutes: { type: "number", description: "Duration in minutes (default 30)" },
          attendees: { type: "array", items: { type: "string" }, description: "Email addresses of attendees" }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update or reschedule an existing calendar event",
      parameters: {
        type: "object",
        properties: {
          event_title: { type: "string", description: "Title or partial title of event to update" },
          new_start_time: { type: "string", description: "New start time in ISO 8601 format" }
        },
        required: ["event_title", "new_start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete a calendar event",
      parameters: {
        type: "object",
        properties: {
          event_title: { type: "string", description: "Title or partial title of event to delete" }
        },
        required: ["event_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_calendar_by_person",
      description: "Find all calendar events with a specific person",
      parameters: {
        type: "object",
        properties: {
          person_name: { type: "string", description: "Name or email of the person" },
          start_date: { type: "string", description: "Start date for search (defaults to this week)" },
          end_date: { type: "string", description: "End date for search" }
        },
        required: ["person_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "summarize_emails",
      description: "Get a summary of unread emails. Use when user asks about their inbox or new emails.",
      parameters: {
        type: "object",
        properties: {
          max_count: { type: "number", description: "Maximum number of emails to summarize (default 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search for emails by sender name or email address, with optional time filtering. Use when user asks to find specific emails from someone.",
      parameters: {
        type: "object",
        properties: {
          sender_name: { type: "string", description: "Name or email of the sender to search for" },
          days_back: { type: "number", description: "How many days back to search (optional, e.g., 2 for 'last 2 days')" },
          max_results: { type: "number", description: "Maximum number of emails to return (default 5)" }
        },
        required: ["sender_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "mark_emails_read",
      description: "Mark all unread emails as read",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["all"], description: "Mark all emails as read" }
        },
        required: ["scope"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_email_draft",
      description: "Create an email draft for approval before sending. Use when user wants to send or reply to an email.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body content" },
          reply_to_message_id: { type: "string", description: "Message ID if this is a reply" }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_tasks",
      description: "Get all pending tasks from Google Tasks",
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
      description: "Create a new task in Google Tasks",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          notes: { type: "string", description: "Additional notes (optional)" },
          due_date: { type: "string", description: "Due date in ISO 8601 format (optional)" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Title or partial title of task to complete" }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task's title, notes, or due date",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Current title or partial title of task to update" },
          new_title: { type: "string", description: "New title for the task (optional)" },
          new_notes: { type: "string", description: "New notes for the task (optional)" },
          new_due_date: { type: "string", description: "New due date in ISO 8601 format (optional)" }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task permanently",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Title or partial title of task to delete" }
        },
        required: ["task_title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for information. Use for current events, news, weather, stock prices, or any information not in your knowledge base.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          search_type: { 
            type: "string", 
            enum: ["general", "specific"],
            description: "Use 'general' for news/weather/quick facts, 'specific' for detailed research" 
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
      description: "Find contact information for a person from Google Contacts",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name or email to search for" }
        },
        required: ["name"]
      }
    }
  }
];

const SYSTEM_PROMPT = `You are a helpful AI executive assistant integrated with WhatsApp. You help users manage their:
- Calendar (Google Calendar)
- Tasks (Google Tasks)
- Email (Gmail)
- Reminders (WhatsApp notifications)
- Contacts (Google Contacts)
- Web searches for current information

IMPORTANT GUIDELINES:
1. Be conversational and natural - don't sound robotic
2. Current date and time: ${new Date().toISOString()} (Asia/Kolkata timezone, UTC+5:30)
3. When interpreting times:
   - "tomorrow" = next day at 9 AM IST
   - "tomorrow morning" = next day at 9 AM IST
   - "tomorrow evening" = next day at 7 PM IST
   - "next week" = 7 days from now
4. Use tools proactively when users ask questions that require data
5. If user asks something that needs multiple actions, execute all relevant tools
6. Always confirm actions with clear, concise messages
7. For time-sensitive tasks, use ISO 8601 format: YYYY-MM-DDTHH:mm:ss+05:30

CONVERSATION STYLE:
- Friendly but professional
- Use emojis sparingly (calendar 📅, email 📧, task ✅, reminder ⏰)
- Keep responses concise (<200 words unless detailed info requested)
- If you need clarification, ask specific questions

EXAMPLES OF NATURAL CONVERSATION:
User: "Do I have anything tomorrow morning?"
You: Check calendar for tomorrow, respond with events or "You're free tomorrow morning!"

User: "Remind me to call mom at 7pm and also check my emails"
You: Create reminder AND summarize emails, respond to both

User: "What's the weather like in Mumbai?"
You: Search web for Mumbai weather, provide current conditions

User: "Can you reschedule my standup to 10:30?"
You: Update the standup event time, confirm the change`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId, conversationHistory, traceId } = await req.json();
    
    console.log(`[${traceId}] AI Agent processing: "${message.substring(0, 100)}..."`);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build conversation context
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(conversationHistory || []).slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

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
        tools: TOOLS,
        temperature: 0.7,
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error(`[${traceId}] AI Gateway error:`, errorText);
      throw new Error('AI Gateway error');
    }

    const aiData = await initialResponse.json();
    const aiMessage = aiData.choices[0].message;

    console.log(`[${traceId}] AI decision:`, JSON.stringify(aiMessage, null, 2));

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
                      start: args.new_start_time
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
              const deleteCalResult = await supabase.functions.invoke('handle-calendar', {
                body: { 
                  intent: { 
                    entities: { eventTitle: args.event_title },
                    tz: 'Asia/Kolkata'
                  }, 
                  userId, 
                  traceId,
                  action: 'delete'
                }
              });
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

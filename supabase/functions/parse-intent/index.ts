import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an AI intent parser for a personal executive assistant. Parse user messages into structured intents.

SUPPORTED INTENTS:
- reminder_create: WhatsApp native reminders
- gcal_create_event: Create calendar event
- gcal_read_events: Read calendar events
- gcal_modify_event: Modify calendar event
- gcal_delete_event: Delete calendar event
- gtask_create_task: Create a task
- gtask_read_tasks: Read tasks
- gmail_summarize_unread: Summarize unread emails (Primary tab only)
- gmail_mark_read: Mark emails as read (entities: messageIds array, or "all" for all unread)
- gmail_send: Send an email (requires: to, subject, body - will show draft for approval)
- gmail_reply: Reply to an email (requires: messageId, body - will show draft for approval)
- web_search: Search the web
- image_generation: Generate an image
- fallback: General conversation

ENTITY NORMALIZATION:
- Dates/times should be in ISO format with Asia/Kolkata timezone
- Attendees should be email addresses
- Tasks should include list name if mentioned

IMPORTANT: Be flexible with natural language. Users will phrase requests in many ways - understand the intent, not just exact phrases.

EXAMPLES:

REMINDERS:
User: "Remind me to call mom at 7 pm"
Response: {"type":"reminder_create","entities":{"text":"call mom","due_ts":"2025-11-02T19:00:00+05:30"},"confidence":0.95}

User: "Don't let me forget to buy milk tomorrow morning"
Response: {"type":"reminder_create","entities":{"text":"buy milk","due_ts":"2025-11-03T09:00:00+05:30"},"confidence":0.9}

CALENDAR:
User: "Block 30 mins tomorrow morning for weekly sync with Rohan"
Response: {"type":"gcal_create_event","entities":{"title":"Weekly sync with Rohan","duration":30,"start":"2025-11-03T09:00:00+05:30"},"confidence":0.9}

User: "What's on my calendar tomorrow?"
Response: {"type":"gcal_read_events","entities":{"date":"2025-11-03T00:00:00+05:30"},"confidence":0.95}

User: "Show me next week's meetings"
Response: {"type":"gcal_read_events","entities":{"timeMin":"2025-11-03T00:00:00+05:30","timeMax":"2025-11-10T23:59:59+05:30"},"confidence":0.9}

EMAIL:
User: "What's in my inbox?"
Response: {"type":"gmail_summarize_unread","entities":{"max":20},"confidence":0.95}

User: "Check my email"
Response: {"type":"gmail_summarize_unread","entities":{"max":20},"confidence":0.95}

User: "Any new emails?"
Response: {"type":"gmail_summarize_unread","entities":{"max":20},"confidence":0.95}

User: "Look at my unread messages"
Response: {"type":"gmail_summarize_unread","entities":{"max":20},"confidence":0.95}

User: "Mark all unread emails as read"
Response: {"type":"gmail_mark_read","entities":{"scope":"all"},"confidence":0.95}

User: "Clear my inbox"
Response: {"type":"gmail_mark_read","entities":{"scope":"all"},"confidence":0.9}

User: "Send email to john@example.com about meeting tomorrow"
Response: {"type":"gmail_send","entities":{"to":"john@example.com","subject":"Meeting Tomorrow","body":"Hi John, Let's discuss the meeting details for tomorrow."},"confidence":0.9}

FALLBACK:
User: "How are you?"
Response: {"type":"fallback","entities":{},"confidence":1.0,"response":"I'm doing great! I'm here to help you with reminders, calendar, emails, and tasks. What can I do for you?"}

Return ONLY valid JSON with: type, entities, confidence (0-1), and optional response for fallback.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, userId, traceId } = await req.json();
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    console.log(`[${traceId}] Parsing intent for: "${text}"`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${traceId}] AI Gateway error:`, response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          type: 'fallback',
          entities: {},
          confidence: 1.0,
          response: 'I\'m experiencing high demand right now. Please try again in a moment.'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    console.log(`[${traceId}] AI response:`, aiResponse);

    // Parse the JSON response
    let intent;
    try {
      intent = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error(`[${traceId}] Failed to parse AI response as JSON:`, parseError);
      intent = {
        type: 'fallback',
        entities: {},
        confidence: 0.5,
        response: "I understood your message, but I'm not quite sure how to help. Can you try rephrasing?"
      };
    }

    // Add metadata
    intent.source = 'user';
    intent.tz = 'Asia/Kolkata';
    intent.parsed_at = new Date().toISOString();

    return new Response(JSON.stringify(intent), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in parse-intent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      type: 'fallback',
      entities: {},
      confidence: 0.1,
      response: 'Sorry, I encountered an error. Please try again.',
      error: errorMessage
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

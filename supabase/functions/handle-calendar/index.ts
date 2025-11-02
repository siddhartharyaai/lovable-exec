import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(supabase: any, userId: string) {
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenData) {
    throw new Error('Google account not connected');
  }

  // Check if token is expired
  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    // Refresh token
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    if (refreshResult.error || !refreshResult.data?.access_token) {
      throw new Error('Failed to refresh token');
    }
    
    return refreshResult.data.access_token;
  }

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { intent, userId, traceId, action } = await req.json();
    
    console.log(`[${traceId}] Calendar action: ${action}`, intent?.type);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId);
    let message = '';

    switch (action) {
      case 'create': {
        const { title, start, duration, attendees, description } = intent.entities;
        
        // Calculate end time
        const startTime = new Date(start);
        const endTime = new Date(startTime.getTime() + (duration || 30) * 60000);

        const event = {
          summary: title,
          start: { dateTime: startTime.toISOString(), timeZone: intent.tz || 'Asia/Kolkata' },
          end: { dateTime: endTime.toISOString(), timeZone: intent.tz || 'Asia/Kolkata' },
          description: description || '',
          attendees: attendees ? attendees.map((email: string) => ({ email })) : [],
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${traceId}] Calendar create error:`, errorText);
          throw new Error('Failed to create calendar event');
        }

        const createdEvent = await response.json();
        message = `📅 Event created: **${title}** on ${startTime.toLocaleString('en-IN', { 
          dateStyle: 'medium', 
          timeStyle: 'short',
          timeZone: intent.tz || 'Asia/Kolkata'
        })}`;
        
        if (attendees?.length) {
          message += `\n👥 Attendees: ${attendees.join(', ')}`;
        }
        
        break;
      }

      case 'read': {
        const { timeMin, timeMax, maxResults } = intent.entities;
        
        // Default to today's events
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const endOfDay = new Date(now.setHours(23, 59, 59, 999));

        const params = new URLSearchParams({
          timeMin: (timeMin || startOfDay.toISOString()),
          timeMax: (timeMax || endOfDay.toISOString()),
          maxResults: String(maxResults || 10),
          orderBy: 'startTime',
          singleEvents: 'true',
        });

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch calendar events');
        }

        const data = await response.json();
        const events = data.items || [];

        if (events.length === 0) {
          message = '📅 No events found for the requested time period.';
        } else {
          message = `📅 **Your Events:**\n\n`;
          events.forEach((event: any, i: number) => {
            const start = new Date(event.start.dateTime || event.start.date);
            const timeStr = event.start.dateTime 
              ? start.toLocaleString('en-IN', { 
                  dateStyle: 'short', 
                  timeStyle: 'short',
                  timeZone: intent.tz || 'Asia/Kolkata'
                })
              : start.toLocaleDateString('en-IN');
            
            message += `${i + 1}. **${event.summary}**\n   ${timeStr}\n`;
            if (event.attendees?.length) {
              message += `   👥 ${event.attendees.length} attendee(s)\n`;
            }
            message += '\n';
          });
        }
        break;
      }

      default:
        message = 'Calendar action not yet implemented';
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-calendar:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `Failed to process calendar request: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
        
        if (!title || !start) {
          return new Response(JSON.stringify({ 
            message: "I need at least a title and time. Try: 'Schedule meeting tomorrow at 3pm'"
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Calculate end time
        const startTime = new Date(start);
        const endTime = new Date(startTime.getTime() + (duration || 30) * 60000);

        // Check for conflicts
        console.log(`[${traceId}] Checking for conflicts from ${startTime.toISOString()} to ${endTime.toISOString()}`);
        
        const conflictParams = new URLSearchParams({
          timeMin: startTime.toISOString(),
          timeMax: endTime.toISOString(),
          singleEvents: 'true',
        });

        const conflictResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${conflictParams}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        if (conflictResponse.ok) {
          const conflictData = await conflictResponse.json();
          const conflicts = conflictData.items || [];
          
          if (conflicts.length > 0) {
            console.log(`[${traceId}] Found ${conflicts.length} conflicting event(s)`);
            const conflictList = conflicts.map((e: any) => {
              const cStart = new Date(e.start.dateTime || e.start.date);
              const cTime = cStart.toLocaleString('en-GB', { 
                timeZone: 'Asia/Kolkata',
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              });
              return `• ${e.summary} at ${cTime}`;
            }).join('\n');
            
            message = `⚠️ **Time Conflict Detected!**\n\nYou already have:\n${conflictList}\n\nat that time.\n\nWould you like to:\n1. Reschedule the new event\n2. Reschedule the existing event(s)\n3. Create anyway`;
            
            return new Response(JSON.stringify({ message }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

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
        const { timeMin, timeMax, maxResults, date } = intent.entities;
        
        let startTime: string;
        let endTime: string;

        // If a specific date is provided, use that
        if (date) {
          console.log(`[${traceId}] Using date from intent:`, date);
          
          // Extract the date part from ISO string (e.g., "2025-11-03T00:00:00+05:30" -> "2025-11-03")
          const dateMatch = date.match(/^(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            const datePart = dateMatch[1];
            // Construct start and end of day in IST timezone
            startTime = `${datePart}T00:00:00+05:30`;
            endTime = `${datePart}T23:59:59+05:30`;
          } else {
            throw new Error('Invalid date format');
          }
        } else if (timeMin && timeMax) {
          // Use explicit time range if provided
          startTime = timeMin;
          endTime = timeMax;
        } else {
          // Default to today's events in IST
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const datePart = `${year}-${month}-${day}`;
          startTime = `${datePart}T00:00:00+05:30`;
          endTime = `${datePart}T23:59:59+05:30`;
        }

        console.log(`[${traceId}] Fetching events from ${startTime} to ${endTime}`);

        const params = new URLSearchParams({
          timeMin: new Date(startTime).toISOString(),
          timeMax: new Date(endTime).toISOString(),
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

        console.log(`[${traceId}] Found ${events.length} events`);

        if (events.length === 0) {
          message = '📅 No events found for the requested time period.';
        } else {
          message = `📅 **Your Events:**\n\n`;
          events.forEach((event: any, i: number) => {
            const start = new Date(event.start.dateTime || event.start.date);
            console.log(`[${traceId}] Event ${i+1} start:`, event.start.dateTime || event.start.date);
            
            const timeStr = event.start.dateTime 
              ? start.toLocaleString('en-GB', { 
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: intent.tz || 'Asia/Kolkata'
                })
              : start.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit'
                });
            
            message += `${i + 1}. **${event.summary}**\n   ${timeStr}\n`;
            if (event.attendees?.length) {
              message += `   👥 ${event.attendees.length} attendee(s)\n`;
            }
            message += '\n';
          });
        }
        break;
      }

      case 'update': {
        const { eventId, title, start, duration, eventTitle } = intent.entities;
        
        // If we have eventTitle but no eventId, search for the event
        let targetEventId = eventId;
        
        if (!targetEventId && eventTitle) {
          console.log(`[${traceId}] Searching for event: ${eventTitle}`);
          
          // Search for events in the next 30 days
          const searchStart = new Date();
          const searchEnd = new Date();
          searchEnd.setDate(searchEnd.getDate() + 30);
          
          const searchParams = new URLSearchParams({
            timeMin: searchStart.toISOString(),
            timeMax: searchEnd.toISOString(),
            q: eventTitle,
            singleEvents: 'true',
          });
          
          const searchResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${searchParams}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const matchingEvents = searchData.items || [];
            
            if (matchingEvents.length > 0) {
              targetEventId = matchingEvents[0].id;
              console.log(`[${traceId}] Found event ID: ${targetEventId}`);
            }
          }
        }
        
        if (!targetEventId) {
          message = "I couldn't find that event. Please be more specific about which event to update.";
          break;
        }
        
        // Fetch the existing event
        const getResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (!getResponse.ok) {
          message = "I couldn't find that event in your calendar.";
          break;
        }
        
        const existingEvent = await getResponse.json();
        
        // Prepare update payload
        const updatePayload: any = {
          summary: title || existingEvent.summary,
          description: existingEvent.description,
          attendees: existingEvent.attendees,
        };
        
        // Update start/end time if provided
        if (start) {
          const startTime = new Date(start);
          const endTime = new Date(startTime.getTime() + (duration || 30) * 60000);
          
          updatePayload.start = { 
            dateTime: startTime.toISOString(), 
            timeZone: intent.tz || 'Asia/Kolkata' 
          };
          updatePayload.end = { 
            dateTime: endTime.toISOString(), 
            timeZone: intent.tz || 'Asia/Kolkata' 
          };
        } else {
          updatePayload.start = existingEvent.start;
          updatePayload.end = existingEvent.end;
        }
        
        // Update the event
        const updateResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          }
        );
        
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error(`[${traceId}] Calendar update error:`, errorText);
          throw new Error('Failed to update calendar event');
        }
        
        const updatedEvent = await updateResponse.json();
        const displayTime = start 
          ? new Date(start).toLocaleString('en-IN', { 
              dateStyle: 'medium', 
              timeStyle: 'short',
              timeZone: intent.tz || 'Asia/Kolkata'
            })
          : '';
        
        message = `✅ Updated: **${updatePayload.summary}**${displayTime ? ' to ' + displayTime : ''}`;
        break;
      }

      case 'read_by_person': {
        const { attendee_name, timeMin, timeMax } = intent.entities;
        
        if (!attendee_name) {
          message = "Please specify whose meetings to show (e.g., 'Show meetings with Priya')";
          break;
        }

        let startTime: string;
        let endTime: string;

        if (timeMin && timeMax) {
          startTime = timeMin;
          endTime = timeMax;
        } else {
          // Default to this week
          const now = new Date();
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7);
          
          startTime = weekStart.toISOString();
          endTime = weekEnd.toISOString();
        }

        console.log(`[${traceId}] Fetching events with ${attendee_name} from ${startTime} to ${endTime}`);

        const params = new URLSearchParams({
          timeMin: new Date(startTime).toISOString(),
          timeMax: new Date(endTime).toISOString(),
          q: attendee_name,
          singleEvents: 'true',
          orderBy: 'startTime',
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
        const events = (data.items || []).filter((event: any) => {
          if (!event.attendees) return false;
          return event.attendees.some((att: any) => 
            att.email?.toLowerCase().includes(attendee_name.toLowerCase()) ||
            att.displayName?.toLowerCase().includes(attendee_name.toLowerCase())
          );
        });

        console.log(`[${traceId}] Found ${events.length} events with ${attendee_name}`);

        if (events.length === 0) {
          message = `📅 No meetings found with **${attendee_name}** in the specified time period.`;
        } else {
          message = `📅 **Meetings with ${attendee_name}** (${events.length} found)\n\n`;
          events.forEach((event: any, i: number) => {
            const start = new Date(event.start.dateTime || event.start.date);
            const timeStr = event.start.dateTime 
              ? start.toLocaleString('en-GB', { 
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: intent.tz || 'Asia/Kolkata'
                })
              : start.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit'
                });
            
            message += `${i + 1}. **${event.summary}**\n   ${timeStr}\n`;
            if (event.attendees?.length) {
              message += `   👥 ${event.attendees.length} attendee(s)\n`;
            }
            message += '\n';
          });
        }
        break;
      }

      case 'delete': {
        const { eventId, eventTitle } = intent.entities;
        
        // If we have eventTitle but no eventId, search for the event
        let targetEventId = eventId;
        
        if (!targetEventId && eventTitle) {
          console.log(`[${traceId}] Searching for event to delete: ${eventTitle}`);
          
          // Search for events in the next 30 days
          const searchStart = new Date();
          const searchEnd = new Date();
          searchEnd.setDate(searchEnd.getDate() + 30);
          
          const searchParams = new URLSearchParams({
            timeMin: searchStart.toISOString(),
            timeMax: searchEnd.toISOString(),
            q: eventTitle,
            singleEvents: 'true',
          });
          
          const searchResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?${searchParams}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const matchingEvents = searchData.items || [];
            
            if (matchingEvents.length > 0) {
              targetEventId = matchingEvents[0].id;
              console.log(`[${traceId}] Found event ID to delete: ${targetEventId}`);
            }
          }
        }
        
        if (!targetEventId) {
          message = "I couldn't find that event. Please be more specific about which event to delete.";
          break;
        }
        
        // Fetch the event details before deleting (for confirmation message)
        const getResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        let eventName = eventTitle || 'event';
        if (getResponse.ok) {
          const eventData = await getResponse.json();
          eventName = eventData.summary || eventName;
        }
        
        // Delete the event
        const deleteResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${targetEventId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );
        
        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          console.error(`[${traceId}] Calendar delete error:`, errorText);
          throw new Error('Failed to delete calendar event');
        }
        
        message = `🗑️ Deleted: **${eventName}**`;
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

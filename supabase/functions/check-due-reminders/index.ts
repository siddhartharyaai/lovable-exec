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

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] Checking due reminders...`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pending reminders that are due
    const { data: reminders, error } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('due_ts', new Date().toISOString())
      .order('due_ts', { ascending: true });

    if (error) {
      console.error(`[${traceId}] Error fetching reminders:`, error);
      throw error;
    }

    console.log(`[${traceId}] Found ${reminders?.length || 0} due reminders`);

    let processed = 0;
    let failed = 0;

    for (const reminder of reminders || []) {
      try {
        console.log(`[${traceId}] Reminder picked up: id=${reminder.id}, user=${reminder.user_id}, due_at=${reminder.due_ts}`);
        
        const message = `⏰ **Reminder**\n\n${reminder.text}`;
        
        const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
          body: { userId: reminder.user_id, message, traceId }
        });

        if (sendError) {
          console.error(`[${traceId}] Failed to send reminder ${reminder.id}:`, sendError);
          
          // Update status to failed
          await supabase
            .from('reminders')
            .update({ 
              status: 'failed',
              last_attempt_ts: new Date().toISOString(),
            })
            .eq('id', reminder.id);
          
          failed++;
        } else {
          console.log(`[${traceId}] Reminder SENT once for reminder_id=${reminder.id}, user=${reminder.user_id}`);
          
          // Update status to sent
          await supabase
            .from('reminders')
            .update({ 
              status: 'sent',
              last_attempt_ts: new Date().toISOString(),
            })
            .eq('id', reminder.id);
          
          processed++;
        }
      } catch (reminderError) {
        console.error(`[${traceId}] Error processing reminder ${reminder.id}:`, reminderError);
        failed++;
      }
    }

    console.log(`[${traceId}] Processed ${processed} reminders, ${failed} failed`);

    // Check for upcoming calendar events (15 minutes before)
    const fifteenMinutesFromNow = new Date(Date.now() + 15 * 60 * 1000);
    const twentyMinutesFromNow = new Date(Date.now() + 20 * 60 * 1000);
    
    // Get all users with OAuth tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('user_id, access_token, refresh_token, expires_at, provider')
      .eq('provider', 'google');
    
    if (tokens && tokens.length > 0) {
      for (const tokenData of tokens) {
        try {
          let accessToken = tokenData.access_token;
          
          // Check if token is expired
          const expiresAt = new Date(tokenData.expires_at);
          if (expiresAt <= new Date()) {
            // Token expired, try to refresh
            const refreshResult = await supabase.functions.invoke('refresh-google-token', {
              body: { userId: tokenData.user_id }
            });
            
            if (refreshResult.error || !refreshResult.data?.access_token) {
              console.error(`[${traceId}] Failed to refresh token for user ${tokenData.user_id}`);
              continue;
            }
            
            accessToken = refreshResult.data.access_token;
          }
          
          // Fetch upcoming events
          const eventResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            `timeMin=${fifteenMinutesFromNow.toISOString()}&` +
            `timeMax=${twentyMinutesFromNow.toISOString()}&` +
            `singleEvents=true&orderBy=startTime`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          
          if (eventResponse.ok) {
            const eventData = await eventResponse.json();
            const upcomingEvents = eventData.items || [];
            
            for (const event of upcomingEvents) {
              const eventStart = new Date(event.start.dateTime || event.start.date);
              const timeUntilEvent = Math.round((eventStart.getTime() - Date.now()) / 60000);
              
              // Only send if it's close to 15 minutes
              if (timeUntilEvent >= 14 && timeUntilEvent <= 16) {
                const eventId = event.id;
                const eventStartTime = eventStart.toISOString();
                
                // Check if we've already sent a notification for this event
                const { data: existingNotification } = await supabase
                  .from('calendar_notifications')
                  .select('id')
                  .eq('user_id', tokenData.user_id)
                  .eq('event_id', eventId)
                  .eq('event_start_time', eventStartTime)
                  .maybeSingle();
                
                if (existingNotification) {
                  console.log(`[${traceId}] Calendar notification SKIPPED (already sent) for event_id=${eventId}, user=${tokenData.user_id}`);
                  continue;
                }
                
                const eventTime = eventStart.toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });
                
                const message = `📅 **Upcoming Event in 15 minutes!**\n\n*${event.summary}*\n${eventTime} IST${event.location ? `\n📍 ${event.location}` : ''}`;
                
                const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
                  body: { userId: tokenData.user_id, message, traceId }
                });
                
                if (!sendError) {
                  // Record that we sent this notification
                  await supabase
                    .from('calendar_notifications')
                    .insert({
                      user_id: tokenData.user_id,
                      event_id: eventId,
                      event_start_time: eventStartTime
                    });
                  
                  console.log(`[${traceId}] Calendar notification SENT once for event_id=${eventId}, user=${tokenData.user_id}, event="${event.summary}"`);
                } else {
                  console.error(`[${traceId}] Failed to send calendar notification for event ${eventId}:`, sendError);
                }
              }
            }
          }
        } catch (eventError) {
          console.error(`[${traceId}] Error checking events for user:`, eventError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed,
      failed,
      total: reminders?.length || 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error in check-due-reminders:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

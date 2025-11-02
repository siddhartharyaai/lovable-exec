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

  try {
    const { intent, userId, traceId, action } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle snooze action
    if (action === 'snooze') {
      const { snooze_duration } = intent.entities;
      
      if (!snooze_duration) {
        return new Response(JSON.stringify({ 
          message: "Please specify how long to snooze (e.g., '30 minutes', '1 hour')"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the most recent pending reminder for this user
      const { data: reminders, error: fetchError } = await supabase
        .from('reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_ts', { ascending: true })
        .limit(1);

      if (fetchError || !reminders || reminders.length === 0) {
        return new Response(JSON.stringify({ 
          message: "❌ No active reminder to snooze." 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const reminder = reminders[0];
      
      // Parse snooze duration
      let snoozeMinutes = 30; // default
      const duration = snooze_duration.toLowerCase();
      
      if (duration.includes('hour')) {
        const hours = parseInt(duration) || 1;
        snoozeMinutes = hours * 60;
      } else if (duration.includes('minute')) {
        snoozeMinutes = parseInt(duration) || 30;
      } else if (duration.includes('day')) {
        const days = parseInt(duration) || 1;
        snoozeMinutes = days * 24 * 60;
      }

      // Calculate new due time
      const currentDue = new Date(reminder.due_ts);
      const newDue = new Date(currentDue.getTime() + snoozeMinutes * 60000);

      // Update reminder
      const { error: updateError } = await supabase
        .from('reminders')
        .update({ due_ts: newDue.toISOString() })
        .eq('id', reminder.id);

      if (updateError) {
        console.error(`[${traceId}] Snooze update error:`, updateError);
        throw new Error('Failed to snooze reminder');
      }

      const timeStr = newDue.toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short'
      });

      const message = `⏰ Reminder snoozed! I'll remind you at *${timeStr} IST*:\n\n"${reminder.text}"`;

      return new Response(JSON.stringify({ message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle create action (existing logic)
    const { text, due_ts } = intent.entities;

    if (!text || !due_ts) {
      return new Response(JSON.stringify({ 
        message: "I need both what to remind you about and when. Try: 'Remind me to call John at 3pm'"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${traceId}] Creating reminder: ${text} at ${due_ts}`);

    // Check for duplicate reminders
    const { data: existingReminders, error: checkError } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .eq('text', text)
      .eq('status', 'pending')
      .gte('due_ts', new Date(Date.now() - 3600000).toISOString()) // Within 1 hour
      .lte('due_ts', new Date(Date.now() + 3600000).toISOString());

    if (existingReminders && existingReminders.length > 0) {
      const existing = existingReminders[0];
      const existingTime = new Date(existing.due_ts).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        day: 'numeric',
        month: 'short'
      });
      
      const message = `⚠️ You already have a similar reminder:\n\n"${existing.text}"\nat *${existingTime} IST*\n\nWould you like to create this duplicate anyway?`;
      
      return new Response(JSON.stringify({ message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert reminder
    const { error } = await supabase
      .from('reminders')
      .insert({
        user_id: userId,
        text,
        due_ts,
        status: 'pending',
      });

    if (error) {
      console.error(`[${traceId}] Reminder insert error:`, error);
      throw new Error('Failed to create reminder');
    }

    // Format the due time nicely
    const dueDate = new Date(due_ts);
    const timeStr = dueDate.toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'short'
    });

    const message = `⏰ Got it! I'll remind you at *${timeStr} IST*:\n\n"${text}"`;

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-reminder:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: '❌ Sorry, I couldn\'t create that reminder. Please try again.',
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

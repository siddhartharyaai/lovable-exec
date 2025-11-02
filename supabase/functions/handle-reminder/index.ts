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
    const { intent, userId, traceId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { text, due_ts } = intent.entities;

    if (!text || !due_ts) {
      return new Response(JSON.stringify({ 
        message: "I need both what to remind you about and when. Try: 'Remind me to call John at 3pm'"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[${traceId}] Creating reminder: ${text} at ${due_ts}`);

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

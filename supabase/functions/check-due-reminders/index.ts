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

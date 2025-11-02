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
    return null;
  }

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    if (refreshResult.error || !refreshResult.data?.access_token) {
      return null;
    }
    
    return refreshResult.data.access_token;
  }

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();
  console.log(`[${traceId}] Checking birthday reminders...`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all users with Google OAuth tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('oauth_tokens')
      .select('user_id, access_token, refresh_token, expires_at, provider')
      .eq('provider', 'google');

    if (!tokens || tokens.length === 0) {
      console.log(`[${traceId}] No users with Google tokens found`);
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    let failed = 0;

    // Get tomorrow's date in IST
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowMonth = tomorrow.getMonth() + 1; // 1-12
    const tomorrowDay = tomorrow.getDate();

    console.log(`[${traceId}] Checking birthdays for: ${tomorrowMonth}/${tomorrowDay}`);

    for (const tokenData of tokens) {
      try {
        const accessToken = await getAccessToken(supabase, tokenData.user_id);
        
        if (!accessToken) {
          console.log(`[${traceId}] No valid token for user ${tokenData.user_id}`);
          failed++;
          continue;
        }

        // Fetch contacts from People API
        const peopleResponse = await fetch(
          'https://people.googleapis.com/v1/people/me/connections?personFields=names,birthdays&pageSize=1000',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!peopleResponse.ok) {
          console.error(`[${traceId}] People API error for user ${tokenData.user_id}`);
          failed++;
          continue;
        }

        const peopleData = await peopleResponse.json();
        const connections = peopleData.connections || [];
        
        // Filter for tomorrow's birthdays
        const tomorrowBirthdays = connections.filter((person: any) => {
          if (!person.birthdays || person.birthdays.length === 0) return false;
          
          const birthday = person.birthdays[0].date;
          if (!birthday) return false;
          
          // Match month and day (ignore year)
          return birthday.month === tomorrowMonth && birthday.day === tomorrowDay;
        }).map((person: any) => {
          const name = person.names?.[0]?.displayName || 'Someone';
          return name;
        });

        if (tomorrowBirthdays.length === 0) {
          console.log(`[${traceId}] No birthdays tomorrow for user ${tokenData.user_id}`);
          continue;
        }

        // Send birthday reminder
        const birthdayList = tomorrowBirthdays.map((name: string) => `• ${name}`).join('\n');
        const message = `🎂 **Birthday Reminder**\n\nTomorrow's birthdays:\n${birthdayList}\n\nDon't forget to wish them! 🎉`;

        const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
          body: { userId: tokenData.user_id, message, traceId }
        });

        if (sendError) {
          console.error(`[${traceId}] Failed to send birthday reminder to user ${tokenData.user_id}:`, sendError);
          failed++;
        } else {
          console.log(`[${traceId}] Sent birthday reminder to user ${tokenData.user_id} for ${tomorrowBirthdays.length} contact(s)`);
          sent++;
        }

      } catch (userError) {
        console.error(`[${traceId}] Error checking birthdays for user:`, userError);
        failed++;
      }
    }

    console.log(`[${traceId}] Birthday reminders complete: ${sent} sent, ${failed} failed`);

    return new Response(JSON.stringify({ 
      success: true,
      sent,
      failed,
      total: tokens.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error in check-birthday-reminders:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
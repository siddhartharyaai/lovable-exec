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
  console.log(`[${traceId}] === DAILY BRIEFING v2.0 WITH CITY & GMAIL LOGGING === Generating daily briefings...`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

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

    for (const tokenData of tokens) {
      try {
        const accessToken = await getAccessToken(supabase, tokenData.user_id);
        
        if (!accessToken) {
          console.log(`[${traceId}] No valid token for user ${tokenData.user_id}`);
          failed++;
          continue;
        }

        // Verify Gmail account being used
        console.log(`[${traceId}] Fetching Gmail account info for user ${tokenData.user_id}`);
        const userinfoResponse = await fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        
        if (userinfoResponse.ok) {
          const userinfoData = await userinfoResponse.json();
          console.log(`[${traceId}] Using Gmail account: ${userinfoData.email} (${userinfoData.name})`);
        } else {
          console.log(`[${traceId}] Could not fetch Gmail account info`);
        }

        // Collect data for briefing
        const briefingData: any = {
          calendar: [],
          tasks: [],
          emails: 0,
          reminders: []
        };

        // Fetch today's calendar events
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const calResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `timeMin=${todayStart.toISOString()}&` +
          `timeMax=${todayEnd.toISOString()}&` +
          `singleEvents=true&orderBy=startTime`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (calResponse.ok) {
          const calData = await calResponse.json();
          briefingData.calendar = (calData.items || []).slice(0, 5).map((event: any) => ({
            title: event.summary,
            time: new Date(event.start.dateTime || event.start.date).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            location: event.location
          }));
        }

        // Fetch pending tasks
        const tasksListResponse = await fetch(
          'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (tasksListResponse.ok) {
          const listData = await tasksListResponse.json();
          const lists = listData.items || [];
          
          for (const list of lists.slice(0, 2)) {
            const tasksResponse = await fetch(
              `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`,
              {
                headers: { 'Authorization': `Bearer ${accessToken}` },
              }
            );
            
            if (tasksResponse.ok) {
              const tasksData = await tasksResponse.json();
              const tasks = tasksData.items || [];
              briefingData.tasks.push(...tasks.slice(0, 3).map((task: any) => ({
                title: task.title,
                due: task.due ? new Date(task.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
              })));
            }
          }
        }

        // Fetch LIVE unread email count and top subjects  
        const gmailQuery = 'in:inbox is:unread';
        console.log(`[${traceId}] Fetching unread emails with q=${gmailQuery}&maxResults=10`);
        const gmailResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=10`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (gmailResponse.ok) {
          const gmailData = await gmailResponse.json();
          const unreadCount = gmailData.resultSizeEstimate || 0;
          briefingData.emails = unreadCount;
          
          console.log(`[${traceId}] Gmail API returned ${unreadCount} unread emails, ${(gmailData.messages || []).length} message IDs`);
          
          // Fetch details of top 3 unread emails for the briefing
          briefingData.topUnreadEmails = [];
          const messages = gmailData.messages || [];
          
          for (const msg of messages.slice(0, 3)) {
            try {
              console.log(`[${traceId}] Fetching details for message id=${msg.id}`);
              const msgResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
                {
                  headers: { 'Authorization': `Bearer ${accessToken}` },
                }
              );
              
              if (msgResponse.ok) {
                const msgData = await msgResponse.json();
                const headers = msgData.payload?.headers || [];
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
                const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
                
                briefingData.topUnreadEmails.push({ subject, from });
                console.log(`[${traceId}] Extracted email: "${subject}" from ${from}`);
              }
            } catch (msgError) {
              console.error(`[${traceId}] Error fetching email details:`, msgError);
            }
          }
          
          console.log(`[${traceId}] Daily briefing: LIVE unread email count for user ${tokenData.user_id}: ${unreadCount}, top emails extracted: ${briefingData.topUnreadEmails.length}`);
        }

        // Fetch today's reminders
        const { data: reminders } = await supabase
          .from('reminders')
          .select('text, due_ts')
          .eq('user_id', tokenData.user_id)
          .eq('status', 'pending')
          .gte('due_ts', todayStart.toISOString())
          .lte('due_ts', todayEnd.toISOString())
          .order('due_ts', { ascending: true })
          .limit(3);

        if (reminders) {
          briefingData.reminders = reminders.map((r: any) => ({
            text: r.text,
            time: new Date(r.due_ts).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })
          }));
        }

        // Get user's city for weather
        const { data: userData } = await supabase
          .from('users')
          .select('city')
          .eq('id', tokenData.user_id)
          .single();

        const userCity = userData?.city || 'Mumbai';
        briefingData.city = userCity;
        console.log(`[${traceId}] User city from database: ${userData?.city || 'NULL'}, using city: ${userCity}`);

        // Fetch weather forecast using SERP API
        const serpApiKey = Deno.env.get('SERP_API_KEY');
        let weatherInfo = null;
        
        if (serpApiKey) {
          try {
            const weatherResponse = await fetch(
              `https://serpapi.com/search.json?engine=google&q=weather+${encodeURIComponent(userCity)}+today&api_key=${serpApiKey}`
            );
            
            if (weatherResponse.ok) {
              const weatherData = await weatherResponse.json();
              const answerBox = weatherData.answer_box;
              
              if (answerBox) {
                weatherInfo = {
                  temp: answerBox.temperature || 'N/A',
                  condition: answerBox.weather || answerBox.precipitation || 'Unknown',
                  humidity: answerBox.humidity || 'N/A'
                };
              }
            }
          } catch (weatherError) {
            console.error(`[${traceId}] Weather fetch error:`, weatherError);
          }
        }

        // Fetch top 5 news headlines using SERP API
        let newsHeadlines: string[] = [];
        
        if (serpApiKey) {
          try {
            const newsResponse = await fetch(
              `https://serpapi.com/search.json?engine=google_news&q=top+news+India+today&api_key=${serpApiKey}`
            );
            
            if (newsResponse.ok) {
              const newsData = await newsResponse.json();
              const newsResults = newsData.news_results || [];
              
              newsHeadlines = newsResults.slice(0, 5).map((item: any) => 
                item.title || item.snippet || ''
              ).filter((h: string) => h.length > 0);
            }
          } catch (newsError) {
            console.error(`[${traceId}] News fetch error:`, newsError);
          }
        }

        // Generate AI-powered briefing
        const briefingPrompt = `Create a concise morning briefing (max 1500 chars) for today based on:

${weatherInfo ? `Weather in ${userCity}: ${weatherInfo.temp} (use Celsius with °C), ${weatherInfo.condition}, Humidity: ${weatherInfo.humidity}` : ''}

${newsHeadlines.length > 0 ? `Top News Headlines:\n${newsHeadlines.map((h: string, i: number) => `${i + 1}. ${h}`).join('\n')}` : ''}

Calendar (${briefingData.calendar.length} events):
${briefingData.calendar.map((e: any) => `• ${e.title} at ${e.time}${e.location ? ` (${e.location})` : ''}`).join('\n')}

Tasks (${briefingData.tasks.length} pending):
${briefingData.tasks.map((t: any) => `• ${t.title}${t.due ? ` - due ${t.due}` : ''}`).join('\n')}

Emails: ${briefingData.emails} unread
${briefingData.topUnreadEmails && briefingData.topUnreadEmails.length > 0 ? `Top unread:\n${briefingData.topUnreadEmails.map((e: any, i: number) => `${i + 1}. "${e.subject}" from ${e.from}`).join('\n')}` : ''}

Reminders (${briefingData.reminders.length} today):
${briefingData.reminders.map((r: any) => `• ${r.text} at ${r.time}`).join('\n')}

CRITICAL FORMATTING RULES:
- Use Celsius (°C) for all temperatures, NEVER Fahrenheit
- Use IST timezone for all times
- Format with emojis (🌤️ for weather, 📰 for news, 📅 for calendar, ✅ for tasks, 📧 for emails, ⏰ for reminders)
- Start with weather, then news headlines (1 line each), then calendar, tasks, emails (mention count and optionally 1-2 notable subjects), and reminders
- Be encouraging, warm, and actionable - like a caring personal assistant
- Keep it conversational and friendly, not robotic`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { 
                role: 'system', 
                content: 'You are Man Friday, a warm and empathetic executive assistant creating morning briefings. Be concise, encouraging, and actionable. CRITICAL: Always use Celsius (°C) for temperatures and IST for times. Be conversational and friendly, not robotic.' 
              },
              { role: 'user', content: briefingPrompt }
            ],
            temperature: 0.5,
            max_tokens: 400,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('AI briefing generation failed');
        }

        const aiData = await aiResponse.json();
        const briefingMessage = `☀️ **Good Morning! Your Daily Briefing**\n\n${aiData.choices[0].message.content}`;

        console.log(`[${traceId}] Generated briefing (${briefingMessage.length} chars): ${briefingMessage.substring(0, 200)}...`);

        // Send briefing via WhatsApp
        const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
          body: { userId: tokenData.user_id, message: briefingMessage, traceId }
        });

        if (sendError) {
          console.error(`[${traceId}] Failed to send briefing to user ${tokenData.user_id}:`, sendError);
          failed++;
        } else {
          console.log(`[${traceId}] Sent briefing to user ${tokenData.user_id}`);
          sent++;
        }

      } catch (userError) {
        console.error(`[${traceId}] Error generating briefing for user:`, userError);
        failed++;
      }
    }

    console.log(`[${traceId}] Daily briefings complete: ${sent} sent, ${failed} failed`);

    return new Response(JSON.stringify({ 
      success: true,
      sent,
      failed,
      total: tokens.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${traceId}] Error in daily-briefing:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
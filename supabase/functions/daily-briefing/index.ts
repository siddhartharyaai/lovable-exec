import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pure function to render daily briefing (deterministic, no LLM)
function renderDailyBriefing({
  todayDisplay,
  weatherInfo,
  calendar,
  tasks,
  emailsUnread,
  topUnreadEmails,
  reminders,
}: {
  todayDisplay: string;
  weatherInfo: { city: string; highC: string; lowC: string; description: string; humidity: string } | null;
  calendar: Array<{ title: string; time: string; location?: string }>;
  tasks: Array<{ title: string; due?: string | null }>;
  emailsUnread: number;
  topUnreadEmails: Array<{ subject: string; from: string }>;
  reminders: Array<{ text: string; time: string }>;
}): string {
  let message = `🌅 *Good morning. Your Daily Briefing*\n\n`;
  message += `Here's your briefing for today, ${todayDisplay}.\n\n`;

  // 1. Weather (always show section)
  if (weatherInfo) {
    message += `🌤️ *Weather*: ${weatherInfo.city}, ${weatherInfo.highC}, ${weatherInfo.description}`;
    if (weatherInfo.humidity) {
      message += `, Humidity ${weatherInfo.humidity}`;
    }
    message += `.\n\n`;
  } else {
    message += `🌤️ *Weather*: No weather data available for today.\n\n`;
  }

  // 2. Calendar (always show section)
  message += `📅 *Calendar*:`;
  if (calendar.length > 0) {
    message += `\n`;
    calendar.forEach((event) => {
      message += `• ${event.time} – ${event.title}`;
      if (event.location) {
        message += ` (${event.location})`;
      }
      message += `\n`;
    });
  } else {
    message += ` No events on your calendar today.`;
  }
  message += `\n`;

  // 3. Pending Tasks (always show section)
  message += `✅ *Pending Tasks*:`;
  if (tasks.length > 0) {
    message += `\n`;
    tasks.slice(0, 5).forEach((task, i) => {
      message += `${i + 1}. ${task.title}`;
      if (task.due) {
        message += ` (due ${task.due})`;
      }
      message += `\n`;
    });
  } else {
    message += ` You're all caught up – no pending tasks.`;
  }
  message += `\n`;

  // 4. Emails (always show section)
  message += `📧 *Emails*: You have ${emailsUnread} unread email${emailsUnread !== 1 ? 's' : ''}.`;
  if (topUnreadEmails && topUnreadEmails.length > 0) {
    message += `\n*Top unread:*\n`;
    topUnreadEmails.forEach((email, i) => {
      message += `${i + 1}. "${email.subject}" from ${email.from}\n`;
    });
  } else {
    message += `\n`;
  }
  message += `\n`;

  // 5. Reminders (always show section)
  message += `⏰ *Reminders*:`;
  if (reminders.length > 0) {
    message += `\n`;
    reminders.forEach((reminder) => {
      message += `• ${reminder.time} – ${reminder.text}\n`;
    });
  } else {
    message += ` No reminders scheduled for today.`;
  }
  message += `\n`;

  // Sign-off
  message += `\nHave a productive day.`;

  return message;
}

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

    // Check if this is a manual trigger for a specific user
    const requestBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const isManualTrigger = requestBody?.manualTrigger === true;
    const specificUserId = requestBody?.specificUserId;

    // Get all users with Google OAuth tokens (filter by specific user if manual trigger)
    let tokensQuery = supabase
      .from('oauth_tokens')
      .select('user_id, access_token, refresh_token, expires_at, provider, users!inner(daily_briefing_enabled, briefing_time, gmail_tab_preference, briefing_sections)')
      .eq('provider', 'google');

    // If manual trigger, get specific user; otherwise get all enabled users
    if (isManualTrigger && specificUserId) {
      console.log(`[${traceId}] Manual trigger for user ${specificUserId}`);
      tokensQuery = tokensQuery.eq('user_id', specificUserId);
    } else {
      tokensQuery = tokensQuery.eq('users.daily_briefing_enabled', true);
    }

    const { data: tokens, error: tokenError } = await tokensQuery;

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

        // Get user preferences
        const { data: userData } = await supabase
          .from('users')
          .select('city, gmail_tab_preference, briefing_sections')
          .eq('id', tokenData.user_id)
          .single();

        const userCity = userData?.city || 'Mumbai';
        const gmailTab = userData?.gmail_tab_preference || 'primary';
        
        // Parse briefing_sections into a normalized boolean map
        const rawSections = userData?.briefing_sections;
        let sections: any = {};

        if (typeof rawSections === 'string') {
          try {
            sections = JSON.parse(rawSections);
          } catch (e) {
            console.error(`[${traceId}] Failed to parse briefing_sections string:`, e);
            sections = {};
          }
        } else if (rawSections && typeof rawSections === 'object') {
          sections = rawSections;
        }

        sections = {
          weather: sections.weather ?? true,
          news: sections.news ?? true,
          tasks: sections.tasks ?? true,
          calendar: sections.calendar ?? true,
          emails: sections.emails ?? true,
          reminders: sections.reminders ?? true,
        };

        console.log(`[${traceId}] Briefing sections:`, JSON.stringify(sections));
        console.log(
          `[${traceId}] Running sections: weather=${sections.weather ? 'yes' : 'no'}, news=${sections.news ? 'yes' : 'no'}, calendar=${sections.calendar ? 'yes' : 'no'}, tasks=${sections.tasks ? 'yes' : 'no'}, emails=${sections.emails ? 'yes' : 'no'}, reminders=${sections.reminders ? 'yes' : 'no'}`
        );

        // Collect data for briefing
        const briefingData: any = {
          calendar: [],
          tasks: [],
          emails: 0,
          reminders: [],
          city: userCity
        };

        // Compute today's date in IST (server-computed, not LLM-generated)
        const nowUtc = new Date();
        const nowIst = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        
        const todayStart = new Date(nowIst);
        todayStart.setHours(0, 0, 0, 0);
        
        const todayEnd = new Date(nowIst);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Create display string for today's date (e.g., "Wednesday, 27th November 2025")
        const todayDisplay = nowIst.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Kolkata'
        });
        
        console.log(`[${traceId}] Briefing date (IST): nowIst=${nowIst.toISOString()}, todayStart=${todayStart.toISOString()}, todayEnd=${todayEnd.toISOString()}`);
        console.log(`[${traceId}] Briefing heading date: ${todayDisplay}`);

        if (sections.calendar) {
          console.log(
            `[${traceId}] Briefing Calendar query: timeMin=${todayStart.toISOString()}, timeMax=${todayEnd.toISOString()}`
          );
          
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
            console.log(`[${traceId}] Briefing Calendar: fetched ${briefingData.calendar.length} events`);
          } else {
            console.log(`[${traceId}] Section skipped: Calendar API returned error`);
          }
        } else {
          console.log(`[${traceId}] Section disabled: Calendar`);
        }

        // Fetch pending tasks (if enabled)
        if (sections.tasks !== false) {
          const tasksListResponse = await fetch(
            'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );

          if (tasksListResponse.ok) {
            const listData = await tasksListResponse.json();
            const lists = listData.items || [];
            
            // Use a Set to track unique task titles and prevent duplicates
            const seenTasks = new Set<string>();
            
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
                
                for (const task of tasks.slice(0, 3)) {
                  const taskTitle = task.title?.trim();
                  
                  // Skip if we've already seen this exact task title
                  if (!taskTitle || seenTasks.has(taskTitle)) {
                    continue;
                  }
                  
                  seenTasks.add(taskTitle);
                  briefingData.tasks.push({
                    title: taskTitle,
                    due: task.due ? new Date(task.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
                  });
              }
            }
          }
          console.log(`[${traceId}] Tasks: fetched ${briefingData.tasks.length} pending tasks`);
        } else {
          console.log(`[${traceId}] Section disabled: Tasks`);
        }
        }

        // Fetch LIVE unread email count and top subjects (if enabled)
        if (sections.emails) {
          // Build Gmail query based on user preference
          let gmailQuery = 'is:unread';
          if (gmailTab === 'primary' || gmailTab === 'primary_only') {
            gmailQuery = 'category:primary is:unread';
          } else if (gmailTab === 'promotions') {
            gmailQuery = 'category:promotions is:unread';
          } else if (gmailTab === 'updates') {
            gmailQuery = 'category:updates is:unread';
          }
          // 'all' means no category filter, just is:unread
          
          console.log(
            `[${traceId}] Gmail query: ${gmailQuery}&maxResults=10`
          );
          const gmailResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(gmailQuery)}&maxResults=10`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );

          if (gmailResponse.ok) {
            const gmailData = await gmailResponse.json();
            const unreadCount = gmailData.resultSizeEstimate || 0;
            const messages = gmailData.messages || [];

            briefingData.emails = unreadCount;
            briefingData.topUnreadEmails = [];

            console.log(
              `[${traceId}] Gmail primary resultSizeEstimate: ${unreadCount}, messages returned: ${messages.length}`
            );

            // Fetch details of top 3 unread emails for the briefing
            for (const msg of messages.slice(0, 3)) {
              try {
                console.log(`[${traceId}] Fetching message details for id=${msg.id}`);
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
                  console.log(
                    `[${traceId}] Primary top unread: "${subject}" from ${from}`
                  );
                }
              } catch (msgError) {
                console.error(`[${traceId}] Error fetching email details:`, msgError);
              }
            }

            console.log(
              `[${traceId}] Daily briefing: LIVE ${gmailTab} unread email count for user ${tokenData.user_id}: ${unreadCount}, top emails extracted: ${briefingData.topUnreadEmails.length}`
            );
          } else {
            console.log(`[${traceId}] Section skipped: Gmail API returned error`);
          }
        } else {
          console.log(`[${traceId}] Section disabled: Emails`);
        }

        // Fetch today's reminders (if enabled)
        if (sections.reminders) {
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
            console.log(`[${traceId}] Reminders: fetched ${briefingData.reminders.length} reminders for today`);
          } else {
            console.log(`[${traceId}] Section skipped: No reminders found for today`);
          }
        } else {
          console.log(`[${traceId}] Section disabled: Reminders`);
        }

        // Fetch weather forecast using SERP API (if enabled)
        const serpApiKey = Deno.env.get('SERP_API_KEY');
        let weatherInfo = null;
        
        if (sections.weather && serpApiKey) {
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
                console.log(`[${traceId}] Weather: fetched for ${userCity}`);
              } else {
                console.log(`[${traceId}] Section skipped: Weather returned no data`);
              }
            } else {
              console.log(`[${traceId}] Section skipped: Weather API returned error`);
            }
          } catch (weatherError) {
            console.error(`[${traceId}] Weather fetch error:`, weatherError);
          }
        } else {
          if (!sections.weather) {
            console.log(`[${traceId}] Section disabled: Weather`);
          } else if (!serpApiKey) {
            console.log(`[${traceId}] Section skipped: Weather - SERP_API_KEY not configured`);
          }
        }

        // Fetch top 5 news headlines using SERP API (if enabled)
        let newsHeadlines: string[] = [];
        
        if (sections.news && serpApiKey) {
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
              
              if (newsHeadlines.length > 0) {
                console.log(`[${traceId}] News: fetched ${newsHeadlines.length} headlines`);
              } else {
                console.log(`[${traceId}] Section skipped: News returned 0 headlines`);
              }
            } else {
              console.log(`[${traceId}] Section skipped: News API returned error`);
            }
          } catch (newsError) {
            console.error(`[${traceId}] News fetch error:`, newsError);
          }
        } else {
          if (!sections.news) {
            console.log(`[${traceId}] Section disabled: News`);
          } else if (!serpApiKey) {
            console.log(`[${traceId}] Section skipped: News - SERP_API_KEY not configured`);
          }
        }

        console.log(`[${traceId}] Daily briefing data summary: date=${todayDisplay}, weather=${!!weatherInfo}, calendar=${briefingData.calendar.length}, tasks=${briefingData.tasks.length}, emailsUnread=${briefingData.emails}, reminders=${briefingData.reminders.length}`);

        // Build briefing message deterministically (no LLM)
        const briefingMessage = renderDailyBriefing({
          todayDisplay,
          weatherInfo: weatherInfo ? {
            city: userCity,
            highC: weatherInfo.temp,
            lowC: '',
            description: weatherInfo.condition,
            humidity: weatherInfo.humidity
          } : null,
          calendar: briefingData.calendar,
          tasks: briefingData.tasks,
          emailsUnread: briefingData.emails,
          topUnreadEmails: briefingData.topUnreadEmails,
          reminders: briefingData.reminders
        });

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
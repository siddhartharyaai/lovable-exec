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

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
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
    const { intent, userId, traceId } = await req.json();
    
    console.log(`[${traceId}] Gmail action: ${intent?.type}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const accessToken = await getAccessToken(supabase, userId);
    let message = '';

    if (intent.type === 'gmail_summarize_unread') {
      const maxResults = intent.entities?.max || 10;

      // Fetch unread messages from PRIMARY category only
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+category:primary&maxResults=${maxResults}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Gmail messages');
      }

      const data = await response.json();
      const messages = data.messages || [];

      if (messages.length === 0) {
        message = '📧 No unread emails. Your inbox is clear!';
      } else {
        // Fetch details for each message
        const messageDetails = await Promise.all(
          messages.slice(0, 3).map(async (msg: any) => {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            return detailResponse.json();
          })
        );

        // Use AI to summarize
        const emailList = messageDetails.map((msg: any) => {
          const from = msg.payload.headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
          const subject = msg.payload.headers.find((h: any) => h.name === 'Subject')?.value || 'No subject';
          return `From: ${from}\nSubject: ${subject}`;
        }).join('\n\n');

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
                content: `You are a proactive email assistant. Analyze emails and provide:
1. A detailed summary (2-3 sentences per email) of what each email is about
2. Actionable insights - what the user should do
3. Urgency indicators - what needs immediate attention
4. Offer to help - suggest actions like "Would you like me to mark any as read?" or "Should I draft a reply?"
Use emojis for better readability. Be conversational and helpful.` 
              },
              { 
                role: 'user', 
                content: `I have ${messages.length} unread emails in my Primary inbox. Here are the top 3:\n\n${emailList}\n\nPlease provide a detailed summary with actionable insights for each email. Then ask me if I'd like to take any actions on these emails (mark as read, reply, etc.).` 
              }
            ],
            temperature: 0.7,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('AI summarization failed');
        }

        const aiData = await aiResponse.json();
        const summary = aiData.choices[0].message.content;

        message = `📧 **Inbox Summary** (${messages.length} unread in Primary)\n\n${summary}`;
      }
    } else if (intent.type === 'gmail_mark_read') {
      const scope = intent.entities?.scope || 'all';
      
      if (scope === 'all') {
        // Fetch all unread message IDs from primary
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+category:primary`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch unread messages');
        }

        const data = await response.json();
        const messageIds = (data.messages || []).map((m: any) => m.id);

        if (messageIds.length === 0) {
          message = '✅ No unread emails in Primary inbox!';
        } else {
          // Mark all as read using batchModify
          const markReadResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify`,
            {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ids: messageIds,
                removeLabelIds: ['UNREAD'],
              }),
            }
          );

          if (!markReadResponse.ok) {
            throw new Error('Failed to mark emails as read');
          }

          message = `✅ Marked ${messageIds.length} email(s) as read in your Primary inbox!`;
        }
      } else {
        message = 'Marking specific emails as read - not yet implemented';
      }
    } else if (intent.type === 'gmail_send' || intent.type === 'gmail_reply') {
      // Draft approval workflow
      const { to, subject, body, messageId } = intent.entities;
      
      message = `📧 **Email Draft**\n\n`;
      if (to) message += `**To:** ${to}\n`;
      if (subject) message += `**Subject:** ${subject}\n`;
      message += `\n${body}\n\n`;
      message += `---\n\n⚠️ *Draft approval required* - Reply "send it" to send this email, or "cancel" to discard.`;
      
      // TODO: Store draft in DB with pending status and userId for approval flow
    } else {
      message = 'Gmail action not yet implemented';
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-gmail:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `Failed to process Gmail request: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

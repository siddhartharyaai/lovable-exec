import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse natural language time references into Gmail date filters
function parseTimeReference(reference: string, traceId: string): { afterDate?: string; beforeDate?: string } | null {
  console.log(`[${traceId}] Parsing time reference: "${reference}"`);
  
  const lower = reference.toLowerCase();
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  // Month parsing: "November", "November 2025", "Nov", "in November"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  
  const monthMatch = lower.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\s+(\d{4}))?/i);
  
  if (monthMatch) {
    const monthStr = monthMatch[1].toLowerCase();
    const year = monthMatch[3] ? parseInt(monthMatch[3]) : istTime.getFullYear();
    let monthIndex = monthNames.indexOf(monthStr);
    if (monthIndex === -1) {
      monthIndex = monthAbbr.indexOf(monthStr.substring(0, 3));
    }
    
    if (monthIndex >= 0) {
      const startDate = new Date(year, monthIndex, 1);
      const endDate = new Date(year, monthIndex + 1, 0);
      
      const result = {
        afterDate: startDate.toISOString().split('T')[0].replace(/-/g, '/'),
        beforeDate: endDate.toISOString().split('T')[0].replace(/-/g, '/')
      };
      console.log(`[${traceId}] Parsed month to date range: ${JSON.stringify(result)}`);
      return result;
    }
  }
  
  // Days back: "last 3 days", "past week", "last 2 days"
  const daysMatch = lower.match(/(?:last|past)\s+(\d+)\s+days?/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const threshold = new Date(istTime.getTime() - days * 24 * 60 * 60 * 1000);
    const result = { afterDate: threshold.toISOString().split('T')[0].replace(/-/g, '/') };
    console.log(`[${traceId}] Parsed days back to: ${JSON.stringify(result)}`);
    return result;
  }
  
  // Week references: "last week", "this week"
  if (lower.includes('last week')) {
    const threshold = new Date(istTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { afterDate: threshold.toISOString().split('T')[0].replace(/-/g, '/') };
  }
  
  console.log(`[${traceId}] No time reference pattern matched`);
  return null;
}

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
        // Fetch details for each message (up to maxResults)
        const messageDetails = await Promise.all(
          messages.slice(0, maxResults).map(async (msg: any) => {
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
                content: `You are an email assistant. For each email, provide:
- Line 1: Key point/action needed (one sentence)
- Line 2: Context/urgency if relevant (one short sentence)

Format each email as:
📧 **From:** [sender name/company]
[2-line summary with actionable insight]

After all emails, offer help in ONE line: "Reply 'mark read' to clear these."

CRITICAL: Maximum 2 lines per email. Keep total under 1000 characters.` 
              },
              { 
                role: 'user', 
                content: `Summarize these ${messages.length} primary inbox emails:\n\n${emailList}\n\nProvide 2-line summaries with key actions needed.` 
              }
            ],
            temperature: 0.5,
            max_tokens: 350,
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
            const errorText = await markReadResponse.text();
            console.error(`[Mark Read Error] Status: ${markReadResponse.status}, Response: ${errorText}`);
            throw new Error(`Gmail API error: ${markReadResponse.status} - ${errorText}`);
          }

          console.log(`[Mark Read Success] Marked ${messageIds.length} emails as read`);

          // Verify emails were actually marked as read
          const verifyResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+category:primary&maxResults=1`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );

          let remainingUnread = 0;
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            remainingUnread = verifyData.resultSizeEstimate || 0;
          }

          message = `✅ Marked ${messageIds.length} email(s) as read in your Primary inbox!${remainingUnread > 0 ? ` (${remainingUnread} still unread)` : ' All clear!'}`;
          console.log(`[Mark Read Verification] ${remainingUnread} emails still unread after marking`);
        }
      } else {
        message = 'Marking specific emails as read - not yet implemented';
      }

    } else if (intent.type === 'gmail_search') {
      const { sender, daysBack, maxResults, query: searchQuery } = intent.entities;
      
      console.log(`[${traceId}] Gmail search - sender: ${sender}, daysBack: ${daysBack}, query: ${searchQuery}`);
      
      // Build Gmail query
      let query = sender ? `from:${sender}` : '';
      
      // Try to parse natural language time reference from query or user message
      let timeFilter = null;
      if (searchQuery) {
        timeFilter = parseTimeReference(searchQuery, traceId);
      }
      
      // Apply time filter
      if (timeFilter) {
        if (timeFilter.afterDate) query += ` after:${timeFilter.afterDate}`;
        if (timeFilter.beforeDate) query += ` before:${timeFilter.beforeDate}`;
      } else if (daysBack) {
        // Fallback to daysBack parameter
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - daysBack);
        const formattedDate = dateThreshold.toISOString().split('T')[0].replace(/-/g, '/');
        query += ` after:${formattedDate}`;
      }
      
      console.log(`[${traceId}] Final Gmail query: "${query}"`);
      
      // Fetch matching messages
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults || 5}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search Gmail');
      }

      const data = await response.json();
      const messages = data.messages || [];

      if (messages.length === 0) {
        const timeInfo = daysBack ? ` in the last ${daysBack} day(s)` : '';
        message = `📧 No emails found from "${sender}"${timeInfo}.`;
      } else {
        // Fetch full details for each message
        const messageDetails = await Promise.all(
          messages.map(async (msg: any) => {
            const detailResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            return detailResponse.json();
          })
        );

        // Extract email info and body preview
        const emailSummaries = messageDetails.map((msg: any) => {
          const headers = msg.payload.headers;
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No subject';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          
          // Extract body (simplified - handles text/plain)
          let body = '';
          if (msg.payload.body?.data) {
            body = atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          } else if (msg.payload.parts) {
            const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain');
            if (textPart?.body?.data) {
              body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            }
          }
          
          return {
            from,
            subject,
            date,
            body: body.substring(0, 500) // First 500 chars
          };
        });

        // Use AI to summarize the findings
        const emailList = emailSummaries.map((e, i) => 
          `Email ${i + 1}:\nFrom: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nContent preview: ${e.body}`
        ).join('\n\n---\n\n');

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
                content: `You are an email assistant. Summarize emails clearly and concisely. For each email:
- Identify the sender name (extract from email address if needed)
- Summarize the key content in 2-3 sentences
- Note any action items or important dates

Format as:
📧 **Email from [Name]** ([Date])
**Subject:** [subject]
[2-3 sentence summary]

Keep total response under 1200 characters.` 
              },
              { 
                role: 'user', 
                content: `User is looking for emails from "${sender}"${daysBack ? ` in the last ${daysBack} day(s)` : ''}. Here are the ${messages.length} email(s) found:\n\n${emailList}\n\nSummarize each email clearly.` 
              }
            ],
            temperature: 0.5,
            max_tokens: 500,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error('AI summarization failed');
        }

        const aiData = await aiResponse.json();
        const summary = aiData.choices[0].message.content;

        const timeInfo = daysBack ? ` (last ${daysBack} day${daysBack > 1 ? 's' : ''})` : '';
        message = `📧 **Found ${messages.length} email${messages.length > 1 ? 's' : ''} from "${sender}"${timeInfo}**\n\n${summary}`;
      }

    } else if (intent.type === 'gmail_send_approved' || intent.type === 'gmail_reply_approved') {
      // Send approved draft
      const { draftId, to, subject, body, messageId } = intent.entities;
      
      if (intent.type === 'gmail_send_approved') {
        // Send new email
        const sendResponse = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              raw: btoa(
                `To: ${to}\r\n` +
                `Subject: ${subject}\r\n` +
                `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                body
              )
            }),
          }
        );

        if (!sendResponse.ok) {
          throw new Error('Failed to send email');
        }

        // Update draft status
        await supabase
          .from('email_drafts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', draftId);

        message = `✅ Email sent to ${to}!`;
      } else {
        // Reply to existing email
        const replyResponse = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              raw: btoa(
                `In-Reply-To: ${messageId}\r\n` +
                `References: ${messageId}\r\n` +
                `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                body
              ),
              threadId: messageId
            }),
          }
        );

        if (!replyResponse.ok) {
          throw new Error('Failed to send reply');
        }

        // Update draft status
        await supabase
          .from('email_drafts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', draftId);

        message = `✅ Reply sent!`;
      }
    } else if (intent.type === 'gmail_send' || intent.type === 'gmail_reply') {
      // Draft approval workflow - store draft in database
      const { to, subject, body, messageId } = intent.entities;
      
      // Create draft in database
      const draftType = intent.type === 'gmail_send' ? 'send' : 'reply';
      const { data: draft, error: draftError } = await supabase
        .from('email_drafts')
        .insert({
          user_id: userId,
          type: draftType,
          to_email: to,
          subject: subject,
          body: body,
          message_id: messageId,
          status: 'pending'
        })
        .select()
        .single();

      if (draftError || !draft) {
        throw new Error('Failed to create email draft');
      }

      message = `📧 **Email Draft Created**\n\n`;
      if (to) message += `**To:** ${to}\n`;
      if (subject) message += `**Subject:** ${subject}\n`;
      message += `\n${body}\n\n`;
      message += `---\n\n⚠️ Reply "send ${draft.id.substring(0, 8)}" to send this email, or "cancel ${draft.id.substring(0, 8)}" to discard.`;
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

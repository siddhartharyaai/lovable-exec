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
    throw new Error('OAUTH_NOT_CONNECTED');
  }

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    if (refreshResult.error || !refreshResult.data?.access_token) {
      throw new Error('OAUTH_EXPIRED');
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
    
    console.log(`[${traceId}] Contact lookup`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let accessToken;
    try {
      accessToken = await getAccessToken(supabase, userId);
    } catch (tokenError) {
      const errMsg = tokenError instanceof Error ? tokenError.message : 'Unknown error';
      if (errMsg === 'OAUTH_NOT_CONNECTED' || errMsg === 'OAUTH_EXPIRED') {
        console.error(`[${traceId}] OAuth error for user ${userId}: ${errMsg}`);
        return new Response(JSON.stringify({ 
          message: `⚠️ Your Google Contacts connection has expired. Please reconnect your Google account in settings.`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw tokenError;
    }
    const { name, email } = intent.entities;
    
    if (!name && !email) {
      return new Response(JSON.stringify({ 
        message: "Please specify who to search for (e.g., 'Find Rohan's email')"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const searchQuery = name || email;
    console.log(`[${traceId}] Searching for: ${searchQuery}`);

    // Search contacts using People API
    const response = await fetch(
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(searchQuery)}&readMask=names,emailAddresses,phoneNumbers,organizations`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${traceId}] People API error:`, errorText);
      throw new Error('Failed to search contacts');
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      return new Response(JSON.stringify({ 
        message: `❌ No contact found for "${searchQuery}"`,
        contacts: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format ALL matching contacts as structured data
    const contacts = results.map((result: any) => {
      const person = result.person;
      return {
        name: person.names?.[0]?.displayName || 'Unknown',
        emails: person.emailAddresses?.map((e: any) => e.value) || [],
        phones: person.phoneNumbers?.map((p: any) => p.value) || [],
        organization: person.organizations?.[0]?.name || ''
      };
    });

    // Format display message for top 3 contacts
    const topContacts = contacts.slice(0, 3);
    let message = `Found ${contacts.length} contact${contacts.length > 1 ? 's' : ''} matching "${searchQuery}":\n\n`;
    
    topContacts.forEach((contact: any, idx: number) => {
      message += `${idx + 1}. **${contact.name}**\n`;
      if (contact.emails.length > 0) {
        message += `   📧 ${contact.emails.join(', ')}\n`;
      }
      if (contact.phones.length > 0) {
        message += `   📞 ${contact.phones.join(', ')}\n`;
      }
      if (contact.organization) {
        message += `   🏢 ${contact.organization}\n`;
      }
      message += '\n';
    });

    if (contacts.length > 3) {
      message += `_...and ${contacts.length - 3} more match(es)_\n\n`;
      message += `Which one would you like to use? You can reply with the number or name.`;
    } else if (contacts.length > 1) {
      message += `Which one would you like to use? Reply with the number or name.`;
    }

    return new Response(JSON.stringify({ 
      message,
      contacts // Return structured array for storage in session_state
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in handle-contacts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Failed to lookup contact: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

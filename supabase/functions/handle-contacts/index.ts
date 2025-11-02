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
    
    console.log(`[${traceId}] Contact lookup`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId);
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
        message: `❌ No contact found for "${searchQuery}"`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format the first matching contact
    const contact = results[0].person;
    const contactName = contact.names?.[0]?.displayName || 'Unknown';
    const contactEmails = contact.emailAddresses?.map((e: any) => e.value) || [];
    const contactPhones = contact.phoneNumbers?.map((p: any) => p.value) || [];
    const contactOrg = contact.organizations?.[0]?.name || '';

    let message = `👤 **${contactName}**\n\n`;
    
    if (contactEmails.length > 0) {
      message += `📧 ${contactEmails.join(', ')}\n`;
    }
    
    if (contactPhones.length > 0) {
      message += `📞 ${contactPhones.join(', ')}\n`;
    }
    
    if (contactOrg) {
      message += `🏢 ${contactOrg}\n`;
    }

    if (results.length > 1) {
      message += `\n_Found ${results.length - 1} more match(es)_`;
    }

    return new Response(JSON.stringify({ message }), {
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get or refresh access token
async function getAccessToken(supabase: any, userId: string) {
  const { data: tokenData, error: tokenError } = await supabase
    .from('oauth_tokens')
    .select('access_token, expires_at, refresh_token')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (tokenError || !tokenData) {
    throw new Error('No Google OAuth token found');
  }

  const expiresAt = new Date(tokenData.expires_at);
  const now = new Date();

  // Refresh if expiring within 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log('Access token expiring soon, refreshing...');
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
    console.log(`[${traceId}] Drive search request:`, intent);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId);

    const query = intent.query || '';
    const maxResults = intent.max_results || 10;

    // Search Google Drive
    const searchQuery = encodeURIComponent(query);
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=name contains '${searchQuery}' or fullText contains '${searchQuery}'&pageSize=${maxResults}&fields=files(id,name,mimeType,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc`;

    const driveResponse = await fetch(driveUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      throw new Error(`Drive API error: ${driveResponse.status} ${errorText}`);
    }

    const driveData = await driveResponse.json();
    const files = driveData.files || [];

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: `I couldn't find any files matching "${query}" in your Google Drive. Try a different search term?` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format results
    let message = `Found ${files.length} file${files.length > 1 ? 's' : ''} for "${query}":\n\n`;
    
    files.forEach((file: any, index: number) => {
      const fileType = file.mimeType.split('/').pop() || 'file';
      const modified = new Date(file.modifiedTime).toLocaleDateString('en-IN');
      message += `${index + 1}. **${file.name}**\n`;
      message += `   Type: ${fileType} | Modified: ${modified}\n`;
      message += `   Link: ${file.webViewLink}\n\n`;
    });

    return new Response(
      JSON.stringify({ message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Drive search error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to search Drive',
        message: "Sorry, I couldn't search your Google Drive right now. Please try again or check your Google connection in settings."
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

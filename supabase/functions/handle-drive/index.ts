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
    let message = `I found ${files.length} file${files.length > 1 ? 's' : ''} that might be related to "${query}" in your Google Drive:\n\n`;
    
    files.forEach((file: any, index: number) => {
      const fileType = file.mimeType.includes('google-apps.document') ? 'Google Doc' :
                       file.mimeType.includes('google-apps.spreadsheet') ? 'Google Sheet' :
                       file.mimeType.includes('google-apps.presentation') ? 'Google Slides' :
                       file.mimeType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml') ? 'Word Document' :
                       file.mimeType.includes('application/pdf') ? 'PDF' : 
                       file.mimeType.split('/').pop() || 'file';
      const modified = new Date(file.modifiedTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      message += `• **${file.name}** (${fileType}, modified ${modified})\n`;
    });

    message += `\nWhich one would you like me to summarize? Or is there a specific one you're looking for?`;

    // Store search results in session state for follow-up
    const fileMap: Record<string, string> = {};
    files.forEach((file: any) => {
      fileMap[file.name.toLowerCase()] = file.id;
    });

    await supabase.from('session_state').upsert({
      user_id: userId,
      drive_search_results: fileMap,
      drive_search_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

    return new Response(
      JSON.stringify({ 
        message,
        files: files.map((f: any) => ({ id: f.id, name: f.name, mimeType: f.mimeType }))
      }),
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

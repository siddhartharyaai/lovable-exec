import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(supabase: any, userId: string, traceId?: string) {
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenData) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.');
  }

  const expiresAt = new Date(tokenData.expires_at);
  if (expiresAt <= new Date()) {
    console.log(`[${traceId}] Token expired, attempting refresh...`);
    
    const refreshResult = await supabase.functions.invoke('refresh-google-token', {
      body: { userId }
    });
    
    // Check for specific error messages from refresh function
    if (refreshResult.error) {
      console.error(`[${traceId}] Token refresh error:`, refreshResult.error);
      throw new Error('Failed to refresh Google token. Please reconnect your Google account in Settings.');
    }
    
    // Check if there's an error in the response data (happens when function returns 500)
    if (refreshResult.data?.error) {
      const errorMsg = refreshResult.data.error;
      console.error(`[${traceId}] Token refresh returned error:`, errorMsg);
      
      // Pass through the specific revoked message
      if (errorMsg.includes('revoked') || errorMsg.includes('reconnect')) {
        throw new Error(errorMsg);
      }
      throw new Error('Google authentication expired. Please reconnect your Google account in Settings.');
    }
    
    if (!refreshResult.data?.access_token) {
      console.error(`[${traceId}] No access_token in refresh result`);
      throw new Error('Failed to refresh Google token. Please reconnect your Google account in Settings.');
    }
    
    console.log(`[${traceId}] Token refreshed successfully`);
    return refreshResult.data.access_token;
  }

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId, fileName, userId, traceId } = await req.json();
    
    console.log(`[${traceId}] Reading Google Drive document: ${fileName} (${fileId})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const accessToken = await getAccessToken(supabase, userId, traceId);

    // Export Google Doc/Sheet to text format
    let exportUrl = '';
    let mimeType = '';
    
    // Get file metadata to determine type
    const metadataResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );
    
    if (!metadataResponse.ok) {
      throw new Error('Failed to fetch file metadata');
    }
    
    const metadata = await metadataResponse.json();
    mimeType = metadata.mimeType;
    
    console.log(`[${traceId}] File type: ${mimeType}`);
    
    // Determine export format based on mime type
    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Doc -> plain text
      exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheet -> CSV
      exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
    } else if (mimeType === 'application/vnd.google-apps.presentation') {
      // Google Slides -> plain text
      exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else {
      // For other files, download directly
      exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }
    
    // Download/export the file
    const fileResponse = await fetch(exportUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }
    
    const fileContent = await fileResponse.text();
    console.log(`[${traceId}] Downloaded ${fileContent.length} characters`);
    
    // Store in user_documents for future querying
    const { data: docData } = await supabase.from('user_documents').insert({
      user_id: userId,
      filename: fileName || 'drive_document',
      mime_type: mimeType,
      content_text: fileContent.substring(0, 50000), // Limit to 50k chars
      metadata: { drive_file_id: fileId }
    }).select().single();
    
    // Summarize using Lovable AI
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
            content: 'Summarize this document concisely in 3-5 sentences. Focus on key points and main ideas.'
          },
          {
            role: 'user',
            content: `Document: ${fileName}\n\nContent:\n${fileContent.substring(0, 10000)}`
          }
        ],
        temperature: 0.5,
        max_tokens: 300
      }),
    });
    
    if (!aiResponse.ok) {
      throw new Error('AI summarization failed');
    }
    
    const aiData = await aiResponse.json();
    const summary = aiData.choices[0].message.content;
    
    const message = `📄 **${fileName}** (from Google Drive)\n\n${summary}\n\n💡 I've saved this document. You can ask me questions about it anytime!`;
    
    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in read-drive-document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      message: `⚠️ Failed to read Drive document: ${errorMessage}` 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

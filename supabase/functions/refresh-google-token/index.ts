import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current token
    const { data: tokenData, error: fetchError } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .single();

    if (fetchError || !tokenData) {
      throw new Error('No Google OAuth token found');
    }

    if (!tokenData.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Refresh token with retry logic
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    const maxRetries = 3;
    let lastError: Error | null = null;
    let tokens: { access_token: string; expires_in: number } | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId!,
            client_secret: clientSecret!,
            refresh_token: tokenData.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error(`Token refresh attempt ${attempt}/${maxRetries} failed:`, errorText);
          
          // Check if token is permanently revoked
          if (errorText.includes('invalid_grant') || errorText.includes('Token has been revoked')) {
            throw new Error('Google OAuth token has been revoked. Please reconnect your Google account in Settings.');
          }
          
          lastError = new Error(`Token refresh failed: ${errorText}`);
          
          // Exponential backoff: 1s, 2s, 4s
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            continue;
          }
        } else {
          tokens = await tokenResponse.json();
          break;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
          continue;
        }
      }
    }

    if (!tokens) {
      throw lastError || new Error('Failed to refresh token after retries');
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Update token
    const { error: updateError } = await supabase
      .from('oauth_tokens')
      .update({
        access_token: tokens.access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google');

    if (updateError) {
      throw new Error('Failed to update token');
    }

    return new Response(JSON.stringify({ 
      success: true,
      access_token: tokens.access_token,
      expires_at: expiresAt,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in refresh-google-token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

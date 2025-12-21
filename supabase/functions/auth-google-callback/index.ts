import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: `/?error=${encodeURIComponent(error)}` },
      });
    }

    if (!code || !state) {
      throw new Error('Missing code or state');
    }

    const { userId, redirectUrl } = JSON.parse(atob(state));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Retrieve code verifier - get the most recent one for this user
    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('payload, created_at, trace_id')
      .eq('user_id', userId)
      .eq('type', 'oauth_verifier')
      .order('created_at', { ascending: false })
      .limit(1);

    console.log(`Found ${logs?.length || 0} verifier(s) for user ${userId}`);

    if (logsError) {
      console.error('Error fetching code verifier:', logsError);
      throw new Error('Failed to retrieve authorization data');
    }

    const codeVerifier = logs?.[0]?.payload?.code_verifier;
    const verifierTraceId = logs?.[0]?.trace_id || 'unknown';
    
    if (!codeVerifier) {
      console.error(`No code verifier found for user ${userId}`);
      throw new Error('Authorization session expired. Please try connecting again.');
    }
    
    console.log(`[${verifierTraceId}] Using code verifier for token exchange`);

    // Exchange code for tokens
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const callbackUrl = `${supabaseUrl}/functions/v1/auth-google-callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange error:', errorText);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Get user email from Google
    let userEmail = null;
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        userEmail = userInfo.email;
        
        // Update user record with email
        await supabase
          .from('users')
          .update({ email: userEmail, updated_at: new Date().toISOString() })
          .eq('id', userId);
      }
    } catch (e) {
      console.error('Failed to fetch user email:', e);
    }

    // Store tokens
    const { error: upsertError } = await supabase
      .from('oauth_tokens')
      .upsert({
        user_id: userId,
        provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scopes: tokens.scope.split(' '),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('Token storage error:', upsertError);
      throw new Error('Failed to store tokens');
    }

    // Clean up verifier
    await supabase
      .from('logs')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'oauth_verifier');

    // Redirect back to app
    const finalRedirect = redirectUrl || '/settings';
    return new Response(null, {
      status: 302,
      headers: { Location: `${finalRedirect}?connected=google` },
    });

  } catch (error) {
    console.error('Error in auth-google-callback:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(null, {
      status: 302,
      headers: { Location: `/?error=${encodeURIComponent(errorMessage)}` },
    });
  }
});

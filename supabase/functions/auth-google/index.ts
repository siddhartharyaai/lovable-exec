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
    const { userId, redirectUrl } = await req.json();

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!clientId) {
      throw new Error('Google OAuth not configured');
    }

    // Normalize redirect URL to an absolute URL so the callback can always send the user back to the app.
    const originHeader = req.headers.get('origin');
    const normalizedRedirectUrl = (() => {
      try {
        if (redirectUrl && /^https?:\/\//.test(redirectUrl)) return redirectUrl;
        if (originHeader && redirectUrl) return new URL(redirectUrl, originHeader).toString();
        if (originHeader) return new URL('/settings', originHeader).toString();
        return redirectUrl;
      } catch {
        return redirectUrl;
      }
    })();

    if (!normalizedRedirectUrl || !/^https?:\/\//.test(normalizedRedirectUrl)) {
      throw new Error('Invalid redirect URL');
    }

    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Attempt identifier (prevents "Invalid code verifier" when users retry / double-click)
    const attemptId = crypto.randomUUID();

    // Prune stale verifiers (keep recent ones so parallel attempts don't overwrite each other)
    const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from('logs')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'oauth_verifier')
      .lt('created_at', cutoffIso);

    // Store verifier for this attempt (keyed by trace_id = attemptId)
    const { error: insertError } = await supabase.from('logs').insert({
      user_id: userId,
      type: 'oauth_verifier',
      payload: { code_verifier: codeVerifier, redirect_url: normalizedRedirectUrl },
      trace_id: attemptId,
    });

    if (insertError) {
      console.error('Failed to store code verifier:', insertError);
      throw new Error('Failed to initiate OAuth flow');
    }

    console.log(`[${attemptId}] Stored code verifier for user ${userId}`);

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' ');

    const appBaseUrl = supabaseUrl;
    const callbackUrl = `${appBaseUrl}/functions/v1/auth-google-callback`;
    const state = btoa(JSON.stringify({ userId, redirectUrl: normalizedRedirectUrl, attemptId }));
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auth-google:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

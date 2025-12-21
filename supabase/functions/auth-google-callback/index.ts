import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildRedirectUrl(baseUrl: string, params: Record<string, string>) {
  const url = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Keep these outside try so we can redirect correctly even on failures.
  let redirectUrlFromState: string | null = null;
  let userIdFromState: string | null = null;
  let attemptIdFromState: string | null = null;
  let supabase: any = null;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    const oauthErrorDescription = url.searchParams.get('error_description');

    if (!state) {
      // No state means we can't safely redirect back to the app.
      return new Response(JSON.stringify({ error: 'Missing state' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedState = JSON.parse(atob(state));
    userIdFromState = parsedState?.userId ?? null;
    redirectUrlFromState = parsedState?.redirectUrl ?? null;
    attemptIdFromState = parsedState?.attemptId ?? null;

    if (!userIdFromState || !redirectUrlFromState || !attemptIdFromState) {
      return new Response(JSON.stringify({ error: 'Invalid state' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    const logStage = async (stage: string, extra: Record<string, unknown> = {}) => {
      try {
        await supabase.from('logs').insert({
          user_id: userIdFromState,
          type: 'oauth_google_flow',
          trace_id: attemptIdFromState,
          payload: { stage, ...extra },
        });
      } catch {
        // Best-effort diagnostics only
      }
    };

    await logStage('state_parsed', { has_code: !!code, has_oauth_error: !!oauthError });

    if (oauthError) {
      await logStage('oauth_error', {
        oauth_error: oauthError,
        oauth_error_description: oauthErrorDescription || null,
      });

      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: oauthError,
        description: oauthErrorDescription || oauthError,
        attemptId: attemptIdFromState,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    if (!code) {
      await logStage('missing_code');

      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: 'missing_code',
        description: 'Missing authorization code',
        attemptId: attemptIdFromState,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    // Retrieve the exact verifier for this attempt
    const { data: verifierRow, error: verifierErr } = await supabase
      .from('logs')
      .select('id, payload, created_at, trace_id')
      .eq('user_id', userIdFromState)
      .eq('type', 'oauth_verifier')
      .eq('trace_id', attemptIdFromState)
      .maybeSingle();

    if (verifierErr) {
      console.error(`[${attemptIdFromState}] Error fetching verifier row:`, verifierErr);
      throw new Error('Failed to retrieve authorization data');
    }

    const codeVerifier = (verifierRow as any)?.payload?.code_verifier;

    if (!codeVerifier) {
      await logStage('verifier_missing');
      console.error(`[${attemptIdFromState}] Code verifier missing for this attempt`);
      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: 'verifier_missing',
        description: 'Authorization session expired. Please try connecting again.',
        attemptId: attemptIdFromState,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    await logStage('token_exchange_start');
    console.log(`[${attemptIdFromState}] Exchanging code for tokens...`);

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
      await logStage('token_exchange_failed', {
        status: tokenResponse.status,
        error: errorText.slice(0, 500),
      });

      console.error(`[${attemptIdFromState}] Token exchange error:`, errorText);

      let userFacingDescription = 'Token exchange failed';
      try {
        const parsed = JSON.parse(errorText);
        const googleDesc = (parsed?.error_description as string | undefined) || (parsed?.error as string | undefined);
        if (googleDesc) userFacingDescription = googleDesc;
      } catch {
        // ignore
      }

      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: 'token_exchange_failed',
        description: userFacingDescription,
        attemptId: attemptIdFromState,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    await logStage('token_exchange_ok');

    const tokens = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Get user email from Google (best-effort)
    let userEmail = null;
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        userEmail = userInfo.email;

        await supabase
          .from('users')
          .update({ email: userEmail, updated_at: new Date().toISOString() })
          .eq('id', userIdFromState);
      }
    } catch (e) {
      console.error(`[${attemptIdFromState}] Failed to fetch user email:`, e);
    }

    // Store tokens
    const { error: upsertError } = await supabase
      .from('oauth_tokens')
      .upsert(
        {
          user_id: userIdFromState,
          provider: 'google',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scopes: (tokens.scope || '').split(' ').filter(Boolean),
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' },
      );

    if (upsertError) {
      await logStage('token_store_failed', { message: upsertError.message });
      console.error(`[${attemptIdFromState}] Token storage error:`, upsertError);
      throw new Error('Failed to store tokens');
    }

    await logStage('token_store_ok');

    // Clean up only this attempt's verifier
    await supabase
      .from('logs')
      .delete()
      .eq('id', (verifierRow as any)?.id);

    const successRedirect = buildRedirectUrl(redirectUrlFromState, {
      connected: 'google',
      attemptId: attemptIdFromState,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: successRedirect },
    });
  } catch (error) {
    console.error('Error in auth-google-callback:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Best-effort: persist failure diagnostic
    if (supabase && attemptIdFromState && userIdFromState) {
      try {
        await supabase.from('logs').insert({
          user_id: userIdFromState,
          type: 'oauth_google_flow',
          trace_id: attemptIdFromState,
          payload: { stage: 'callback_failed', error: errorMessage },
        });
      } catch {
        // ignore
      }
    }

    if (redirectUrlFromState && attemptIdFromState) {
      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: 'callback_failed',
        description: errorMessage,
        attemptId: attemptIdFromState,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    if (redirectUrlFromState) {
      const location = buildRedirectUrl(redirectUrlFromState, {
        oauth_error: 'google',
        reason: 'callback_failed',
        description: errorMessage,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: location },
      });
    }

    // Fallback: no safe redirect target.
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

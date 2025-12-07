/**
 * Twilio Request Signature Verification
 * 
 * Implements HMAC-SHA256 signature verification for Twilio webhooks.
 * This is critical for security - ensures requests actually come from Twilio.
 * 
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */

// Get SubtleCrypto for HMAC-SHA256
const encoder = new TextEncoder();

/**
 * Generate HMAC-SHA256 signature matching Twilio's format
 */
async function hmacSha256(key: string, message: string): Promise<string> {
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // Convert to base64
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Legacy SHA1 HMAC for Twilio's older signature format
 */
async function hmacSha1(key: string, message: string): Promise<string> {
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  
  // Convert to base64
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Build the signature base string from URL and params
 * Twilio requires params sorted alphabetically and appended to URL
 */
function buildSignatureBaseString(url: string, params: Record<string, string>): string {
  // Sort params alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  
  // Build param string
  let paramString = '';
  for (const key of sortedKeys) {
    paramString += key + params[key];
  }
  
  return url + paramString;
}

/**
 * Verify Twilio webhook signature
 * 
 * @param signature - The X-Twilio-Signature header value
 * @param url - The full webhook URL that Twilio called
 * @param params - The form parameters from the request body
 * @param authToken - Your Twilio Auth Token (from environment)
 * @returns true if signature is valid, false otherwise
 */
export async function verifyTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
  authToken: string
): Promise<boolean> {
  if (!signature || !authToken) {
    console.warn('[twilio-verify] Missing signature or auth token');
    return false;
  }
  
  try {
    const baseString = buildSignatureBaseString(url, params);
    
    // Twilio uses HMAC-SHA1 for the X-Twilio-Signature header
    const expectedSignature = await hmacSha1(authToken, baseString);
    
    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    
    return result === 0;
  } catch (error) {
    console.error('[twilio-verify] Signature verification error:', error);
    return false;
  }
}

/**
 * Verify Twilio signature with fallback for development
 * 
 * In production (when TWILIO_AUTH_TOKEN is set and not 'dev'), 
 * signature verification is strictly enforced.
 * 
 * @param signature - The X-Twilio-Signature header value
 * @param url - The full webhook URL
 * @param params - The form parameters
 * @param traceId - For logging
 * @returns true if valid (or dev mode), false if invalid
 */
export async function verifyTwilioRequest(
  signature: string,
  url: string,
  params: Record<string, string>,
  traceId: string,
  requestUrl?: string // The actual request.url from the incoming request
): Promise<{ valid: boolean; reason: string }> {
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  
  // Development mode bypass
  if (!authToken || authToken === 'dev' || authToken === 'test') {
    console.warn(`[${traceId}] ⚠️ Twilio signature verification BYPASSED (dev mode)`);
    return { valid: true, reason: 'dev_mode' };
  }
  
  // No signature provided
  if (!signature) {
    console.error(`[${traceId}] ❌ Missing X-Twilio-Signature header`);
    return { valid: false, reason: 'missing_signature' };
  }
  
  // Build list of URLs to try - Twilio signs with the URL it was configured with
  // We need to try multiple formats because:
  // 1. Twilio might be configured with different URL paths
  // 2. Internal request.url might differ from public URL
  // 3. HTTP vs HTTPS variations
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const urlsToTry: string[] = [];
  
  // CRITICAL: If we have the actual request URL, try its HTTPS version FIRST
  // This is what Twilio actually signed the request with
  if (requestUrl) {
    // Try HTTPS version of exact request URL (most likely to match)
    const httpsRequestUrl = requestUrl.replace('http://', 'https://');
    if (!urlsToTry.includes(httpsRequestUrl)) {
      urlsToTry.push(httpsRequestUrl);
    }
    // Also try the HTTP version in case Twilio configured with HTTP
    if (!urlsToTry.includes(requestUrl)) {
      urlsToTry.push(requestUrl);
    }
  }
  
  // Try the canonical Supabase Edge Function URL format
  if (supabaseUrl) {
    const canonicalUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    if (!urlsToTry.includes(canonicalUrl)) {
      urlsToTry.push(canonicalUrl);
    }
  }
  
  // Fallback: Original URL passed in (from getCanonicalWebhookUrl)
  if (url && !urlsToTry.includes(url)) {
    urlsToTry.push(url);
  }
  
  // Fallback: Ensure HTTPS variant of url parameter
  if (url && url.startsWith('http://')) {
    const httpsUrl = url.replace('http://', 'https://');
    if (!urlsToTry.includes(httpsUrl)) {
      urlsToTry.push(httpsUrl);
    }
  }
  
  console.log(`[${traceId}] 🔍 Verifying signature against ${urlsToTry.length} URL(s):`);
  urlsToTry.forEach((u, i) => console.log(`[${traceId}] 🔍   ${i + 1}. ${u}`));
  
  // Try each URL format
  for (const tryUrl of urlsToTry) {
    const isValid = await verifyTwilioSignature(signature, tryUrl, params, authToken);
    if (isValid) {
      console.log(`[${traceId}] ✅ Twilio signature verified with URL: ${tryUrl}`);
      return { valid: true, reason: 'verified' };
    }
  }
  
  // All attempts failed - log details for debugging
  console.error(`[${traceId}] ❌ Signature verification failed for all ${urlsToTry.length} URL attempts`);
  console.error(`[${traceId}] 🔍 Signature received: ${signature.substring(0, 20)}...`);
  
  return { valid: false, reason: 'invalid_signature' };
}

/**
 * Get the canonical webhook URL for signature verification
 * 
 * Twilio signs requests using the URL they called.
 * For edge functions, this is typically the Supabase function URL.
 * 
 * IMPORTANT: Supabase Edge Functions may report internal URLs in request.url
 * that differ from the public URL Twilio used to sign the request.
 * We prioritize the known public URL format.
 */
export function getCanonicalWebhookUrl(request: Request): string {
  // Primary: Use SUPABASE_URL to construct the known public URL
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/whatsapp-webhook`;
  }
  
  // Fallback: Use the URL from the request (may not match Twilio's signature)
  const url = new URL(request.url);
  
  // Remove query parameters - Twilio doesn't include them in signature
  url.search = '';
  
  console.warn('[twilio-verify] ⚠️ SUPABASE_URL not set, using request.url as fallback');
  return url.toString();
}

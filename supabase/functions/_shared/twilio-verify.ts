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
  
  // CRITICAL: Use the EXACT URL configured in Twilio Console
  // User has confirmed: https://kxeylftnzwhqxguduwoq.supabase.co/functions/v1/whatsapp-webhook
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://kxeylftnzwhqxguduwoq.supabase.co';
  
  // Primary URL - the exact URL configured in Twilio (confirmed by user)
  const primaryUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
  
  console.log(`[${traceId}] 🔍 Verifying signature with URL: ${primaryUrl}`);
  
  const isValid = await verifyTwilioSignature(signature, primaryUrl, params, authToken);
  if (isValid) {
    console.log(`[${traceId}] ✅ Twilio signature verified successfully`);
    return { valid: true, reason: 'verified' };
  }
  
  // If primary fails, try the actual request URL (HTTPS converted)
  if (requestUrl) {
    const httpsRequestUrl = requestUrl.replace('http://', 'https://');
    if (httpsRequestUrl !== primaryUrl) {
      console.log(`[${traceId}] 🔍 Trying actual request URL: ${httpsRequestUrl}`);
      const isValidAlt = await verifyTwilioSignature(signature, httpsRequestUrl, params, authToken);
      if (isValidAlt) {
        console.log(`[${traceId}] ✅ Twilio signature verified with request URL`);
        return { valid: true, reason: 'verified' };
      }
    }
  }
  
  // Signature verification failed
  console.error(`[${traceId}] ❌ Signature verification FAILED`);
  console.error(`[${traceId}] 🔍 Expected URL: ${primaryUrl}`);
  console.error(`[${traceId}] 🔍 Request URL: ${requestUrl || 'not provided'}`);
  console.error(`[${traceId}] 🔍 Signature (first 20 chars): ${signature.substring(0, 20)}...`);
  
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

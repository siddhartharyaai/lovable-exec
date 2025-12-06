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
  traceId: string
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
  
  // Verify signature
  const isValid = await verifyTwilioSignature(signature, url, params, authToken);
  
  if (isValid) {
    console.log(`[${traceId}] ✅ Twilio signature verified`);
    return { valid: true, reason: 'verified' };
  } else {
    console.error(`[${traceId}] ❌ Invalid Twilio signature`);
    return { valid: false, reason: 'invalid_signature' };
  }
}

/**
 * Get the canonical webhook URL for signature verification
 * 
 * Twilio signs requests using the URL they called.
 * For edge functions, this is typically the Supabase function URL.
 */
export function getCanonicalWebhookUrl(request: Request): string {
  // Use the URL from the request
  const url = new URL(request.url);
  
  // Remove query parameters - Twilio doesn't include them in signature
  url.search = '';
  
  return url.toString();
}

/**
 * Structured Logging Module
 * Consistent logging and auditing across all edge functions
 */

export type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'DEBUG';

export interface LogContext {
  userId?: string;
  action?: string;
  duration_ms?: number;
  statusCode?: number;
  error?: string;
  [key: string]: any;
}

/**
 * Structured log helper for consistent JSON logging
 */
export function structuredLog(
  traceId: string,
  level: LogLevel,
  event: string,
  data?: LogContext
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    traceId,
    level,
    event,
    ...data
  };
  
  // Use appropriate console method based on level
  switch (level) {
    case 'ERROR':
      console.error(JSON.stringify(logEntry));
      break;
    case 'WARN':
      console.warn(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
}

/**
 * Convenience methods for different log levels
 */
export const log = {
  info: (traceId: string, event: string, data?: LogContext) => 
    structuredLog(traceId, 'INFO', event, data),
  
  error: (traceId: string, event: string, data?: LogContext) => 
    structuredLog(traceId, 'ERROR', event, data),
  
  warn: (traceId: string, event: string, data?: LogContext) => 
    structuredLog(traceId, 'WARN', event, data),
  
  debug: (traceId: string, event: string, data?: LogContext) => 
    structuredLog(traceId, 'DEBUG', event, data),
};

/**
 * Log function entry with parameters
 */
export function logEntry(traceId: string, functionName: string, params?: Record<string, any>) {
  structuredLog(traceId, 'INFO', `${functionName}:ENTRY`, { params });
}

/**
 * Log function exit with result summary
 */
export function logExit(traceId: string, functionName: string, result?: { success: boolean; message?: string }) {
  structuredLog(traceId, 'INFO', `${functionName}:EXIT`, result);
}

/**
 * Log API call with duration tracking
 */
export function logApiCall(
  traceId: string, 
  api: string, 
  method: string, 
  url: string, 
  statusCode: number, 
  duration_ms: number
) {
  structuredLog(traceId, statusCode >= 400 ? 'ERROR' : 'INFO', 'API_CALL', {
    api,
    method,
    url,
    statusCode,
    duration_ms,
  });
}

/**
 * Log OAuth-related events
 */
export function logOAuth(
  traceId: string,
  event: 'TOKEN_VALID' | 'TOKEN_EXPIRED' | 'TOKEN_REFRESHED' | 'TOKEN_REFRESH_FAILED' | 'TOKEN_NOT_FOUND',
  userId: string,
  provider: string = 'google'
) {
  const level: LogLevel = event.includes('FAILED') || event === 'TOKEN_EXPIRED' ? 'WARN' : 'INFO';
  structuredLog(traceId, level, `OAUTH:${event}`, { userId, provider });
}

/**
 * Log routing decisions
 */
export function logRouting(traceId: string, message: string, route: string, params?: Record<string, any>) {
  structuredLog(traceId, 'INFO', 'ROUTING', { message, route, ...params });
}

/**
 * Audit log helper to write to database
 */
export async function auditLog(
  supabase: any,
  userId: string,
  action: string,
  data: {
    intent?: string;
    tool_used?: string;
    tool_args?: Record<string, any>;
    result?: string;
    reason?: string;
    context?: Record<string, any>;
    trace_id?: string;
  }
) {
  try {
    await supabase.from('audit_log').insert({
      user_id: userId,
      action,
      intent: data.intent,
      tool_used: data.tool_used,
      tool_args: data.tool_args,
      result: data.result,
      reason: data.reason,
      context: data.context,
      trace_id: data.trace_id,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Create a timer for measuring operation duration
 */
export function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
  };
}

// Structured logging helper for consistent logging across edge functions
export function structuredLog(
  traceId: string,
  level: 'INFO' | 'ERROR' | 'WARN' | 'DEBUG',
  event: string,
  data?: Record<string, any>
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    traceId,
    level,
    event,
    ...data
  };
  console.log(JSON.stringify(logEntry));
}

// Audit log helper to write to database
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

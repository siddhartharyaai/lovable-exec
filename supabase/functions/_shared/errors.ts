/**
 * Standardized Error Messages Module
 * Consistent error handling across all edge functions
 */

// ============ ERROR TYPES ============

export const ErrorType = {
  OAUTH_NOT_CONNECTED: 'OAUTH_NOT_CONNECTED',
  OAUTH_EXPIRED: 'OAUTH_EXPIRED',
  API_ERROR: 'API_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  PERMISSION: 'PERMISSION',
  RATE_LIMIT: 'RATE_LIMIT',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorTypeKey = typeof ErrorType[keyof typeof ErrorType];

// ============ SERVICE-SPECIFIC ERROR MESSAGES ============

export interface ErrorMessages {
  oauthNotConnected: string;
  oauthExpired: string;
  notFound: string;
  apiError: (statusCode: number) => string;
  permissionDenied: string;
}

export const CalendarErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Google Calendar isn't connected yet. Please connect your Google account in settings to manage your calendar.`,
  oauthExpired: `⚠️ Your Google Calendar connection has expired. Please reconnect your Google account in settings.`,
  notFound: `📅 I couldn't find any events matching your request.\n\nTry:\n• "Show my calendar today" to see what events exist\n• Being more specific about the event time or title`,
  apiError: (statusCode: number) => `❌ I couldn't access your calendar right now (error ${statusCode}). Please try again in a moment.`,
  permissionDenied: `⚠️ I don't have permission to access your Google Calendar. Please reconnect with calendar permissions.`,
};

export const TasksErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Google Tasks isn't connected yet. Please connect your Google account in settings to manage tasks.`,
  oauthExpired: `⚠️ Your Google Tasks connection has expired. Please reconnect your Google account in settings to manage tasks.`,
  notFound: `❌ I couldn't find that task.\n\nTry:\n• "Show my tasks" to see what's on your list\n• Being more specific about the task name`,
  apiError: (statusCode: number) => `❌ I couldn't access your tasks right now (error ${statusCode}). Please try again in a moment.`,
  permissionDenied: `⚠️ I don't have permission to access your Google Tasks. Please reconnect with tasks permissions.`,
};

export const GmailErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Gmail isn't connected yet. Please connect your Google account in settings to access emails.`,
  oauthExpired: `⚠️ Your Gmail connection has expired. Please reconnect your Google account in settings.`,
  notFound: `📧 I couldn't find any emails matching your search.`,
  apiError: (statusCode: number) => `❌ I couldn't access your emails right now (error ${statusCode}). Please try again in a moment.`,
  permissionDenied: `⚠️ I don't have permission to access your Gmail. Please reconnect with email permissions.`,
};

export const ContactsErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Google Contacts isn't connected yet. Please connect your Google account in settings to lookup contacts.`,
  oauthExpired: `⚠️ Your Google Contacts connection has expired. Please reconnect your Google account in settings.`,
  notFound: `👤 I couldn't find anyone with that name in your contacts.`,
  apiError: (statusCode: number) => `❌ I couldn't access your contacts right now (error ${statusCode}). Please try again in a moment.`,
  permissionDenied: `⚠️ I don't have permission to access your Google Contacts. Please reconnect with contacts permissions.`,
};

export const DriveErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Google Drive isn't connected yet. Please connect your Google account in settings to access files.`,
  oauthExpired: `⚠️ Your Google Drive connection has expired. Please reconnect your Google account in settings.`,
  notFound: `📁 I couldn't find any files matching your search in Google Drive.`,
  apiError: (statusCode: number) => `❌ I couldn't access your Google Drive right now (error ${statusCode}). Please try again in a moment.`,
  permissionDenied: `⚠️ I don't have permission to access your Google Drive. Please reconnect with Drive permissions.`,
};

export const BriefingErrors: ErrorMessages = {
  oauthNotConnected: `⚠️ Your Google account isn't connected yet. Please connect your Google account in settings to receive daily briefings.`,
  oauthExpired: `⚠️ Your Google account connection has expired. Please reconnect your Google account in settings to receive briefings.`,
  notFound: `📋 No briefing data available right now.`,
  apiError: (statusCode: number) => `❌ I couldn't generate your briefing right now (error ${statusCode}). Please try again.`,
  permissionDenied: `⚠️ I don't have permission to access your Google services. Please reconnect your Google account.`,
};

export const DocumentErrors = {
  notFound: `📄 I don't have any document in context. Please upload a document first or say "recall [filename]" to load a previous document.`,
  uploadFailed: `❌ I couldn't process that document. Please try uploading again.`,
  tooLarge: `❌ That document is too large to process. Please try a smaller file.`,
  unsupportedFormat: `❌ I don't support that file format. Please upload a PDF, Word document, or image.`,
  noContent: `📄 I couldn't extract any text from that document.`,
};

export const ReminderErrors = {
  notFound: `⏰ I couldn't find any active reminder to snooze.`,
  invalidTime: `⏰ I couldn't understand that time. Try something like "remind me at 3pm" or "in 2 hours".`,
  pastTime: `⏰ That time has already passed. Please choose a future time.`,
};

// ============ HELPER FUNCTIONS ============

/**
 * Get error message based on error type and service
 */
export function getErrorMessage(
  errorType: ErrorTypeKey,
  service: 'calendar' | 'tasks' | 'gmail' | 'contacts' | 'drive' | 'briefing',
  statusCode?: number
): string {
  const errorMaps: Record<string, ErrorMessages> = {
    calendar: CalendarErrors,
    tasks: TasksErrors,
    gmail: GmailErrors,
    contacts: ContactsErrors,
    drive: DriveErrors,
    briefing: BriefingErrors,
  };

  const errors = errorMaps[service];

  switch (errorType) {
    case ErrorType.OAUTH_NOT_CONNECTED:
      return errors.oauthNotConnected;
    case ErrorType.OAUTH_EXPIRED:
      return errors.oauthExpired;
    case ErrorType.NOT_FOUND:
      return errors.notFound;
    case ErrorType.API_ERROR:
      return errors.apiError(statusCode || 500);
    case ErrorType.PERMISSION:
      return errors.permissionDenied;
    default:
      return `❌ Something went wrong. Please try again.`;
  }
}

/**
 * Check if error is an OAuth error
 */
export function isOAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message === ErrorType.OAUTH_NOT_CONNECTED || 
           error.message === ErrorType.OAUTH_EXPIRED;
  }
  return false;
}

/**
 * Handle OAuth errors and return appropriate message
 */
export function handleOAuthError(
  error: unknown,
  service: 'calendar' | 'tasks' | 'gmail' | 'contacts' | 'drive' | 'briefing'
): string | null {
  if (error instanceof Error) {
    if (error.message === ErrorType.OAUTH_NOT_CONNECTED) {
      return getErrorMessage(ErrorType.OAUTH_NOT_CONNECTED, service);
    }
    if (error.message === ErrorType.OAUTH_EXPIRED) {
      return getErrorMessage(ErrorType.OAUTH_EXPIRED, service);
    }
  }
  return null;
}

/**
 * Determine error type from HTTP status code
 */
export function getErrorTypeFromStatus(statusCode: number): ErrorTypeKey {
  if (statusCode === 401 || statusCode === 403) {
    return ErrorType.OAUTH_EXPIRED;
  }
  if (statusCode === 404) {
    return ErrorType.NOT_FOUND;
  }
  if (statusCode === 429) {
    return ErrorType.RATE_LIMIT;
  }
  return ErrorType.API_ERROR;
}

/**
 * Create a generic validation error message
 */
export function validationError(field: string, hint: string): string {
  return `❌ I need more information about ${field}. ${hint}`;
}

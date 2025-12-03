// Centralized Pure Router Module for Man Friday
// All phrase-based routing decisions happen HERE before any LLM call
// This module exports pure functions that are deterministic and testable

export type RouteDecision = 
  | { type: 'daily_briefing' }
  | { type: 'tasks'; action: 'read' | 'read_all'; showAll: boolean; showRest: boolean }
  | { type: 'calendar_read' }
  | { type: 'calendar_create' }
  | { type: 'calendar_update' }
  | { type: 'calendar_delete' }
  | { type: 'gmail_check' }
  | { type: 'gmail_search' }
  | { type: 'gmail_mark_read' }
  | { type: 'reminder_create' }
  | { type: 'reminder_snooze' }
  | { type: 'contact_lookup' }
  | { type: 'document_qna' }
  | { type: 'web_search' }
  | { type: 'none' }; // No explicit routing - let AI decide

/**
 * Pure function to determine routing based on message content
 * MUST be called BEFORE any LLM invocation
 * Returns deterministic routing decision based on phrase matching
 */
export function routeMessage(message: string): RouteDecision {
  const msg = message.toLowerCase().trim();
  
  // ============= DAILY BRIEFING =============
  if (matchesBriefingPhrases(msg)) {
    return { type: 'daily_briefing' };
  }
  
  // ============= TASKS ROUTING =============
  const tasksRoute = matchesTasksPhrases(msg);
  if (tasksRoute) {
    return tasksRoute;
  }
  
  // ============= CALENDAR ROUTING =============
  const calendarRoute = matchesCalendarPhrases(msg);
  if (calendarRoute) {
    return calendarRoute;
  }
  
  // ============= GMAIL ROUTING =============
  const gmailRoute = matchesGmailPhrases(msg);
  if (gmailRoute) {
    return gmailRoute;
  }
  
  // ============= REMINDER ROUTING =============
  const reminderRoute = matchesReminderPhrases(msg);
  if (reminderRoute) {
    return reminderRoute;
  }
  
  // No explicit routing detected - let AI handle
  return { type: 'none' };
}

/**
 * Check if message matches daily briefing phrases
 */
export function matchesBriefingPhrases(msg: string): boolean {
  const briefingPhrases = [
    'briefing',
    'give me my briefing',
    'show my briefing',
    'give me my daily briefing',
    'show my daily briefing',
    'daily briefing',
    'morning briefing',
    'briefing today',
    'my briefing today',
    'give me briefing',
    'send me my briefing',
    'get my briefing',
    'what\'s my briefing',
    'whats my briefing',
    'daily update',
    'morning update',
    'daily summary',
    'morning summary'
  ];
  
  return briefingPhrases.some(phrase => msg.includes(phrase));
}

/**
 * Check if message matches tasks phrases and determine action type
 */
export function matchesTasksPhrases(msg: string): RouteDecision | null {
  // FULL LIST: "show me all tasks", "show all 44", etc.
  const showAllPhrases = [
    'show me all tasks',
    'show all tasks',
    'give me all tasks',
    'all pending tasks',
    'give me the full list of tasks',
    'list all my tasks',
    'full list of tasks',
    'complete list of tasks',
    'entire task list',
    'all my tasks'
  ];
  
  if (showAllPhrases.some(phrase => msg.includes(phrase)) ||
      (msg.includes('show all') && msg.includes('task')) ||
      (msg.includes('all pending') && msg.includes('task'))) {
    return { type: 'tasks', action: 'read_all', showAll: true, showRest: false };
  }
  
  // REST/MORE: "show me the rest", "show me more", "balance tasks", etc.
  const showRestPhrases = [
    'show me the rest',
    'show the rest',
    'show rest',
    'show me more',
    'show more tasks',
    'show more',
    'more tasks',
    'show remaining tasks',
    'remaining tasks',
    'the other tasks',
    'balance tasks',
    'balance pending tasks',
    'balance pending',
    'rest of the tasks',
    'rest of tasks',
    'next tasks',
    'next 10 tasks',
    'next page'
  ];
  
  // Also match "the other X tasks" pattern
  const otherPattern = /the other \d+ tasks?/;
  const whichPattern = /which are the \d+/;
  
  if (showRestPhrases.some(phrase => msg.includes(phrase)) ||
      otherPattern.test(msg) ||
      whichPattern.test(msg)) {
    return { type: 'tasks', action: 'read', showAll: false, showRest: true };
  }
  
  // INITIAL VIEW: "what tasks do I have", "show my tasks", etc.
  const initialPhrases = [
    'what tasks do i have',
    'what tasks are pending',
    'show my tasks',
    'pending tasks',
    'what are my tasks',
    'what tasks do i have today',
    'my tasks',
    'list my tasks',
    'show my to-do',
    'show my todo',
    'my to-do list',
    'my todo list',
    'what\'s on my plate',
    'whats on my plate',
    'what do i need to do'
  ];
  
  if (initialPhrases.some(phrase => msg.includes(phrase)) ||
      (msg.includes('what tasks') && msg.includes('pending'))) {
    return { type: 'tasks', action: 'read', showAll: false, showRest: false };
  }
  
  return null;
}

/**
 * Check if message matches calendar phrases
 */
export function matchesCalendarPhrases(msg: string): RouteDecision | null {
  // Calendar READ phrases
  const readPhrases = [
    'what\'s on my calendar',
    'whats on my calendar',
    'show my calendar',
    'my calendar',
    'do i have meetings',
    'what meetings do i have',
    'am i free',
    'what\'s my schedule',
    'whats my schedule',
    'schedule for today',
    'schedule for tomorrow',
    'calendar today',
    'calendar tomorrow',
    'any meetings',
    'meetings today',
    'meetings tomorrow'
  ];
  
  if (readPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'calendar_read' };
  }
  
  // Calendar CREATE phrases
  const createPhrases = [
    'schedule a meeting',
    'schedule meeting',
    'create a meeting',
    'create meeting',
    'add to calendar',
    'block time',
    'book time',
    'set up a meeting',
    'set up meeting',
    'schedule a call',
    'schedule call'
  ];
  
  if (createPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'calendar_create' };
  }
  
  // Calendar UPDATE/RESCHEDULE phrases
  const updatePhrases = [
    'reschedule',
    'move the meeting',
    'move meeting',
    'change the meeting',
    'change meeting',
    'postpone',
    'bring forward',
    'shift the meeting',
    'shift meeting'
  ];
  
  if (updatePhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'calendar_update' };
  }
  
  // Calendar DELETE/CANCEL phrases
  const deletePhrases = [
    'cancel the meeting',
    'cancel meeting',
    'cancel my meeting',
    'delete the meeting',
    'delete meeting',
    'remove the meeting',
    'remove meeting',
    'cancel appointment',
    'delete appointment'
  ];
  
  if (deletePhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'calendar_delete' };
  }
  
  return null;
}

/**
 * Check if message matches Gmail phrases
 */
export function matchesGmailPhrases(msg: string): RouteDecision | null {
  // Gmail CHECK/SUMMARIZE phrases
  const checkPhrases = [
    'check my email',
    'check my emails',
    'check email',
    'check emails',
    'what\'s in my inbox',
    'whats in my inbox',
    'any new emails',
    'any new email',
    'email summary',
    'summarize my email',
    'summarize my emails',
    'unread emails',
    'unread email'
  ];
  
  if (checkPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'gmail_check' };
  }
  
  // Gmail SEARCH phrases
  const searchPhrases = [
    'find emails from',
    'find email from',
    'search emails from',
    'search email from',
    'emails from',
    'show me emails from',
    'show emails from',
    'pull up email from',
    'look for email from'
  ];
  
  if (searchPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'gmail_search' };
  }
  
  // Gmail MARK READ phrases
  const markReadPhrases = [
    'mark all as read',
    'mark emails as read',
    'clear my inbox',
    'clean up email',
    'mark all read'
  ];
  
  if (markReadPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'gmail_mark_read' };
  }
  
  return null;
}

/**
 * Check if message matches reminder phrases
 */
export function matchesReminderPhrases(msg: string): RouteDecision | null {
  // Reminder CREATE phrases
  const createPhrases = [
    'remind me',
    'set a reminder',
    'set reminder',
    'create a reminder',
    'create reminder',
    'don\'t let me forget',
    'dont let me forget',
    'alert me',
    'notify me'
  ];
  
  if (createPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'reminder_create' };
  }
  
  // Reminder SNOOZE phrases
  const snoozePhrases = [
    'snooze',
    'remind me later',
    'ask me later',
    'push it back'
  ];
  
  if (snoozePhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'reminder_snooze' };
  }
  
  return null;
}

/**
 * Get human-readable description of route decision (for logging)
 */
export function describeRoute(decision: RouteDecision): string {
  switch (decision.type) {
    case 'daily_briefing':
      return 'Daily Briefing (manual trigger)';
    case 'tasks':
      if (decision.showAll) return 'Tasks - Show ALL';
      if (decision.showRest) return 'Tasks - Show REST/MORE';
      return 'Tasks - Initial View (1-10)';
    case 'calendar_read':
      return 'Calendar - Read Events';
    case 'calendar_create':
      return 'Calendar - Create Event';
    case 'calendar_update':
      return 'Calendar - Update/Reschedule';
    case 'calendar_delete':
      return 'Calendar - Delete/Cancel';
    case 'gmail_check':
      return 'Gmail - Check/Summarize';
    case 'gmail_search':
      return 'Gmail - Search';
    case 'gmail_mark_read':
      return 'Gmail - Mark Read';
    case 'reminder_create':
      return 'Reminder - Create';
    case 'reminder_snooze':
      return 'Reminder - Snooze';
    case 'contact_lookup':
      return 'Contact - Lookup';
    case 'document_qna':
      return 'Document - Q&A';
    case 'web_search':
      return 'Web Search';
    case 'none':
      return 'No explicit route - AI will decide';
  }
}

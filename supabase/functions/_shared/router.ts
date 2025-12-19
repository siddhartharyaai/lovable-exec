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
  | { type: 'drive_search' }
  | { type: 'document_qna' }
  | { type: 'document_list' }
  | { type: 'document_recall' }
  | { type: 'web_search' }
  | { type: 'cancel_action' }
  | { type: 'none' }; // No explicit routing - let AI decide

/**
 * Pure function to determine routing based on message content
 * MUST be called BEFORE any LLM invocation
 * Returns deterministic routing decision based on phrase matching
 */
export function routeMessage(message: string): RouteDecision {
  const msg = message.toLowerCase().trim();
  
  // ============= CANCEL/ABORT ROUTING (check early) =============
  if (matchesCancelPhrases(msg)) {
    return { type: 'cancel_action' };
  }
  
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
  
  // ============= CONTACT ROUTING =============
  const contactRoute = matchesContactPhrases(msg);
  if (contactRoute) {
    return contactRoute;
  }
  
  // ============= DRIVE SEARCH ROUTING =============
  if (matchesDriveSearchPhrases(msg)) {
    return { type: 'drive_search' };
  }
  
  // ============= DOCUMENT ROUTING =============
  const documentRoute = matchesDocumentPhrases(msg);
  if (documentRoute) {
    return documentRoute;
  }
  
  // No explicit routing detected - let AI handle
  return { type: 'none' };
}

/**
 * Check if message matches cancel/abort phrases
 */
export function matchesCancelPhrases(msg: string): boolean {
  const cancelPhrases = [
    'cancel that',
    'cancel',
    'never mind',
    'nevermind',
    'forget it',
    'forget that',
    'stop',
    'abort',
    'no wait',
    'no, wait',
    'actually no',
    'actually, no',
    'scratch that',
    'don\'t do that',
    'dont do that'
  ];
  
  // Exact match or phrase at start of message
  return cancelPhrases.some(phrase => 
    msg === phrase || 
    msg.startsWith(phrase + ' ') ||
    msg.startsWith(phrase + ',') ||
    msg.startsWith(phrase + '.')
  );
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
    'meetings tomorrow',
    // Week phrases
    'calendar this week',
    'calendar next week',
    'this week\'s calendar',
    'this weeks calendar',
    'what\'s on my calendar this week',
    'whats on my calendar this week',
    'schedule this week',
    'schedule for the week',
    'schedule for this week',
    'meetings this week',
    'my week ahead',
    'week\'s schedule',
    'weeks schedule',
    'what do i have this week',
    'what\'s happening this week',
    'whats happening this week',
    // Explicit "next X days" patterns
    'next 7 days',
    'next seven days',
    'next 7 day',
    'coming 7 days',
    'coming week',
    'upcoming 7 days',
    'upcoming week',
    'for the week',
    'this coming week',
    'for the next 7 days',
    'for the next seven days',
    'calendar for the next 7 days',
    'calendar for the next seven days',
    'what\'s on my calendar for the next 7 days',
    'whats on my calendar for the next 7 days'
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
 * Check if message matches contact lookup phrases
 */
export function matchesContactPhrases(msg: string): RouteDecision | null {
  // Contact LOOKUP phrases - find someone's email/phone
  const lookupPhrases = [
    'what\'s .* email',
    'whats .* email',
    'find .* email',
    'get .* email',
    'what\'s .* phone',
    'whats .* phone',
    'find .* phone',
    'get .* phone',
    'find contact',
    'look up contact',
    'lookup contact',
    'search contact',
    'find .* number',
    'what is .* email',
    'what is .* phone'
  ];
  
  // Check regex patterns
  if (lookupPhrases.some(pattern => {
    const regex = new RegExp(pattern, 'i');
    return regex.test(msg);
  })) {
    return { type: 'contact_lookup' };
  }
  
  return null;
}

/**
 * Extract sender name from Gmail search phrases
 */
export function extractGmailSearchSender(msg: string): string | null {
  const patterns = [
    /find (?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    /(?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    /show (?:me )?(?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    /search (?:for )?(?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    /pull up (?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    /look for (?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i
  ];
  
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extract contact name from lookup phrases
 */
export function extractContactName(msg: string): string | null {
  const patterns = [
    /what(?:'s|s| is) (.+?)(?:'s)? email/i,
    /find (.+?)(?:'s)? email/i,
    /get (.+?)(?:'s)? email/i,
    /what(?:'s|s| is) (.+?)(?:'s)? phone/i,
    /find (.+?)(?:'s)? phone/i,
    /get (.+?)(?:'s)? phone/i,
    /find (.+?)(?:'s)? number/i,
    /look ?up contact (.+)/i,
    /find contact (.+)/i,
    /search contact (.+)/i
  ];
  
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Check if message matches Google Drive search phrases
 */
export function matchesDriveSearchPhrases(msg: string): boolean {
  const driveSearchPhrases = [
    'find in drive',
    'search drive',
    'search my drive',
    'search google drive',
    'search in drive',
    'find in google drive',
    'locate in drive',
    'locate in google drive',
    'find my file',
    'find the file',
    'where is the document',
    'where is my document',
    'find document in drive',
    'search for document',
    'look for file in drive',
    'look for document in drive',
    'drive search',
    'search my files',
    'find file called',
    'find document called',
    'locate file'
  ];
  
  return driveSearchPhrases.some(phrase => msg.includes(phrase));
}

/**
 * Check if message matches document Q&A phrases
 */
export function matchesDocumentPhrases(msg: string): RouteDecision | null {
  // Document LIST/RECALL phrases
  const listPhrases = [
    'what documents have i uploaded',
    'what documents did i upload',
    'show my documents',
    'list my documents',
    'my uploaded documents',
    'what files have i uploaded',
    'show uploaded files',
    'list uploaded files',
    'what pdfs have i uploaded',
    'what docs have i uploaded'
  ];
  
  if (listPhrases.some(phrase => msg.includes(phrase))) {
    return { type: 'document_list' };
  }
  
  // Document RECALL phrases - open a previous document
  const recallPatterns = [
    /open (?:the )?(?:pdf|doc|document|file) (?:from|called|named)/i,
    /use (?:the )?(?:pdf|doc|document|file) (?:from|called|named)/i,
    /go back to (?:the )?(?:pdf|doc|document|file)/i,
    /switch to (?:the )?(?:pdf|doc|document|file)/i,
    /load (?:the )?(?:pdf|doc|document|file)/i
  ];
  
  if (recallPatterns.some(pattern => pattern.test(msg))) {
    return { type: 'document_recall' };
  }
  
  // Document Q&A phrases - questions about document content
  const qnaPhrases = [
    'summarize this',
    'summarize the document',
    'summarize this document',
    'summarise this',
    'summarise the document',
    'what does this say',
    'what does the document say',
    'what\'s in this document',
    'whats in this document',
    'what is in this document',
    'extract from this',
    'extract action items',
    'key points from this',
    'key takeaways',
    'main points',
    'clean this up',
    'reformat this'
  ];
  
  // Also match patterns like "what does it say about X"
  const aboutPatterns = [
    /what does (?:it|this|the document) say about/i,
    /what (?:is|are) the .* in (?:this|the) document/i,
    /find .* in (?:this|the) document/i,
    /search (?:this|the) document for/i
  ];
  
  if (qnaPhrases.some(phrase => msg.includes(phrase)) ||
      aboutPatterns.some(pattern => pattern.test(msg))) {
    return { type: 'document_qna' };
  }
  
  return null;
}

/**
 * Extract document name from recall phrases
 */
export function extractDocumentName(msg: string): string | null {
  const patterns = [
    /open (?:the )?(?:pdf|doc|document|file) (?:from|called|named) ["']?(.+?)["']?$/i,
    /use (?:the )?(?:pdf|doc|document|file) (?:from|called|named) ["']?(.+?)["']?$/i,
    /load (?:the )?(?:pdf|doc|document|file) ["']?(.+?)["']?$/i,
    /(?:pdf|doc|document|file) (?:from|called|named) ["']?(.+?)["']?$/i
  ];
  
  for (const pattern of patterns) {
    const match = msg.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
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
    case 'document_list':
      return 'Document - List Uploaded';
    case 'document_recall':
      return 'Document - Recall Previous';
    case 'drive_search':
      return 'Drive - Search Files';
    case 'web_search':
      return 'Web Search';
    case 'cancel_action':
      return 'Cancel - Abort Current Action';
    case 'none':
      return 'No explicit route - AI will decide';
  }
}

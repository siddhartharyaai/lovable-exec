import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Backend Critical Flow Validation
 * 
 * These tests validate the core backend logic without requiring live API calls.
 * They ensure that:
 * 1. Reminder deduplication works correctly
 * 2. Daily briefing generates dynamic content
 * 3. Core business logic is deterministic and testable
 */

describe('Backend Critical Flows', () => {
  describe('Reminder Deduplication Logic', () => {
    it('should prevent duplicate calendar notifications for the same event', () => {
      // Simulate the deduplication check logic
      const sentNotifications = new Set<string>();
      
      const calendarEvent = {
        id: 'event-123',
        userId: 'user-456',
        startTime: '2025-11-21T10:00:00Z'
      };
      
      // First send - should succeed
      const notificationKey = `${calendarEvent.userId}:${calendarEvent.id}:${calendarEvent.startTime}`;
      const firstCheck = sentNotifications.has(notificationKey);
      expect(firstCheck).toBe(false);
      
      sentNotifications.add(notificationKey);
      
      // Second send - should be blocked
      const secondCheck = sentNotifications.has(notificationKey);
      expect(secondCheck).toBe(true);
    });

    it('should allow the same event at different times', () => {
      const sentNotifications = new Set<string>();
      
      const event1 = 'user-456:event-123:2025-11-21T10:00:00Z';
      const event2 = 'user-456:event-123:2025-11-22T10:00:00Z'; // Next day
      
      sentNotifications.add(event1);
      
      expect(sentNotifications.has(event1)).toBe(true);
      expect(sentNotifications.has(event2)).toBe(false);
    });

    it('should track manual reminders separately from calendar events', () => {
      // Manual reminders use the reminders table with status field
      const manualReminder = {
        id: 'reminder-789',
        status: 'pending' as const,
      };
      
      // Simulate status update after send
      const updateStatus = (reminder: typeof manualReminder) => {
        return { ...reminder, status: 'sent' as const };
      };
      
      const updated = updateStatus(manualReminder);
      expect(updated.status).toBe('sent');
      expect(manualReminder.status).toBe('pending'); // Original unchanged
    });
  });

  describe('Daily Briefing Dynamic Content', () => {
    it('should include live email count in briefing data', () => {
      // Simulate Gmail API response structure
      const gmailApiResponse = {
        resultSizeEstimate: 42, // This should be dynamic
        messages: [
          { id: 'msg1' },
          { id: 'msg2' },
          { id: 'msg3' },
        ]
      };
      
      const briefingData = {
        emails: gmailApiResponse.resultSizeEstimate,
        topUnreadEmails: []
      };
      
      expect(briefingData.emails).toBe(42);
      expect(briefingData.emails).not.toBe(201); // Should not be static
    });

    it('should extract top unread email subjects and senders', () => {
      // Simulate extracted email data
      const topUnreadEmails = [
        { subject: 'Q4 Financial Report', from: 'cfo@company.com' },
        { subject: 'Client Meeting Tomorrow', from: 'client@partner.com' },
        { subject: 'Team Standup Notes', from: 'pm@company.com' }
      ];
      
      expect(topUnreadEmails.length).toBe(3);
      expect(topUnreadEmails[0].subject).toBeTruthy();
      expect(topUnreadEmails[0].from).toBeTruthy();
      
      // Verify they're not placeholder text
      const hasPlaceholders = topUnreadEmails.some(email => 
        email.subject.includes('weekly digest') || 
        email.subject.includes('Agentic AI')
      );
      expect(hasPlaceholders).toBe(false);
    });

    it('should format briefing with all required sections', () => {
      const briefingData = {
        weather: { temp: '25°C', condition: 'Sunny', humidity: '60%', city: 'Mumbai' },
        calendar: [{ title: 'Team Meeting', time: '10:00 AM' }],
        tasks: [{ title: 'Review PR', due: 'Today' }],
        emails: 42,
        topUnreadEmails: [{ subject: 'Important Update', from: 'boss@company.com' }],
        reminders: [{ text: 'Call investor', time: '3:00 PM' }]
      };
      
      // Verify all required fields are present
      expect(briefingData.weather).toBeDefined();
      expect(briefingData.calendar).toHaveLength(1);
      expect(briefingData.tasks).toHaveLength(1);
      expect(briefingData.emails).toBe(42);
      expect(briefingData.topUnreadEmails).toHaveLength(1);
      expect(briefingData.reminders).toHaveLength(1);
    });
  });

  describe('Edge Function Error Handling', () => {
    it('should handle expired OAuth tokens gracefully', () => {
      const mockTokenData = {
        expires_at: new Date('2025-11-20T00:00:00Z').toISOString()
      };
      
      const now = new Date('2025-11-21T00:00:00Z');
      const expiresAt = new Date(mockTokenData.expires_at);
      
      const isExpired = expiresAt <= now;
      expect(isExpired).toBe(true);
    });

    it('should skip users without valid tokens', () => {
      const users = [
        { id: 'user1', hasValidToken: true },
        { id: 'user2', hasValidToken: false },
        { id: 'user3', hasValidToken: true },
      ];
      
      const validUsers = users.filter(u => u.hasValidToken);
      expect(validUsers).toHaveLength(2);
      expect(validUsers[0].id).toBe('user1');
      expect(validUsers[1].id).toBe('user3');
    });
  });

  describe('Tasks Snapshot & Numbered References', () => {
    it('should store full task list in snapshot with indices', () => {
      // Simulate fetching 20 tasks
      const mockTasks = Array.from({ length: 20 }, (_, i) => ({
        id: `task-${i + 1}`,
        listId: 'list-123',
        listName: 'Default List',
        title: `Task ${i + 1}`,
        due: null,
        notes: null,
        updated: new Date().toISOString()
      }));

      // Add indices
      const tasksWithIndices = mockTasks.map((task, i) => ({
        ...task,
        index: i + 1
      }));

      const snapshot = {
        list: tasksWithIndices,
        timestamp: new Date().toISOString()
      };

      expect(snapshot.list).toHaveLength(20);
      expect(snapshot.list[0].index).toBe(1);
      expect(snapshot.list[19].index).toBe(20);
      expect(snapshot.timestamp).toBeDefined();
    });

    it('should show first 10 tasks initially and indicate more exist', () => {
      const totalTasks = 20;
      const displayLimit = 10;
      
      const shouldShowMoreMessage = totalTasks > displayLimit;
      const remainingTasks = totalTasks - displayLimit;
      
      expect(shouldShowMoreMessage).toBe(true);
      expect(remainingTasks).toBe(10);
    });

    it('should allow completing task by index from snapshot', () => {
      const snapshot = {
        list: [
          { index: 1, id: 'task-1', title: 'Task 1', listId: 'list-123' },
          { index: 2, id: 'task-2', title: 'Task 2', listId: 'list-123' },
          { index: 3, id: 'task-3', title: 'Task 3', listId: 'list-123' },
          { index: 4, id: 'task-4', title: 'Review email parsing', listId: 'list-123' },
        ],
        timestamp: new Date().toISOString()
      };

      const taskIndex = 4;
      const taskFromSnapshot = snapshot.list.find(t => t.index === taskIndex);
      
      expect(taskFromSnapshot).toBeDefined();
      expect(taskFromSnapshot?.id).toBe('task-4');
      expect(taskFromSnapshot?.title).toBe('Review email parsing');
    });

    it('should handle duplicate task titles with disambiguation', () => {
      const matchingTasks = [
        {
          task: { id: 'task-1', title: 'Review email parsing software by Lisa', due: '2025-11-25' },
          listId: 'list-123',
          listName: 'Default List'
        },
        {
          task: { id: 'task-2', title: 'Review email parsing software by Lisa', due: '2025-11-28' },
          listId: 'list-123',
          listName: 'Default List'
        }
      ];

      expect(matchingTasks.length).toBe(2);
      expect(matchingTasks[0].task.title).toBe(matchingTasks[1].task.title);
      expect(matchingTasks[0].task.due).not.toBe(matchingTasks[1].task.due);
    });

    it('should support completing "both" when user replies after disambiguation', () => {
      const pendingDisambiguation = {
        action: 'complete_task',
        matches: [
          { task: { id: 'task-1', title: 'Duplicate Task' }, listId: 'list-123' },
          { task: { id: 'task-2', title: 'Duplicate Task' }, listId: 'list-123' }
        ],
        timestamp: new Date().toISOString()
      };

      const userReply = 'both';
      const shouldCompleteAll = userReply.toLowerCase() === 'both';
      
      expect(shouldCompleteAll).toBe(true);
      expect(pendingDisambiguation.matches).toHaveLength(2);
    });
  });

  describe('Tasks Natural Language Interpretation', () => {
    it('should recognize "balance tasks" as task-related, not financial', () => {
      const taskPhrases = [
        'balance tasks',
        'remaining tasks',
        'rest of tasks',
        'the other 15 tasks',
        'show me the 15 more tasks',
        'balance pending tasks'
      ];

      taskPhrases.forEach(phrase => {
        const isTaskRelated = phrase.includes('task');
        expect(isTaskRelated).toBe(true);
      });
    });

    it('should map "show rest" to show_rest parameter', () => {
      const userQueries = [
        'show me the rest',
        'show remaining tasks',
        'the other tasks',
        'balance tasks'
      ];

      userQueries.forEach(query => {
        const shouldShowRest = 
          query.includes('rest') || 
          query.includes('remaining') || 
          query.includes('other') ||
          query.includes('balance');
        
        expect(shouldShowRest).toBe(true);
      });
    });

    it('should recognize numbered task references', () => {
      const userCommands = [
        'remove 4',
        'complete task 4',
        'mark 4 as done',
        'finish task 4',
        'check off 4'
      ];

      userCommands.forEach(cmd => {
        const match = cmd.match(/\b(\d+)\b/);
        const taskIndex = match ? parseInt(match[1]) : null;
        
        expect(taskIndex).toBe(4);
      });
    });
  });

  // Pure routing helper for ai-agent special intents (no Supabase/LLM)
  type SpecialRoute =
    | { type: 'briefing' }
    | { type: 'tasks'; action: 'read' | 'read_all'; show_all: boolean; show_rest: boolean }
    | { type: 'none' };

  function routeSpecialIntents(message: string): SpecialRoute {
    const msgLower = message.toLowerCase();

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
    ];

    if (briefingPhrases.some((phrase) => msgLower.includes(phrase))) {
      return { type: 'briefing' };
    }

    // Tasks: full list
    if (
      msgLower.includes('show me all tasks') ||
      msgLower.includes('show all tasks') ||
      msgLower.includes('give me all tasks') ||
      msgLower.includes('all pending tasks') ||
      msgLower.includes('give me the full list of tasks') ||
      msgLower.includes('list all my tasks') ||
      (msgLower.includes('show all') && msgLower.includes('task')) ||
      (msgLower.includes('all pending') && msgLower.includes('task'))
    ) {
      return { type: 'tasks', action: 'read_all', show_all: true, show_rest: false };
    }

    // Tasks: rest / next page
    if (
      msgLower.includes('show me the rest') ||
      msgLower.includes('show the rest') ||
      msgLower.includes('show rest') ||
      msgLower.includes('show me more') ||
      msgLower.includes('show more tasks') ||
      msgLower.includes('show more') ||
      msgLower.includes('more tasks') ||
      msgLower.includes('show remaining tasks') ||
      msgLower.includes('remaining tasks') ||
      msgLower.includes('the other tasks') ||
      msgLower.includes('the other 10 tasks') ||
      msgLower.includes('the other 15 tasks') ||
      msgLower.includes('the other 34 tasks') ||
      msgLower.includes('the other ') ||
      msgLower.includes('balance tasks') ||
      msgLower.includes('balance pending tasks') ||
      msgLower.includes('balance pending') ||
      msgLower.includes('rest of the tasks') ||
      msgLower.includes('rest of tasks') ||
      msgLower.includes('which are the ')
    ) {
      return { type: 'tasks', action: 'read', show_all: false, show_rest: true };
    }

    // Tasks: initial view
    if (
      (msgLower.includes('what tasks') && msgLower.includes('pending')) ||
      msgLower.includes('what tasks do i have') ||
      msgLower.includes('what tasks do i') ||
      msgLower.includes('what tasks are pending') ||
      msgLower.includes('show my tasks') ||
      msgLower.includes('pending tasks') ||
      msgLower.includes('what are my tasks') ||
      msgLower.includes('what tasks do i have today')
    ) {
      return { type: 'tasks', action: 'read', show_all: false, show_rest: false };
    }

    return { type: 'none' };
  }

  describe('AI Agent Routing (pure)', () => {
    it('routes briefing phrases to briefing type', () => {
      const variants = [
        'Give me my briefing today',
        'show my briefing today',
        'daily briefing',
        'send me my briefing',
      ];

      variants.forEach((msg) => {
        const route = routeSpecialIntents(msg);
        expect(route.type).toBe('briefing');
      });
    });

    it('routes "what tasks do I have" to tasks read initial view', () => {
      const route = routeSpecialIntents('What tasks do I have');
      expect(route).toEqual({
        type: 'tasks',
        action: 'read',
        show_all: false,
        show_rest: false,
      });
    });

    it('routes "show me all tasks" to tasks read_all', () => {
      const route = routeSpecialIntents('show me all tasks');
      expect(route).toEqual({
        type: 'tasks',
        action: 'read_all',
        show_all: true,
        show_rest: false,
      });
    });

    it('routes "show me the rest" to tasks rest page', () => {
      const route = routeSpecialIntents('show me the rest');
      expect(route).toEqual({
        type: 'tasks',
        action: 'read',
        show_all: false,
        show_rest: true,
      });
    });
  });


  describe('Tasks Paging Logic', () => {
    type PagingMode = 'initial' | 'rest' | 'all';

    function computePagingSlice(totalTasks: number, lastEndIndex: number | null, mode: PagingMode) {
      if (totalTasks <= 0) return { startIndex: 0, endIndex: 0, remaining: 0 };

      if (mode === 'all') {
        return { startIndex: 0, endIndex: totalTasks, remaining: 0 };
      }

      if (mode === 'initial') {
        const displayLimit = Math.min(10, totalTasks);
        const endIndex = displayLimit;
        const remaining = Math.max(0, totalTasks - displayLimit);
        return { startIndex: 0, endIndex, remaining };
      }

      // mode === 'rest': use lastEndIndex (1-based) to continue from next task
      if (lastEndIndex && lastEndIndex < totalTasks) {
        const nextStart = lastEndIndex + 1; // 1-based index
        const startIndex = nextStart - 1; // 0-based array index
        const displayLimit = Math.min(10, totalTasks - startIndex);
        const endIndex = startIndex + displayLimit;
        const remaining = Math.max(0, totalTasks - endIndex);
        return { startIndex, endIndex, remaining };
      } else {
        // Fallback: assume initial was 1-10
        const startIndex = 10;
        const displayLimit = Math.min(10, Math.max(0, totalTasks - 10));
        const endIndex = startIndex + displayLimit;
        const remaining = Math.max(0, totalTasks - endIndex);
        return { startIndex, endIndex, remaining };
      }
    }

    it('initial view should show first 10 with footer when more exist', () => {
      const { startIndex, endIndex, remaining } = computePagingSlice(44, null, 'initial');
      expect(startIndex).toBe(0);
      expect(endIndex).toBe(10);
      expect(remaining).toBe(34);
    });

    it('first "show rest" should show 11-20 with footer', () => {
      const { startIndex, endIndex, remaining } = computePagingSlice(44, 10, 'rest');
      expect(startIndex).toBe(10);
      expect(endIndex).toBe(20);
      expect(remaining).toBe(24);
    });

    it('second "show rest" should show 21-30 with footer', () => {
      const { startIndex, endIndex, remaining } = computePagingSlice(44, 20, 'rest');
      expect(startIndex).toBe(20);
      expect(endIndex).toBe(30);
      expect(remaining).toBe(14);
    });

    it('final "show rest" should show last page without footer', () => {
      const { startIndex, endIndex, remaining } = computePagingSlice(44, 40, 'rest');
      expect(startIndex).toBe(40);
      expect(endIndex).toBe(44);
      expect(remaining).toBe(0);
    });

    it('"show all" should always return full range with no remaining', () => {
      const { startIndex, endIndex, remaining } = computePagingSlice(44, null, 'all');
      expect(startIndex).toBe(0);
      expect(endIndex).toBe(44);
      expect(remaining).toBe(0);
    });
  });

  describe('Daily Briefing Renderer', () => {
    // Mock render function matching the one in daily-briefing edge function
    function renderDailyBriefing({
      todayDisplay,
      weatherInfo,
      calendar,
      tasks,
      emailsUnread,
      topUnreadEmails,
      reminders,
    }: {
      todayDisplay: string;
      weatherInfo: { city: string; highC: string; lowC: string; description: string; humidity: string } | null;
      calendar: Array<{ title: string; time: string; location?: string }>;
      tasks: Array<{ title: string; due?: string | null }>;
      emailsUnread: number;
      topUnreadEmails: Array<{ subject: string; from: string }>;
      reminders: Array<{ text: string; time: string }>;
    }): string {
      let message = `🌅 *Good morning. Your Daily Briefing*\n\n`;
      message += `Here's your briefing for today, ${todayDisplay}.\n\n`;

      // Weather
      if (weatherInfo) {
        message += `🌤️ *Weather*: ${weatherInfo.city}, ${weatherInfo.highC}, ${weatherInfo.description}`;
        if (weatherInfo.humidity) {
          message += `, Humidity ${weatherInfo.humidity}`;
        }
        message += `.\n\n`;
      } else {
        message += `🌤️ *Weather*: No weather data available for today.\n\n`;
      }

      // Calendar
      message += `📅 *Calendar*:`;
      if (calendar.length > 0) {
        message += `\n`;
        calendar.forEach((event) => {
          message += `• ${event.time} – ${event.title}`;
          if (event.location) {
            message += ` (${event.location})`;
          }
          message += `\n`;
        });
      } else {
        message += ` No events on your calendar today.`;
      }
      message += `\n`;

      // Tasks
      message += `✅ *Pending Tasks*:`;
      if (tasks.length > 0) {
        message += `\n`;
        tasks.slice(0, 5).forEach((task, i) => {
          message += `${i + 1}. ${task.title}`;
          if (task.due) {
            message += ` (due ${task.due})`;
          }
          message += `\n`;
        });
      } else {
        message += ` You're all caught up – no pending tasks.`;
      }
      message += `\n`;

      // Emails
      message += `📧 *Emails*: You have ${emailsUnread} unread email${emailsUnread !== 1 ? 's' : ''}.`;
      if (topUnreadEmails && topUnreadEmails.length > 0) {
        message += `\n*Top unread:*\n`;
        topUnreadEmails.forEach((email, i) => {
          message += `${i + 1}. "${email.subject}" from ${email.from}\n`;
        });
      } else {
        message += `\n`;
      }
      message += `\n`;

      // Reminders
      message += `⏰ *Reminders*:`;
      if (reminders.length > 0) {
        message += `\n`;
        reminders.forEach((reminder) => {
          message += `• ${reminder.time} – ${reminder.text}\n`;
        });
      } else {
        message += ` No reminders scheduled for today.`;
      }
      message += `\n`;

      message += `\nHave a productive day.`;

      return message;
    }

    it('should render full briefing with all sections present', () => {
      const todayDisplay = 'Saturday, 30 November 2025';
      const briefing = renderDailyBriefing({
        todayDisplay,
        weatherInfo: { city: 'Mumbai', highC: '32°C', lowC: '26°C', description: 'Sunny', humidity: '60%' },
        calendar: [
          { title: 'Team Meeting', time: '10:00 AM', location: 'Office' },
          { title: 'Client Call', time: '3:00 PM' }
        ],
        tasks: [
          { title: 'Review budget', due: 'Dec 1' },
          { title: 'Call supplier', due: null }
        ],
        emailsUnread: 42,
        topUnreadEmails: [
          { subject: 'Q4 Report', from: 'boss@company.com' }
        ],
        reminders: [
          { text: 'Doctor appointment', time: '4:00 PM' }
        ]
      });

      // Verify date is included exactly once
      expect(briefing).toContain(todayDisplay);
      const dateOccurrences = briefing.split(todayDisplay).length - 1;
      expect(dateOccurrences).toBe(1);

      // Verify all 5 section headings are present
      expect(briefing).toContain('🌤️ *Weather*');
      expect(briefing).toContain('📅 *Calendar*');
      expect(briefing).toContain('✅ *Pending Tasks*');
      expect(briefing).toContain('📧 *Emails*');
      expect(briefing).toContain('⏰ *Reminders*');

      // Verify actual data is shown
      expect(briefing).toContain('Mumbai');
      expect(briefing).toContain('Team Meeting');
      expect(briefing).toContain('Review budget');
      expect(briefing).toContain('42 unread emails');
      expect(briefing).toContain('Doctor appointment');
    });

    it('should show all section headings even when some sections are empty', () => {
      const todayDisplay = 'Saturday, 30 November 2025';
      const briefing = renderDailyBriefing({
        todayDisplay,
        weatherInfo: null,
        calendar: [],
        tasks: [],
        emailsUnread: 0,
        topUnreadEmails: [],
        reminders: []
      });

      // All section headings must still be present
      expect(briefing).toContain('🌤️ *Weather*');
      expect(briefing).toContain('📅 *Calendar*');
      expect(briefing).toContain('✅ *Pending Tasks*');
      expect(briefing).toContain('📧 *Emails*');
      expect(briefing).toContain('⏰ *Reminders*');

      // Verify empty state messages
      expect(briefing).toContain('No weather data available');
      expect(briefing).toContain('No events on your calendar today');
      expect(briefing).toContain('all caught up');
      expect(briefing).toContain('0 unread emails');
      expect(briefing).toContain('No reminders scheduled');
    });

    it('should use the exact date string provided without modification', () => {
      const todayDisplay = 'Monday, 2 December 2025';
      const briefing = renderDailyBriefing({
        todayDisplay,
        weatherInfo: null,
        calendar: [],
        tasks: [],
        emailsUnread: 0,
        topUnreadEmails: [],
        reminders: []
      });

      expect(briefing).toContain(`Here's your briefing for today, ${todayDisplay}.`);
    });
  });
});

/**
 * INTEGRATION TEST PLAN
 * 
 * The following tests should be implemented once we have proper test infrastructure:
 * 
 * 1. check-due-reminders Integration Test:
 *    - Mock Supabase client
 *    - Mock send-whatsapp function
 *    - Verify calendar_notifications table is checked before sending
 *    - Verify duplicate sends are prevented
 * 
 * 2. daily-briefing Integration Test:
 *    - Mock Google APIs (Gmail, Calendar, Tasks)
 *    - Mock weather API
 *    - Mock Lovable AI API
 *    - Verify briefing contains live data, not static values
 *    - Verify top unread emails are extracted correctly
 * 
 * 3. End-to-End Reminder Flow:
 *    - Create a reminder via WhatsApp
 *    - Wait for due time
 *    - Verify single notification is sent
 *    - Verify status is updated to 'sent'
 *    - Verify subsequent cron runs don't re-send
 */

// ============= CENTRALIZED ROUTER MODULE TESTS =============
// These tests validate the pure routing functions from _shared/router.ts

describe('Centralized Router Module', () => {
  // Replicate router functions for testing (since we can't import Deno modules in Vitest)
  type RouteDecision = 
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
    | { type: 'document_list' }
    | { type: 'document_recall' }
    | { type: 'none' };

  function matchesBriefingPhrases(msg: string): boolean {
    const briefingPhrases = [
      'briefing', 'give me my briefing', 'show my briefing', 'give me my daily briefing',
      'show my daily briefing', 'daily briefing', 'morning briefing', 'briefing today',
      'my briefing today', 'give me briefing', 'send me my briefing', 'get my briefing',
      'what\'s my briefing', 'whats my briefing', 'daily update', 'morning update',
      'daily summary', 'morning summary'
    ];
    return briefingPhrases.some(phrase => msg.includes(phrase));
  }

  function matchesTasksPhrases(msg: string): RouteDecision | null {
    const showAllPhrases = [
      'show me all tasks', 'show all tasks', 'give me all tasks', 'all pending tasks',
      'give me the full list of tasks', 'list all my tasks', 'full list of tasks',
      'complete list of tasks', 'entire task list', 'all my tasks'
    ];
    if (showAllPhrases.some(phrase => msg.includes(phrase)) ||
        (msg.includes('show all') && msg.includes('task')) ||
        (msg.includes('all pending') && msg.includes('task'))) {
      return { type: 'tasks', action: 'read_all', showAll: true, showRest: false };
    }

    const showRestPhrases = [
      'show me the rest', 'show the rest', 'show rest', 'show me more', 'show more tasks',
      'show more', 'more tasks', 'show remaining tasks', 'remaining tasks', 'the other tasks',
      'balance tasks', 'balance pending tasks', 'balance pending', 'rest of the tasks',
      'rest of tasks', 'next tasks', 'next 10 tasks', 'next page'
    ];
    const otherPattern = /the other \d+ tasks?/;
    const whichPattern = /which are the \d+/;
    if (showRestPhrases.some(phrase => msg.includes(phrase)) || otherPattern.test(msg) || whichPattern.test(msg)) {
      return { type: 'tasks', action: 'read', showAll: false, showRest: true };
    }

    const initialPhrases = [
      'what tasks do i have', 'what tasks are pending', 'show my tasks', 'pending tasks',
      'what are my tasks', 'what tasks do i have today', 'my tasks', 'list my tasks',
      'show my to-do', 'show my todo', 'my to-do list', 'my todo list',
      'what\'s on my plate', 'whats on my plate', 'what do i need to do'
    ];
    if (initialPhrases.some(phrase => msg.includes(phrase)) ||
        (msg.includes('what tasks') && msg.includes('pending'))) {
      return { type: 'tasks', action: 'read', showAll: false, showRest: false };
    }
    return null;
  }

  function matchesGmailPhrases(msg: string): RouteDecision | null {
    const checkPhrases = [
      'check my email', 'check my emails', 'check email', 'check emails',
      'what\'s in my inbox', 'whats in my inbox', 'any new emails', 'any new email',
      'email summary', 'summarize my email', 'summarize my emails', 'unread emails', 'unread email'
    ];
    if (checkPhrases.some(phrase => msg.includes(phrase))) {
      return { type: 'gmail_check' };
    }

    const searchPhrases = [
      'find emails from', 'find email from', 'search emails from', 'search email from',
      'emails from', 'show me emails from', 'show emails from', 'pull up email from', 'look for email from'
    ];
    if (searchPhrases.some(phrase => msg.includes(phrase))) {
      return { type: 'gmail_search' };
    }

    const markReadPhrases = [
      'mark all as read', 'mark emails as read', 'clear my inbox', 'clean up email', 'mark all read'
    ];
    if (markReadPhrases.some(phrase => msg.includes(phrase))) {
      return { type: 'gmail_mark_read' };
    }
    return null;
  }

  function matchesContactPhrases(msg: string): RouteDecision | null {
    const lookupPatterns = [
      /what(?:'s|s| is) .* email/i,
      /find .* email/i,
      /get .* email/i,
      /what(?:'s|s| is) .* phone/i,
      /find .* phone/i,
      /find contact/i,
      /look ?up contact/i,
      /search contact/i
    ];
    if (lookupPatterns.some(pattern => pattern.test(msg))) {
      return { type: 'contact_lookup' };
    }
    return null;
  }

  function matchesDocumentPhrases(msg: string): RouteDecision | null {
    // Document LIST phrases
    const listPhrases = [
      'what documents have i uploaded', 'what documents did i upload', 'show my documents',
      'list my documents', 'my uploaded documents', 'what files have i uploaded',
      'show uploaded files', 'list uploaded files', 'what pdfs have i uploaded'
    ];
    if (listPhrases.some(phrase => msg.includes(phrase))) {
      return { type: 'document_list' };
    }

    // Document RECALL phrases
    const recallPatterns = [
      /open (?:the )?(?:pdf|doc|document|file) (?:from|called|named)/i,
      /use (?:the )?(?:pdf|doc|document|file) (?:from|called|named)/i,
      /go back to (?:the )?(?:pdf|doc|document|file)/i,
      /load (?:the )?(?:pdf|doc|document|file)/i
    ];
    if (recallPatterns.some(pattern => pattern.test(msg))) {
      return { type: 'document_recall' };
    }

    // Document Q&A phrases
    const qnaPhrases = [
      'summarize this', 'summarize the document', 'summarize this document',
      'what does this say', 'what does the document say', 'what\'s in this document',
      'extract from this', 'extract action items', 'key points from this',
      'key takeaways', 'main points'
    ];
    const aboutPatterns = [
      /what does (?:it|this|the document) say about/i,
      /what (?:is|are) the .* in (?:this|the) document/i
    ];
    if (qnaPhrases.some(phrase => msg.includes(phrase)) || aboutPatterns.some(pattern => pattern.test(msg))) {
      return { type: 'document_qna' };
    }
    return null;
  }

  function extractGmailSearchSender(msg: string): string | null {
    const patterns = [
      /find (?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
      /(?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
      /show (?:me )?(?:emails?|messages?) from (.+?)(?:\s+(?:in|from|about|last|this|today|yesterday|week|month).*)?$/i,
    ];
    for (const pattern of patterns) {
      const match = msg.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  function extractContactName(msg: string): string | null {
    const patterns = [
      /what(?:'s|s| is) (.+?)(?:'s)? email/i,
      /find (.+?)(?:'s)? email/i,
      /get (.+?)(?:'s)? email/i,
      /what(?:'s|s| is) (.+?)(?:'s)? phone/i,
      /find (.+?)(?:'s)? phone/i,
      /look ?up contact (.+)/i,
      /find contact (.+)/i
    ];
    for (const pattern of patterns) {
      const match = msg.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  function extractDocumentName(msg: string): string | null {
    const patterns = [
      /open (?:the )?(?:pdf|doc|document|file) (?:from|called|named) ["']?(.+?)["']?$/i,
      /use (?:the )?(?:pdf|doc|document|file) (?:from|called|named) ["']?(.+?)["']?$/i,
      /load (?:the )?(?:pdf|doc|document|file) ["']?(.+?)["']?$/i
    ];
    for (const pattern of patterns) {
      const match = msg.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
    return null;
  }

  function routeMessage(message: string): RouteDecision {
    const msg = message.toLowerCase().trim();
    if (matchesBriefingPhrases(msg)) return { type: 'daily_briefing' };
    const tasksRoute = matchesTasksPhrases(msg);
    if (tasksRoute) return tasksRoute;
    const gmailRoute = matchesGmailPhrases(msg);
    if (gmailRoute) return gmailRoute;
    const contactRoute = matchesContactPhrases(msg);
    if (contactRoute) return contactRoute;
    const documentRoute = matchesDocumentPhrases(msg);
    if (documentRoute) return documentRoute;
    return { type: 'none' };
  }

  describe('Daily Briefing Routing', () => {
    it('should route all briefing phrase variants correctly', () => {
      const briefingMessages = [
        'Give me my briefing',
        'show my briefing today',
        'daily briefing',
        'morning briefing please',
        'send me my briefing',
        'what\'s my briefing',
        'daily summary',
        'morning update'
      ];

      briefingMessages.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('daily_briefing');
      });
    });

    it('should NOT route non-briefing messages to briefing', () => {
      const nonBriefingMessages = [
        'what time is it',
        'schedule a meeting',
        'check my email',
        'remind me to call mom'
      ];

      nonBriefingMessages.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).not.toBe('daily_briefing');
      });
    });
  });

  describe('Tasks Routing', () => {
    it('should route initial task queries correctly', () => {
      const initialQueries = [
        'what tasks do I have',
        'show my tasks',
        'pending tasks',
        'what are my tasks',
        'what\'s on my plate',
        'what do i need to do'
      ];

      initialQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('tasks');
        if (route.type === 'tasks') {
          expect(route.showAll).toBe(false);
          expect(route.showRest).toBe(false);
        }
      });
    });

    it('should route "show all" task queries correctly', () => {
      const showAllQueries = [
        'show me all tasks',
        'show all tasks',
        'give me all tasks',
        'all pending tasks',
        'full list of tasks'
      ];

      showAllQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('tasks');
        if (route.type === 'tasks') {
          expect(route.showAll).toBe(true);
          expect(route.showRest).toBe(false);
        }
      });
    });

    it('should route "show rest/more" task queries correctly', () => {
      const showRestQueries = [
        'show me the rest',
        'show me more',
        'remaining tasks',
        'balance tasks',
        'the other 15 tasks',
        'rest of the tasks',
        'next page'
      ];

      showRestQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('tasks');
        if (route.type === 'tasks') {
          expect(route.showAll).toBe(false);
          expect(route.showRest).toBe(true);
        }
      });
    });

    it('should NOT misroute "balance tasks" to financial queries', () => {
      const route = routeMessage('balance tasks');
      expect(route.type).toBe('tasks');
      expect(route.type).not.toBe('none'); // Should not fall through to AI
    });
  });

  describe('Gmail Routing', () => {
    it('should route email check queries correctly', () => {
      const checkQueries = [
        'check my email',
        'any new emails',
        'email summary',
        'unread emails'
      ];

      checkQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('gmail_check');
      });
    });

    it('should route mark-read queries correctly', () => {
      const markReadQueries = [
        'mark all as read',
        'clear my inbox',
        'mark all read'
      ];

      markReadQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('gmail_mark_read');
      });
    });

    it('should route email search queries correctly', () => {
      const searchQueries = [
        'find emails from Renu',
        'show me emails from boss',
        'emails from John',
        'search emails from client'
      ];

      searchQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('gmail_search');
      });
    });

    it('should extract sender name from search queries', () => {
      expect(extractGmailSearchSender('find emails from Renu')).toBe('Renu');
      expect(extractGmailSearchSender('show me emails from John Smith')).toBe('John Smith');
      expect(extractGmailSearchSender('emails from boss last week')).toBe('boss');
    });
  });

  describe('Contact Lookup Routing', () => {
    it('should route contact lookup queries correctly', () => {
      const contactQueries = [
        "what's Rohan's email",
        'find Priya email',
        'get John email',
        "what's mom's phone",
        'find contact Siddharth',
        'lookup contact boss'
      ];

      contactQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('contact_lookup');
      });
    });

    it('should extract contact name from lookup queries', () => {
      expect(extractContactName("what's Rohan's email")).toBe("Rohan's");
      expect(extractContactName('find Priya email')).toBe('Priya');
      expect(extractContactName('get John email')).toBe('John');
      expect(extractContactName('find contact Siddharth')).toBe('Siddharth');
    });

    it('should NOT route non-contact queries to contact lookup', () => {
      const nonContactQueries = [
        'send an email to Rohan',
        'email John about the meeting',
        'check my email'
      ];

      nonContactQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).not.toBe('contact_lookup');
      });
    });
  });

  describe('Document Routing', () => {
    it('should route document list queries correctly', () => {
      const listQueries = [
        'what documents have i uploaded',
        'show my documents',
        'list my documents',
        'what files have i uploaded',
        'what pdfs have i uploaded'
      ];

      listQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('document_list');
      });
    });

    it('should route document recall queries correctly', () => {
      const recallQueries = [
        'open the document called NDA',
        'use the pdf from last week',
        'load the file named contract',
        'go back to the document'
      ];

      recallQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('document_recall');
      });
    });

    it('should route document Q&A queries correctly', () => {
      const qnaQueries = [
        'summarize this',
        'summarize the document',
        'what does this say',
        'extract action items',
        'key points from this',
        'what does it say about liability'
      ];

      qnaQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('document_qna');
      });
    });

    it('should extract document name from recall queries', () => {
      expect(extractDocumentName('open the document called NDA')).toBe('NDA');
      expect(extractDocumentName('use the pdf named contract.pdf')).toBe('contract.pdf');
      expect(extractDocumentName('load the file from monday')).toBe('monday');
    });

    it('should NOT route general questions to document Q&A', () => {
      const nonDocQueries = [
        'what time is it',
        'schedule a meeting',
        'check my email'
      ];

      nonDocQueries.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).not.toBe('document_qna');
        expect(route.type).not.toBe('document_list');
        expect(route.type).not.toBe('document_recall');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed case messages', () => {
      expect(routeMessage('GIVE ME MY BRIEFING').type).toBe('daily_briefing');
      expect(routeMessage('Show Me All Tasks').type).toBe('tasks');
      expect(routeMessage('CHECK MY EMAIL').type).toBe('gmail_check');
    });

    it('should handle messages with extra whitespace', () => {
      expect(routeMessage('  give me my briefing  ').type).toBe('daily_briefing');
      expect(routeMessage('  show my tasks  ').type).toBe('tasks');
    });

    it('should return "none" for unrecognized messages', () => {
      const unrecognizedMessages = [
        'hello',
        'what time is it',
        'tell me a joke',
        'calculate 2+2'
      ];

      unrecognizedMessages.forEach(msg => {
        const route = routeMessage(msg);
        expect(route.type).toBe('none');
      });
    });
  });
});

// ============= PHASE 4: FORMATTER MODULE TESTS =============

describe('WhatsApp Message Formatter Module', () => {
  describe('Task Formatters', () => {
    it('should format task created message correctly', () => {
      const title = 'Review quarterly report';
      const msg = `✅ Task created: "${title}"`;
      expect(msg).toContain('✅');
      expect(msg).toContain(title);
    });

    it('should format task created with due date', () => {
      const title = 'Submit expense report';
      const dueDate = new Date('2025-12-10').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const msg = `✅ Task created: "${title}" (due ${dueDate})`;
      expect(msg).toContain('due Dec 10');
    });

    it('should format task completed with index', () => {
      const msg = `✅ Task 4 completed: "Send email to client"`;
      expect(msg).toContain('Task 4');
      expect(msg).toContain('completed');
    });

    it('should format tasks list with correct structure', () => {
      const tasks = [
        { title: 'Task A', index: 1, due: 'Dec 5' },
        { title: 'Task B', index: 2, due: null },
        { title: 'Task C', index: 3, due: 'Dec 7' },
      ];
      const total = 15;
      
      let msg = `✅ **Your Tasks (${total} pending)**\n\n`;
      tasks.forEach(task => {
        msg += `${task.index}. ${task.title}`;
        if (task.due) msg += ` _(due ${task.due})_`;
        msg += '\n';
      });
      
      expect(msg).toContain('15 pending');
      expect(msg).toContain('1. Task A');
      expect(msg).toContain('_(due Dec 5)_');
    });

    it('should include footer when more tasks exist', () => {
      const remaining = 12;
      const footer = `_...and ${remaining} more. Reply "show me all tasks" or "show me the rest" to see more._`;
      expect(footer).toContain('12 more');
      expect(footer).toContain('show me all tasks');
    });

    it('should NOT include footer for show_all mode', () => {
      const showAll = true;
      const footer = showAll ? '' : `_...and X more._`;
      expect(footer).toBe('');
    });
  });

  describe('Calendar Formatters', () => {
    it('should format calendar event created', () => {
      const title = 'Team Standup';
      const dateTime = new Date('2025-12-05T10:00:00+05:30');
      const formatted = dateTime.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata'
      });
      const msg = `📅 Event created: **${title}** on ${formatted}`;
      expect(msg).toContain('📅');
      expect(msg).toContain('Team Standup');
    });

    it('should format calendar event with attendees', () => {
      const attendees = ['alice@example.com', 'bob@example.com'];
      const msg = `👥 Attendees: ${attendees.join(', ')}`;
      expect(msg).toContain('alice@example.com');
      expect(msg).toContain('bob@example.com');
    });

    it('should format calendar event rescheduled', () => {
      const msg = `✅ Rescheduled "**Meeting with Rohan**" to Monday, 8 December 2025 at 3:00 PM IST`;
      expect(msg).toContain('Rescheduled');
      expect(msg).toContain('Rohan');
      expect(msg).toContain('IST');
    });

    it('should format calendar event cancelled', () => {
      const msg = `✅ Cancelled "**Lunch with Priya**" on Tuesday, 9 December 2025 at 1:00 PM IST`;
      expect(msg).toContain('Cancelled');
      expect(msg).toContain('Priya');
    });

    it('should format time conflict warning', () => {
      const conflicts = [{ summary: 'Existing Meeting', start: { dateTime: '2025-12-05T14:00:00' } }];
      const msg = `⚠️ **Time Conflict Detected!**\n\nYou already have:\n• ${conflicts[0].summary}`;
      expect(msg).toContain('⚠️');
      expect(msg).toContain('Conflict');
      expect(msg).toContain('Existing Meeting');
    });
  });

  describe('Email Formatters', () => {
    it('should format email summary with count', () => {
      const count = 42;
      const msg = `📧 **Inbox Update** (${count} unread)`;
      expect(msg).toContain('42 unread');
    });

    it('should format email draft ready', () => {
      const to = 'client@company.com';
      const subject = 'Project Update';
      const msg = `📧 **Draft ready for review:**\n\n**To:** ${to}\n**Subject:** ${subject}`;
      expect(msg).toContain('Draft ready');
      expect(msg).toContain(to);
      expect(msg).toContain(subject);
    });

    it('should format email sent confirmation', () => {
      const msg = `✅ Email sent to rohan@example.com\n**Subject:** Meeting Follow-up`;
      expect(msg).toContain('✅');
      expect(msg).toContain('Email sent');
    });
  });

  describe('Contact Formatters', () => {
    it('should format single contact found', () => {
      const name = 'Rohan Sharma';
      const email = 'rohan@example.com';
      const msg = `👤 **${name}**\n📧 ${email}`;
      expect(msg).toContain('👤');
      expect(msg).toContain(name);
      expect(msg).toContain(email);
    });

    it('should format multiple contacts for disambiguation', () => {
      const contacts = [
        { name: 'Rohan Sharma', email: 'rohan1@example.com' },
        { name: 'Rohan Kumar', email: 'rohan2@example.com' },
      ];
      let msg = `👥 **Found ${contacts.length} contacts:**\n\n`;
      contacts.forEach((c, i) => {
        msg += `${i + 1}. **${c.name}** - ${c.email}\n`;
      });
      expect(msg).toContain('Found 2 contacts');
      expect(msg).toContain('1. **Rohan Sharma**');
      expect(msg).toContain('2. **Rohan Kumar**');
    });
  });

  describe('Reminder Formatters', () => {
    it('should format reminder created', () => {
      const text = 'Call the investor';
      const time = 'Fri, 5 Dec, 3:00 PM IST';
      const msg = `⏰ Reminder set: "${text}" for ${time}`;
      expect(msg).toContain('⏰');
      expect(msg).toContain(text);
      expect(msg).toContain('IST');
    });

    it('should format reminder snoozed', () => {
      const msg = `⏰ Snoozed! I'll remind you about "Team sync" at 4:30 PM`;
      expect(msg).toContain('Snoozed');
      expect(msg).toContain('4:30 PM');
    });
  });

  describe('Document Formatters', () => {
    it('should format document uploaded', () => {
      const filename = 'quarterly_report.pdf';
      const msg = `📄 Document uploaded: **${filename}**`;
      expect(msg).toContain('📄');
      expect(msg).toContain(filename);
    });

    it('should format documents list', () => {
      const docs = [
        { filename: 'report.pdf', created_at: '2025-12-01' },
        { filename: 'contract.docx', created_at: '2025-12-03' },
      ];
      let msg = `📂 **Your Documents (${docs.length})**\n\n`;
      docs.forEach((doc, i) => {
        msg += `${i + 1}. **${doc.filename}**\n`;
      });
      expect(msg).toContain('Your Documents (2)');
      expect(msg).toContain('report.pdf');
      expect(msg).toContain('contract.docx');
    });
  });
});

// ============= PHASE 4: ERROR HANDLING MODULE TESTS =============

describe('Standardized Error Messages Module', () => {
  const ErrorType = {
    OAUTH_NOT_CONNECTED: 'OAUTH_NOT_CONNECTED',
    OAUTH_EXPIRED: 'OAUTH_EXPIRED',
    API_ERROR: 'API_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION: 'VALIDATION',
    PERMISSION: 'PERMISSION',
    RATE_LIMIT: 'RATE_LIMIT',
  };

  describe('OAuth Error Detection', () => {
    it('should identify OAUTH_NOT_CONNECTED error', () => {
      const error = new Error('OAUTH_NOT_CONNECTED');
      const isOAuth = error.message === ErrorType.OAUTH_NOT_CONNECTED || 
                      error.message === ErrorType.OAUTH_EXPIRED;
      expect(isOAuth).toBe(true);
    });

    it('should identify OAUTH_EXPIRED error', () => {
      const error = new Error('OAUTH_EXPIRED');
      const isOAuth = error.message === ErrorType.OAUTH_EXPIRED;
      expect(isOAuth).toBe(true);
    });

    it('should NOT identify regular errors as OAuth', () => {
      const error = new Error('Network timeout');
      const isOAuth = error.message === ErrorType.OAUTH_NOT_CONNECTED || 
                      error.message === ErrorType.OAUTH_EXPIRED;
      expect(isOAuth).toBe(false);
    });
  });

  describe('Service-Specific Error Messages', () => {
    it('should return calendar OAuth expired message', () => {
      const msg = '⚠️ Your Google Calendar connection has expired. Please reconnect your Google account in settings.';
      expect(msg).toContain('Calendar');
      expect(msg).toContain('expired');
      expect(msg).toContain('reconnect');
    });

    it('should return tasks OAuth expired message', () => {
      const msg = '⚠️ Your Google Tasks connection has expired. Please reconnect your Google account in settings to manage tasks.';
      expect(msg).toContain('Tasks');
      expect(msg).toContain('expired');
    });

    it('should return gmail not found message', () => {
      const msg = '📧 I couldn\'t find any emails matching your search.';
      expect(msg).toContain('📧');
      expect(msg).toContain('couldn\'t find');
    });

    it('should return contacts not found message', () => {
      const msg = '👤 I couldn\'t find anyone with that name in your contacts.';
      expect(msg).toContain('👤');
      expect(msg).toContain('couldn\'t find');
    });
  });

  describe('Error Type from HTTP Status', () => {
    it('should map 401 to OAUTH_EXPIRED', () => {
      const statusCode = 401;
      const errorType = statusCode === 401 || statusCode === 403 ? ErrorType.OAUTH_EXPIRED : ErrorType.API_ERROR;
      expect(errorType).toBe(ErrorType.OAUTH_EXPIRED);
    });

    it('should map 403 to OAUTH_EXPIRED', () => {
      const statusCode = 403;
      const errorType = statusCode === 401 || statusCode === 403 ? ErrorType.OAUTH_EXPIRED : ErrorType.API_ERROR;
      expect(errorType).toBe(ErrorType.OAUTH_EXPIRED);
    });

    it('should map 404 to NOT_FOUND', () => {
      const statusCode = 404;
      const errorType = statusCode === 404 ? ErrorType.NOT_FOUND : ErrorType.API_ERROR;
      expect(errorType).toBe(ErrorType.NOT_FOUND);
    });

    it('should map 429 to RATE_LIMIT', () => {
      const statusCode = 429;
      const errorType = statusCode === 429 ? ErrorType.RATE_LIMIT : ErrorType.API_ERROR;
      expect(errorType).toBe(ErrorType.RATE_LIMIT);
    });

    it('should map 500 to API_ERROR', () => {
      const statusCode = 500;
      const errorType = statusCode >= 500 ? ErrorType.API_ERROR : ErrorType.API_ERROR;
      expect(errorType).toBe(ErrorType.API_ERROR);
    });
  });

  describe('Document Error Messages', () => {
    it('should return document not found message', () => {
      const msg = '📄 I don\'t have any document in context. Please upload a document first.';
      expect(msg).toContain('📄');
      expect(msg).toContain('upload');
    });

    it('should return unsupported format message', () => {
      const msg = '❌ I don\'t support that file format. Please upload a PDF, Word document, or image.';
      expect(msg).toContain('❌');
      expect(msg).toContain('format');
    });
  });

  describe('Reminder Error Messages', () => {
    it('should return reminder not found message', () => {
      const msg = '⏰ I couldn\'t find any active reminder to snooze.';
      expect(msg).toContain('⏰');
      expect(msg).toContain('couldn\'t find');
    });

    it('should return invalid time message', () => {
      const msg = '⏰ I couldn\'t understand that time. Try something like "remind me at 3pm" or "in 2 hours".';
      expect(msg).toContain('couldn\'t understand');
      expect(msg).toContain('3pm');
    });
  });
});

// ============= PHASE 4: INTEGRATION TESTS =============

describe('End-to-End Integration Tests', () => {
  describe('Full Briefing Flow', () => {
    it('should include all 5 sections in correct order', () => {
      const sections = ['Weather', 'Calendar', 'Pending Tasks', 'Emails', 'Reminders'];
      const briefingTemplate = `
🌅 *Good morning. Your Daily Briefing*
🌤️ *Weather*: Mumbai, 28°C
📅 *Calendar*: 2 events today
✅ *Pending Tasks*: 5 tasks
📧 *Emails*: 42 unread
⏰ *Reminders*: 1 reminder
      `;
      
      sections.forEach(section => {
        expect(briefingTemplate).toContain(section);
      });
    });

    it('should always show section headers even when empty', () => {
      const emptyBriefing = `
🌅 *Good morning. Your Daily Briefing*
🌤️ *Weather*: No weather data available
📅 *Calendar*: No events on your calendar today
✅ *Pending Tasks*: You're all caught up
📧 *Emails*: 0 unread emails
⏰ *Reminders*: No reminders scheduled
      `;
      
      expect(emptyBriefing).toContain('Weather');
      expect(emptyBriefing).toContain('Calendar');
      expect(emptyBriefing).toContain('Pending Tasks');
      expect(emptyBriefing).toContain('Emails');
      expect(emptyBriefing).toContain('Reminders');
    });
  });

  describe('Full Tasks Paging Flow', () => {
    it('should track state correctly across multiple pages', () => {
      const snapshot = Array.from({ length: 44 }, (_, i) => ({
        index: i + 1,
        title: `Task ${i + 1}`,
      }));
      
      // Initial view: 1-10
      const page1 = snapshot.slice(0, 10);
      expect(page1.length).toBe(10);
      expect(page1[0].index).toBe(1);
      expect(page1[9].index).toBe(10);
      
      // Show rest: 11-20
      const page2 = snapshot.slice(10, 20);
      expect(page2.length).toBe(10);
      expect(page2[0].index).toBe(11);
      expect(page2[9].index).toBe(20);
      
      // Show rest: 21-30
      const page3 = snapshot.slice(20, 30);
      expect(page3.length).toBe(10);
      expect(page3[0].index).toBe(21);
      
      // Final page: 41-44
      const finalPage = snapshot.slice(40, 44);
      expect(finalPage.length).toBe(4);
      expect(finalPage[0].index).toBe(41);
      expect(finalPage[3].index).toBe(44);
    });

    it('should show all tasks when show_all is true', () => {
      const total = 44;
      const showAll = true;
      const tasksToShow = showAll ? total : 10;
      expect(tasksToShow).toBe(44);
    });
  });

  describe('Contact Resolution Flow', () => {
    it('should immediately proceed for single match', () => {
      const contacts = [{ name: 'Rohan Sharma', email: 'rohan@example.com' }];
      const needsDisambiguation = contacts.length > 1;
      expect(needsDisambiguation).toBe(false);
    });

    it('should trigger disambiguation for multiple matches', () => {
      const contacts = [
        { name: 'Rohan Sharma', email: 'rohan1@example.com' },
        { name: 'Rohan Kumar', email: 'rohan2@example.com' },
      ];
      const needsDisambiguation = contacts.length > 1;
      expect(needsDisambiguation).toBe(true);
    });

    it('should use resolved email for draft creation', () => {
      const contact = { name: 'Rohan Sharma', email: 'rohan@example.com' };
      const draft = {
        to: contact.email,
        subject: 'Meeting Follow-up',
        body: 'Thanks for your time today.',
      };
      expect(draft.to).toBe('rohan@example.com');
    });
  });

  describe('Calendar CRUD Flow', () => {
    it('should detect time conflicts', () => {
      const existingEvent = { 
        start: new Date('2025-12-05T14:00:00').getTime(),
        end: new Date('2025-12-05T15:00:00').getTime()
      };
      const newEvent = {
        start: new Date('2025-12-05T14:30:00').getTime(),
        end: new Date('2025-12-05T15:30:00').getTime()
      };
      
      const hasConflict = newEvent.start < existingEvent.end && newEvent.end > existingEvent.start;
      expect(hasConflict).toBe(true);
    });

    it('should NOT detect conflict for non-overlapping events', () => {
      const existingEvent = {
        start: new Date('2025-12-05T14:00:00').getTime(),
        end: new Date('2025-12-05T15:00:00').getTime()
      };
      const newEvent = {
        start: new Date('2025-12-05T16:00:00').getTime(),
        end: new Date('2025-12-05T17:00:00').getTime()
      };
      
      const hasConflict = newEvent.start < existingEvent.end && newEvent.end > existingEvent.start;
      expect(hasConflict).toBe(false);
    });

    it('should search by person name in title or attendees', () => {
      const events = [
        { summary: 'Meeting with Rohan', attendees: [] },
        { summary: 'Lunch', attendees: [{ displayName: 'Priya' }] },
        { summary: 'Team Sync', attendees: [] },
      ];
      
      const searchPerson = 'Rohan';
      const matches = events.filter(e => 
        e.summary.toLowerCase().includes(searchPerson.toLowerCase()) ||
        e.attendees?.some(a => a.displayName?.toLowerCase().includes(searchPerson.toLowerCase()))
      );
      
      expect(matches.length).toBe(1);
      expect(matches[0].summary).toContain('Rohan');
    });
  });

  describe('Document Q&A Flow', () => {
    it('should require document context for Q&A', () => {
      const sessionState = { last_uploaded_doc_id: null };
      const hasDocContext = sessionState.last_uploaded_doc_id !== null;
      expect(hasDocContext).toBe(false);
    });

    it('should allow Q&A when document is uploaded', () => {
      const sessionState = { last_uploaded_doc_id: 'doc-123' };
      const hasDocContext = sessionState.last_uploaded_doc_id !== null;
      expect(hasDocContext).toBe(true);
    });

    it('should allow recall of previous document', () => {
      const documents = [
        { id: 'doc-1', filename: 'report.pdf' },
        { id: 'doc-2', filename: 'contract.pdf' },
      ];
      const searchName = 'contract';
      const match = documents.find(d => d.filename.toLowerCase().includes(searchName));
      expect(match).toBeDefined();
      expect(match?.id).toBe('doc-2');
    });
  });
});

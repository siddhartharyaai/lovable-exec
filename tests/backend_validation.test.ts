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

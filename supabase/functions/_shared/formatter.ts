/**
 * WhatsApp Message Formatter Module
 * Standardized formatting for all WhatsApp responses
 * 
 * Format Guidelines:
 * - Use ** for bold text (WhatsApp markdown)
 * - Use _ for italic text
 * - Use • for bullet points
 * - Use numbered lists with 1. 2. 3.
 * - Emojis at start of section headers
 * - Keep line breaks consistent
 */

// ============ SUCCESS FORMATTERS ============

export function formatTaskCreated(title: string, due?: string): string {
  let msg = `✅ Task created: "${title}"`;
  if (due) {
    const dueDate = new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    msg += ` (due ${dueDate})`;
  }
  return msg;
}

export function formatTaskCompleted(title: string, index?: number): string {
  if (index !== undefined) {
    return `✅ Task ${index} completed: "${title}"`;
  }
  return `✅ Task completed: "${title}"`;
}

export function formatTasksCompletedMultiple(count: number, title: string): string {
  return `✅ Completed ${count} task${count > 1 ? 's' : ''}: "${title}"`;
}

export function formatTasksList(tasks: Array<{ title: string; due?: string | null; index: number }>, total: number, showAll: boolean, showRest: boolean): string {
  if (tasks.length === 0) {
    return `✅ **No pending tasks!**\n\nYou're all caught up. 🎉`;
  }

  let header: string;
  if (showAll) {
    header = `✅ **Your Tasks (${total} pending)**\n\n`;
  } else if (showRest) {
    header = `✅ **Remaining Tasks**\n\n`;
  } else {
    header = `✅ **Your Tasks (${total} pending)**\n\n`;
  }

  let msg = header;
  tasks.forEach((task) => {
    msg += `${task.index}. ${task.title}`;
    if (task.due) {
      msg += ` _(due ${task.due})_`;
    }
    msg += '\n';
  });

  // Footer for initial view only
  if (!showAll && !showRest && total > tasks.length) {
    const remaining = total - tasks.length;
    msg += `\n_...and ${remaining} more. Reply "show me all tasks" or "show me the rest" to see more._`;
  }

  return msg.trim();
}

export function formatCalendarEventCreated(title: string, dateTime: Date, attendees?: string[]): string {
  const formattedDate = dateTime.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });
  
  let msg = `📅 Event created: **${title}** on ${formattedDate}`;
  if (attendees?.length) {
    msg += `\n👥 Attendees: ${attendees.join(', ')}`;
  }
  return msg;
}

export function formatCalendarEventUpdated(title: string, newDateTime: Date): string {
  const dayName = newDateTime.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  const datePart = newDateTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timePart = newDateTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  
  return `✅ Rescheduled "**${title}**" to ${dayName}, ${datePart} at ${timePart} IST`;
}

export function formatCalendarEventDeleted(title: string, dateTime: Date): string {
  const dayName = dateTime.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  const datePart = dateTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const timePart = dateTime.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  
  return `✅ Cancelled "**${title}**" on ${dayName}, ${datePart} at ${timePart} IST`;
}

export function formatCalendarEvents(events: Array<{ summary: string; start: any; attendees?: any[] }>, dateDisplay: string, tz: string = 'Asia/Kolkata'): string {
  if (events.length === 0) {
    return '📅 You have no events scheduled for the requested time period.';
  }

  let msg = `📅 **Your Events for ${dateDisplay}**\n\nYou have ${events.length} event${events.length > 1 ? 's' : ''}:\n\n`;

  events.forEach((event) => {
    const start = new Date(event.start.dateTime || event.start.date);
    let timeStr = '';
    
    if (event.start.dateTime) {
      timeStr = start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: tz
      });
    } else {
      timeStr = 'All day';
    }

    msg += `• **${event.summary}** at ${timeStr}`;
    
    if (event.attendees?.length) {
      const attendeeNames = event.attendees
        .map((a: any) => a.displayName || a.email.split('@')[0])
        .slice(0, 2)
        .join(', ');
      const moreCount = event.attendees.length > 2 ? ` +${event.attendees.length - 2} more` : '';
      msg += `\n  👥 with ${attendeeNames}${moreCount}`;
    }
    msg += '\n\n';
  });

  return msg.trim();
}

export function formatReminderCreated(text: string, dueTime: Date): string {
  const timeStr = dueTime.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
  return `⏰ Reminder set: "${text}" for ${timeStr} IST`;
}

export function formatReminderSnoozed(text: string, newDueTime: Date): string {
  const timeStr = newDueTime.toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
  return `⏰ Snoozed! I'll remind you about "${text}" at ${timeStr}`;
}

export function formatEmailDraftCreated(to: string, subject: string): string {
  return `📧 **Draft ready for review:**\n\n**To:** ${to}\n**Subject:** ${subject}\n\n_Reply "send" to send, or "edit" to modify._`;
}

export function formatEmailSent(to: string, subject: string): string {
  return `✅ Email sent to ${to}\n**Subject:** ${subject}`;
}

export function formatEmailSummary(unreadCount: number, emails: Array<{ subject: string; from: string; snippet?: string }>): string {
  if (emails.length === 0) {
    return `📧 **Inbox Update**\n\nYou have ${unreadCount} unread email${unreadCount !== 1 ? 's' : ''}, but I couldn't retrieve the details right now.`;
  }

  let msg = `📧 **Inbox Update** (${unreadCount} unread)\n\n`;
  emails.forEach((email, i) => {
    msg += `${i + 1}. **${email.subject}**\n   _From: ${email.from}_`;
    if (email.snippet) {
      msg += `\n   "${email.snippet.slice(0, 100)}..."`;
    }
    msg += '\n\n';
  });

  return msg.trim();
}

export function formatContactFound(name: string, email?: string, phone?: string): string {
  let msg = `👤 **${name}**\n`;
  if (email) msg += `📧 ${email}\n`;
  if (phone) msg += `📞 ${phone}\n`;
  return msg.trim();
}

export function formatContactsMultiple(contacts: Array<{ name: string; email?: string; phone?: string }>): string {
  let msg = `👥 **Found ${contacts.length} contacts:**\n\n`;
  contacts.forEach((c, i) => {
    msg += `${i + 1}. **${c.name}**`;
    if (c.email) msg += ` - ${c.email}`;
    msg += '\n';
  });
  msg += '\n_Which one do you mean?_';
  return msg;
}

export function formatDocumentUploaded(filename: string): string {
  return `📄 Document uploaded: **${filename}**\n\n_You can now ask questions about this document._`;
}

export function formatDocumentsList(documents: Array<{ filename: string; created_at: string }>): string {
  if (documents.length === 0) {
    return `📂 **No documents found.**\n\n_Upload a document by sending it here, then ask questions about it._`;
  }

  let msg = `📂 **Your Documents (${documents.length})**\n\n`;
  documents.forEach((doc, i) => {
    const date = new Date(doc.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    msg += `${i + 1}. **${doc.filename}** _(${date})_\n`;
  });
  msg += '\n_Say "recall [filename]" to ask questions about a specific document._';
  return msg;
}

// ============ DISAMBIGUATION FORMATTERS ============

export function formatTasksDisambiguation(matches: Array<{ task: { title: string; due?: string }; listName?: string }>): string {
  let msg = `📋 I found **${matches.length} matching tasks** with that name:\n\n`;
  matches.forEach((item, i) => {
    msg += `${i + 1}. **${item.task.title}**`;
    if (item.task.due) {
      const dueDate = new Date(item.task.due).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      msg += ` (due ${dueDate})`;
    }
    if (item.listName) {
      msg += `\n   _${item.listName}_`;
    }
    msg += '\n\n';
  });
  msg += `Reply with "1", "2", or "both" to complete them.`;
  return msg;
}

export function formatCalendarDisambiguation(events: Array<{ summary: string; start: any; attendees?: any[] }>, action: 'update' | 'delete', tz: string = 'Asia/Kolkata'): string {
  let msg = `📅 I found **${events.length} matching events**. Which one would you like to ${action}?\n\n`;
  events.forEach((event, i) => {
    const start = new Date(event.start.dateTime || event.start.date);
    const timeStr = event.start.dateTime
      ? start.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: tz
        })
      : start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    msg += `${i + 1}. **${event.summary}** - ${timeStr}\n`;
    if (event.attendees?.length) {
      msg += `   👥 With: ${event.attendees.map((a: any) => a.displayName || a.email).join(', ')}\n`;
    }
    msg += '\n';
  });
  msg += `Please specify which event to ${action} more clearly.`;
  return msg;
}

// ============ CONFLICT FORMATTERS ============

export function formatCalendarConflict(conflicts: Array<{ summary: string; start: any }>, tz: string = 'Asia/Kolkata'): string {
  const conflictList = conflicts.map((e) => {
    const cStart = new Date(e.start.dateTime || e.start.date);
    const cTime = cStart.toLocaleString('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `• ${e.summary} at ${cTime}`;
  }).join('\n');

  return `⚠️ **Time Conflict Detected!**\n\nYou already have:\n${conflictList}\n\nat that time.\n\nWould you like to:\n1. Reschedule the new event\n2. Reschedule the existing event(s)\n3. Create anyway`;
}

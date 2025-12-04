// Shared time parsing utilities for Man Friday
// Handles natural language time expressions and converts to ISO 8601 format

/**
 * Parse natural language time expressions to Date object
 * Supports: "tomorrow", "today", "next monday", "in 2 hours", "3pm", "tomorrow morning", etc.
 * @param timeStr Natural language time string
 * @param referenceDate Reference date (defaults to now in IST)
 * @returns Date object or null if parsing fails
 */
export function parseNaturalTime(timeStr: string, referenceDate?: Date): Date | null {
  if (!timeStr) return null;
  
  const str = timeStr.toLowerCase().trim();
  const now = referenceDate || getISTNow();
  
  // Try to parse as ISO date first
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  // Handle relative day expressions
  const dayPatterns: { [key: string]: number } = {
    'today': 0,
    'tonight': 0,
    'tomorrow': 1,
    'day after tomorrow': 2,
    'day after': 2
  };
  
  // Check for day patterns
  for (const [pattern, daysToAdd] of Object.entries(dayPatterns)) {
    if (str.includes(pattern)) {
      const result = new Date(now);
      result.setDate(result.getDate() + daysToAdd);
      
      // Extract time if present
      const timeMatch = extractTimeFromString(str);
      if (timeMatch) {
        result.setHours(timeMatch.hours, timeMatch.minutes, 0, 0);
      } else {
        // Default times based on context
        if (pattern === 'tonight') {
          result.setHours(20, 0, 0, 0); // 8 PM
        } else if (str.includes('morning')) {
          result.setHours(9, 0, 0, 0);
        } else if (str.includes('afternoon')) {
          result.setHours(14, 0, 0, 0);
        } else if (str.includes('evening')) {
          result.setHours(19, 0, 0, 0);
        } else if (str.includes('night')) {
          result.setHours(21, 0, 0, 0);
        } else {
          result.setHours(9, 0, 0, 0); // Default to 9 AM
        }
      }
      
      return result;
    }
  }
  
  // Handle "next [day]" pattern
  const nextDayMatch = str.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (nextDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(nextDayMatch[1].toLowerCase());
    const currentDay = now.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7; // Always go to next week
    
    const result = new Date(now);
    result.setDate(result.getDate() + daysToAdd);
    
    const timeMatch = extractTimeFromString(str);
    if (timeMatch) {
      result.setHours(timeMatch.hours, timeMatch.minutes, 0, 0);
    } else {
      result.setHours(9, 0, 0, 0); // Default to 9 AM
    }
    
    return result;
  }
  
  // Handle "this [day]" pattern
  const thisDayMatch = str.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (thisDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(thisDayMatch[1].toLowerCase());
    const currentDay = now.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7;
    
    const result = new Date(now);
    result.setDate(result.getDate() + daysToAdd);
    
    const timeMatch = extractTimeFromString(str);
    if (timeMatch) {
      result.setHours(timeMatch.hours, timeMatch.minutes, 0, 0);
    } else {
      result.setHours(9, 0, 0, 0);
    }
    
    return result;
  }
  
  // Handle "in X hours/minutes" pattern
  const inTimeMatch = str.match(/in\s+(\d+)\s*(hour|hr|minute|min)s?/i);
  if (inTimeMatch) {
    const amount = parseInt(inTimeMatch[1]);
    const unit = inTimeMatch[2].toLowerCase();
    const result = new Date(now);
    
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      result.setHours(result.getHours() + amount);
    } else {
      result.setMinutes(result.getMinutes() + amount);
    }
    
    return result;
  }
  
  // Handle standalone time like "3pm", "3:30pm", "15:00"
  const timeOnly = extractTimeFromString(str);
  if (timeOnly && str.match(/^\d{1,2}(:\d{2})?\s*(am|pm)?$/i)) {
    const result = new Date(now);
    result.setHours(timeOnly.hours, timeOnly.minutes, 0, 0);
    
    // If the time has already passed today, assume tomorrow
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    
    return result;
  }
  
  // Handle day name alone (Monday, Tuesday, etc.)
  const standaloneDayMatch = str.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
  if (standaloneDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(standaloneDayMatch[1].toLowerCase());
    const currentDay = now.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    
    const result = new Date(now);
    result.setDate(result.getDate() + daysToAdd);
    result.setHours(9, 0, 0, 0); // Default to 9 AM
    
    return result;
  }
  
  return null;
}

/**
 * Extract time (hours, minutes) from a string containing time expression
 */
function extractTimeFromString(str: string): { hours: number; minutes: number } | null {
  // Match patterns like "3pm", "3:30pm", "3:30 pm", "15:00", "3 pm"
  const patterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,    // 3:30pm, 3:30 pm
    /(\d{1,2})\s*(am|pm)/i,             // 3pm, 3 pm
    /(\d{1,2}):(\d{2})/,                // 15:00 (24-hour)
  ];
  
  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] && !match[2].match(/am|pm/i) ? parseInt(match[2]) : 0;
      const meridiem = match[3] || match[2];
      
      if (meridiem && /pm/i.test(meridiem) && hours < 12) {
        hours += 12;
      } else if (meridiem && /am/i.test(meridiem) && hours === 12) {
        hours = 0;
      }
      
      return { hours, minutes };
    }
  }
  
  return null;
}

/**
 * Get current time in IST timezone
 */
export function getISTNow(): Date {
  const now = new Date();
  // Create a date that represents "now" in IST
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset - now.getTimezoneOffset() * 60 * 1000);
}

/**
 * Convert Date to ISO 8601 string with IST offset
 */
export function toISTISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+05:30`;
}

/**
 * Parse duration from natural language
 * Supports: "30 minutes", "1 hour", "1.5 hours", "90 minutes"
 */
export function parseDuration(durationStr: string): number | null {
  if (!durationStr) return null;
  
  const str = durationStr.toLowerCase().trim();
  
  // Check for hour pattern
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/i);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }
  
  // Check for minute pattern
  const minMatch = str.match(/(\d+)\s*(?:minute|min)s?/i);
  if (minMatch) {
    return parseInt(minMatch[1]);
  }
  
  // Check for standalone number (assume minutes)
  const numMatch = str.match(/^(\d+)$/);
  if (numMatch) {
    return parseInt(numMatch[1]);
  }
  
  return null;
}

/**
 * Format a date for display in WhatsApp message (IST timezone)
 */
export function formatForDisplay(date: Date, options?: {
  includeDate?: boolean;
  includeTime?: boolean;
  includeDay?: boolean;
}): string {
  const opts = { includeDate: true, includeTime: true, includeDay: true, ...options };
  
  const parts: string[] = [];
  
  if (opts.includeDay) {
    parts.push(date.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }));
  }
  
  if (opts.includeDate) {
    parts.push(date.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'short',
      timeZone: 'Asia/Kolkata'
    }));
  }
  
  if (opts.includeTime) {
    parts.push('at');
    parts.push(date.toLocaleTimeString('en-IN', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    }));
  }
  
  return parts.join(' ');
}

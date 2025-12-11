# Man Friday E2E Test Plan
**Date:** December 11, 2025  
**Tester:** FlowithOS  
**Phone:** +919821230311

---

## PRE-TEST SETUP
1. Ensure WhatsApp is connected to Twilio sandbox
2. Have web dashboard open at https://kxeylftnzwhqxguduwoq.lovableproject.com
3. User should be logged in with Google OAuth connected

---

## TEST CASES

### SECTION A: Identity & Greeting (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| A01 | `Hi` | Personalized greeting with user's name "Siddharth" |
| A02 | `Who are you?` | Identifies as "Man Friday", describes capabilities |

---

### SECTION B: Daily Briefing (3 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| B01 | `Give me my briefing` | All 5 sections: Weather, Calendar, Tasks, Emails, Reminders with IST date |
| B02 | `Good morning` | Same briefing format with current IST date |
| B03 | `What's my day look like?` | Briefing with weather for Mumbai |

**Verify:**
- [ ] Weather shows city name and temperature (not "No weather data")
- [ ] Date is current IST date (December 11, 2025)
- [ ] All 5 sections present even if empty

---

### SECTION C: Tasks - Initial View (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| C01 | `What tasks are pending?` | Header "Your Tasks", numbered list 1-10, footer "...and X more" |
| C02 | `Show my tasks` | Same format as C01 |

**Verify:**
- [ ] Tasks numbered 1-10
- [ ] Footer shows remaining count if >10 tasks exist
- [ ] No document Q&A response (should NOT mention any uploaded documents)

---

### SECTION D: Tasks - Pagination (3 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| D01 | `Show me more` | Tasks 11-20 with header "Here are the next X tasks" |
| D02 | `Show me the rest` | Remaining tasks after current page |
| D03 | `Show me all tasks` | Complete list of ALL tasks (no footer, no pagination) |

**Verify:**
- [ ] D01 continues from where C01 left off (tasks 11-20)
- [ ] D03 shows full list without "...and X more" footer

---

### SECTION E: Tasks - Create (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| E01 | `Create a task: E2E Test December 11` | Confirmation with task title |
| E02 | `What tasks are pending?` | New task appears in list |

**Verify:**
- [ ] Task "E2E Test December 11" visible in refreshed task list

---

### SECTION F: Calendar - Read (4 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| F01 | `What meetings do I have today?` | List of today's meetings OR "No meetings today" |
| F02 | `What's on my calendar tomorrow?` | Tomorrow's events |
| F03 | `Calendar this week` | Events for the next 7 days |
| F04 | `Show my schedule` | Today's calendar events |

**Verify:**
- [ ] Should NOT say "Calendar action not yet implemented"
- [ ] Events show time in IST format
- [ ] Response includes event titles and times

---

### SECTION G: Calendar - Create (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| G01 | `Schedule a meeting called E2E Test Meeting tomorrow at 4pm` | Confirmation with date, time, title |
| G02 | `What's on my calendar tomorrow?` | New meeting appears in list |

**Verify:**
- [ ] Meeting "E2E Test Meeting" visible for tomorrow at 4pm IST

---

### SECTION H: Gmail (4 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| H01 | `How many unread emails do I have?` | Count of unread emails |
| H02 | `Show my recent emails` | List of recent emails with senders/subjects |
| H03 | `Search emails from Google` | Filtered list of emails from Google |
| H04 | `Find emails about invoice` | Search results for "invoice" |

**Verify:**
- [ ] Email counts are numeric
- [ ] Search results show sender and subject

---

### SECTION I: Contacts (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| I01 | `Find contact Siddharth` | Contact details (email, phone) or "not found" message |
| I02 | `Look up John` | Contact search result or disambiguation |

**Verify:**
- [ ] Should NOT return empty/no response
- [ ] Should show contact info or clear "not found" message

---

### SECTION J: Reminders (3 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| J01 | `Remind me to call mom in 2 hours` | Confirmation with reminder text and time |
| J02 | `Set a reminder for tomorrow at 9am: Team standup` | Confirmation with date/time |
| J03 | `What reminders do I have?` | List of pending reminders |

**Verify:**
- [ ] Reminder creation confirmed with due time
- [ ] J03 shows list including newly created reminders

---

### SECTION K: Web Search (2 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| K01 | `Search the web for latest AI news` | News headlines with sources |
| K02 | `What's the weather in Delhi?` | Weather information for Delhi |

**Verify:**
- [ ] Results include sources/links
- [ ] Information is current/relevant

---

### SECTION L: Cancellation & Error Handling (3 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| L01 | `Cancel that` | "Got it, cancelled" acknowledgment |
| L02 | `Never mind` | Cancellation confirmation |
| L03 | `asdfghjkl` | Graceful error handling with help options |

**Verify:**
- [ ] L01/L02 acknowledge cancellation clearly
- [ ] L03 does NOT crash, provides helpful response

---

### SECTION M: Context Switching (3 tests)

| ID | Message to Send | Expected Response |
|----|-----------------|-------------------|
| M01 | `What tasks are pending?` | Task list (NOT document Q&A) |
| M02 | `Now show my calendar` | Calendar events (clean context switch) |
| M03 | `Back to tasks - show me all` | Full task list |

**Verify:**
- [ ] Clean transitions between features
- [ ] No "document context pollution" (mentioning old documents)

---

## SCORING TEMPLATE

```
SECTION A: Identity        [ ] / 2
SECTION B: Briefing        [ ] / 3
SECTION C: Tasks Initial   [ ] / 2
SECTION D: Tasks Pagination[ ] / 3
SECTION E: Tasks Create    [ ] / 2
SECTION F: Calendar Read   [ ] / 4
SECTION G: Calendar Create [ ] / 2
SECTION H: Gmail           [ ] / 4
SECTION I: Contacts        [ ] / 2
SECTION J: Reminders       [ ] / 3
SECTION K: Web Search      [ ] / 2
SECTION L: Cancel/Error    [ ] / 3
SECTION M: Context Switch  [ ] / 3

TOTAL: [ ] / 35
```

---

## REPORT FORMAT

Please provide results in this format:

| ID | Status | Response Summary | Issues |
|----|--------|------------------|--------|
| A01 | ✅/⚠️/❌ | First 50 chars of response | Any problems |

### Critical Issues (Blocking)
- List any features that completely fail

### Warnings (Non-blocking)
- List inconsistencies or partial failures

### Production Readiness
- Score: X/10
- Blockers: Yes/No
- Summary: One paragraph assessment

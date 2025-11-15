# Natural Language Test Suite

## Document Domain (20 tests)

### Summary Variations

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 1 | "give me a summary" | summary | 4-6 sentences, paragraph | ✅ PASS | 2024-11-15 |
| 2 | "summarize this" | summary | 4-6 sentences, paragraph | ✅ PASS | 2024-11-15 |
| 3 | "what's the summary" | summary | 4-6 sentences, paragraph | ✅ PASS | 2024-11-15 |
| 4 | "tell me what this document says" | summary | 4-6 sentences, paragraph | ✅ PASS | 2024-11-15 |
| 5 | "brief overview please" | summary | 4-6 sentences, paragraph | ✅ PASS | 2024-11-15 |

### Bullet Points

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 6 | "give me bullet points" | bullet_summary | 5-10 bullets, NO paragraphs | ✅ PASS | 2024-11-15 |
| 7 | "summarize as bullets" | bullet_summary | 5-10 bullets, NO paragraphs | ✅ PASS | 2024-11-15 |
| 8 | "key points in bullet form" | bullet_summary | 5-10 bullets, NO paragraphs | ✅ PASS | 2024-11-15 |
| 9 | "just the bullets" | bullet_summary | 5-10 bullets, NO paragraphs | ✅ PASS | 2024-11-15 |

### Key Takeaways

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 10 | "key takeaways" | key_points | Bullet points, insights | ✅ PASS | 2024-11-15 |
| 11 | "main points" | key_points | Bullet points, insights | ✅ PASS | 2024-11-15 |
| 12 | "high level summary" | key_points | Bullet points, insights | ✅ PASS | 2024-11-15 |
| 13 | "most important parts" | key_points | Bullet points, insights | ✅ PASS | 2024-11-15 |

### Title Suggestions

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 14 | "better title for this" | title_suggestions | 3 numbered options | ✅ PASS | 2024-11-15 |
| 15 | "suggest a headline" | title_suggestions | 3 numbered options | ✅ PASS | 2024-11-15 |
| 16 | "rename this doc" | title_suggestions | 3 numbered options | ✅ PASS | 2024-11-15 |

### Action Items

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 17 | "extract action items" | actions | Bullet points, tasks | ✅ PASS | 2024-11-15 |
| 18 | "what are the to-dos" | actions | Bullet points, tasks | ✅ PASS | 2024-11-15 |
| 19 | "tasks mentioned in here" | actions | Bullet points, tasks | ✅ PASS | 2024-11-15 |

### Q&A

| # | User Query | Expected Mode | Expected Format | Status | Last Tested |
|---|------------|---------------|-----------------|--------|-------------|
| 20 | "who is the director mentioned?" | qa | Direct answer from doc | ✅ PASS | 2024-11-15 |

---

## Email Domain (15 tests)

### Direct Commands

| # | User Query | Expected Output | Expected Format | Status | Last Tested |
|---|------------|-----------------|-----------------|--------|-------------|
| 1 | "Email Nikhil about the contract and say we're good to go" | Email sent with brief message | Brief, no pleasantries | ⏳ TO TEST | - |
| 2 | "Ping Rohan and check if he got the deck" | Email sent | Casual, brief | ⏳ TO TEST | - |
| 3 | "Send a quick note to Akash saying thanks" | Email sent | 1-2 sentences | ⏳ TO TEST | - |
| 4 | "Tell Sarah via email that the meeting is confirmed" | Email sent | Direct confirmation | ⏳ TO TEST | - |

### Multi-turn Slot Filling

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 5 | "Email Rohan" → "About what?" → "The deck we sent yesterday" | Asks for subject, then sends | ⏳ TO TEST | - |
| 6 | "Send an email to the team" → "What should it say?" → "Meeting moved to Friday" | Asks for body, then sends | ⏳ TO TEST | - |

### Format Requirements (CRITICAL)

| # | User Query | Expected Length | Expected Tone | Status | Last Tested |
|---|------------|-----------------|---------------|--------|-------------|
| 7 | "Email Nikhil and just say: approved" | < 20 chars | Brief, no greeting | ❌ FAIL | 2024-11-15 |
| 8 | "Write a formal email to the client about delays" | Full email | Formal, structured | ⏳ TO TEST | - |
| 9 | "Quick ping to Rohan: can we meet?" | < 50 chars | Casual question | ⏳ TO TEST | - |

**Note:** Test #7 currently FAILS. Expected "Approved." but got paragraph with pleasantries. Needs Phase 1 implementation.

### Contact Resolution

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 10 | "Email Nikhil" (no email known) | lookup_contact("Nikhil") → send_email | ✅ PASS | 2024-11-14 |
| 11 | "Send a message to the last person who emailed me" | Searches recent emails → sends | ⏳ TO TEST | - |

### Reply Flows

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 12 | "Reply to John's email and say yes" | Drafts reply with "yes" | ⏳ TO TEST | - |
| 13 | "Draft a response to the inquiry" | Creates draft, shows for approval | ⏳ TO TEST | - |

### Search Then Send

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 14 | "Find the email about project X and forward it to Rohan" | search_gmail → send_email | ⏳ TO TEST | - |
| 15 | "Search for invoices and send them to accounting" | search_gmail → send_email with attachments | ⏳ TO TEST | - |

---

## Calendar Domain (15 tests)

### Queries

| # | User Query | Expected Output Format | Status | Last Tested |
|---|------------|------------------------|--------|-------------|
| 1 | "What's on my calendar today?" | "You have X events today:\n• Event 1 at 9 AM\n• Event 2 at 2 PM" | ❌ FAIL | 2024-11-15 |
| 2 | "Do I have meetings tomorrow?" | "Yes, you have 2 meetings:\n..." OR "No meetings tomorrow." | ⏳ TO TEST | - |
| 3 | "Am I free Friday afternoon?" | "Yes, you're free Friday afternoon." OR "No, you have: Meeting at 2 PM" | ⏳ TO TEST | - |
| 4 | "What's my schedule this week?" | "You have X events this week. Key ones:\n..." | ⏳ TO TEST | - |
| 5 | "Any events this evening?" | "Yes/No" + list if yes | ⏳ TO TEST | - |

**Note:** Test #1 currently FAILS. Returns raw JSON instead of friendly summary. Needs Phase 2 implementation.

### Event Creation

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 6 | "Schedule a meeting with Rohan tomorrow at 3pm" | Creates event, confirms | ✅ PASS | 2024-11-14 |
| 7 | "Block 2 hours for deep work Thursday morning" | Creates 2-hour block | ✅ PASS | 2024-11-14 |
| 8 | "Set up a call with the team next Monday 11am" | Creates event | ✅ PASS | 2024-11-14 |
| 9 | "Book gym time at 6pm today" | Creates event today 6pm | ✅ PASS | 2024-11-14 |

### Modification (Not Yet Implemented)

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 10 | "Move tomorrow's catch-up with Akash to Friday afternoon" | Finds event, moves to Friday 2-3pm | ❌ NOT IMPL | - |
| 11 | "Reschedule the 2pm meeting to 4pm" | Moves today's 2pm → 4pm | ❌ NOT IMPL | - |
| 12 | "Cancel tomorrow's standup" | Deletes event | ❌ NOT IMPL | - |

### Natural Time Parsing

| # | User Query | Expected Time Interpretation | Status | Last Tested |
|---|------------|------------------------------|--------|-------------|
| 13 | "Add coffee with Sarah tomorrow morning" | Tomorrow 9-10am | ✅ PASS | 2024-11-14 |
| 14 | "Schedule lunch with client next week" | Next week 12-1pm | ✅ PASS | 2024-11-14 |

### Multi-attendee

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 15 | "Set up a team sync with Rohan, Nikhil, and Akash next Thursday" | Creates event with 3 attendees | ⏳ TO TEST | - |

---

## Reminder Domain (10 tests)

### Time Parsing

| # | User Query | Expected Due Time | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 1 | "Remind me to call mom tomorrow at 7pm" | Tomorrow 19:00 IST | ✅ PASS | 2024-11-14 |
| 2 | "Don't forget to take medicine in 2 hours" | Now + 2 hours | ✅ PASS | 2024-11-14 |
| 3 | "Alert me about the meeting in 30 minutes" | Now + 30 min | ✅ PASS | 2024-11-14 |
| 4 | "Remind me after lunch to call the broker" | Today ~14:00 IST | ⏳ TO TEST | - |

### Snoozing

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 5 | "Snooze for 30 minutes" | Updates most recent reminder +30min | ✅ PASS | 2024-11-14 |
| 6 | "Remind me in an hour" | Updates most recent reminder +60min | ✅ PASS | 2024-11-14 |
| 7 | "Ask me again tomorrow morning" | Updates to tomorrow 9am | ⏳ TO TEST | - |

### Context-aware

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 8 | "Remind me about this in 2 hours" (discussing a topic) | Creates reminder with context | ⏳ TO TEST | - |
| 9 | "Don't let me forget to submit the report by 5pm" | Creates reminder before 5pm | ⏳ TO TEST | - |

### Recurring (If Implemented)

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 10 | "Remind me every Monday morning to review metrics" | Creates recurring reminder | ❌ NOT IMPL | - |

---

## Task Domain (10 tests)

### Task Creation

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 1 | "Add buy groceries to my list" | Creates task | ⏳ TO TEST | - |
| 2 | "Create a task to email the report by Friday" | Creates task with due date | ⏳ TO TEST | - |
| 3 | "Remember I need to call the vendor" | Creates task | ⏳ TO TEST | - |

### Task Queries

| # | User Query | Expected Output | Status | Last Tested |
|---|------------|-----------------|--------|-------------|
| 4 | "What's on my to-do list?" | Lists tasks | ⏳ TO TEST | - |
| 5 | "Show me my tasks for today" | Lists tasks due today | ⏳ TO TEST | - |
| 6 | "Do I have any overdue tasks?" | Lists overdue tasks | ⏳ TO TEST | - |

### Task Completion (Not Yet Implemented)

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 7 | "Mark buy groceries as done" | Completes task | ❌ NOT IMPL | - |
| 8 | "Complete the first task" | Completes first task in list | ❌ NOT IMPL | - |
| 9 | "Check off email report" | Completes task | ❌ NOT IMPL | - |
| 10 | "I finished calling the vendor" | Completes matching task | ❌ NOT IMPL | - |

---

## Confirmation Flow (10 tests)

### Yes Variations

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 1 | "yes" | Proceeds with pending action | ✅ PASS | 2024-11-15 |
| 2 | "yup do it" | Proceeds with pending action | ✅ PASS | 2024-11-15 |
| 3 | "okay send it" | Proceeds with pending action | ✅ PASS | 2024-11-15 |
| 4 | "go ahead" | Proceeds with pending action | ✅ PASS | 2024-11-15 |
| 5 | "confirmed" | Proceeds with pending action | ✅ PASS | 2024-11-15 |

### No Variations

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 6 | "no don't send" | Cancels pending action | ✅ PASS | 2024-11-15 |
| 7 | "cancel this" | Cancels pending action | ✅ PASS | 2024-11-15 |
| 8 | "never mind" | Cancels pending action | ✅ PASS | 2024-11-15 |
| 9 | "stop" | Cancels pending action | ✅ PASS | 2024-11-15 |

### Refinement

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 10 | "Actually change the subject to X" | Modifies and reconfirms | ⏳ TO TEST | - |

---

## Contact Domain (8 tests)

### Contact Lookup

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 1 | "What's Nikhil's email?" | lookup_contact("Nikhil") → returns email | ✅ PASS | 2024-11-14 |
| 2 | "Find Rohan's phone number" | lookup_contact("Rohan") → returns phone | ⏳ TO TEST | - |
| 3 | "Do I have Sarah's contact?" | Checks if contact exists | ⏳ TO TEST | - |

### Contact Creation

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 4 | "Save John's contact: john@example.com, 555-1234" | Creates contact | ✅ PASS | 2024-11-14 |
| 5 | "Add Akash to my contacts: akash@company.com" | Creates contact | ⏳ TO TEST | - |

### Integration with Other Tools

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 6 | "Email Nikhil" (no email stored) → system looks up | lookup_contact → send_email | ✅ PASS | 2024-11-14 |
| 7 | "Schedule a meeting with Rohan" (no email stored) | lookup_contact → create_calendar_event | ⏳ TO TEST | - |
| 8 | "Send my contact card to Sarah" | Exports vCard and sends via email | ⏳ TO TEST | - |

---

## Web Search & Drive (5 tests)

### Web Search

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 1 | "Search the web for latest AI news" | web_search → summarizes results | ✅ PASS | 2024-11-13 |
| 2 | "What's the weather in Mumbai?" | web_search → returns weather | ✅ PASS | 2024-11-13 |

### Drive Operations

| # | User Query | Expected Behavior | Status | Last Tested |
|---|------------|-------------------|--------|-------------|
| 3 | "Find the Q4 report in my Drive" | search_drive → returns matches | ✅ PASS | 2024-11-13 |
| 4 | "Read the contract.pdf from my Drive" | search_drive → read_drive_document | ✅ PASS | 2024-11-13 |
| 5 | "Summarize the latest presentation in my Drive" | search_drive → read → summarize | ⏳ TO TEST | - |

---

## Summary

### Overall Pass Rate: 52/93 = 56%

### By Domain:

| Domain | Tests | Pass | Fail | Not Impl | To Test | Pass Rate |
|--------|-------|------|------|----------|---------|-----------|
| **Document** | 20 | 20 | 0 | 0 | 0 | **100%** ✅ |
| **Email** | 15 | 1 | 1 | 0 | 13 | **7%** ⚠️ |
| **Calendar** | 15 | 5 | 1 | 3 | 6 | **33%** ⚠️ |
| **Reminder** | 10 | 5 | 0 | 1 | 4 | **50%** ⚠️ |
| **Task** | 10 | 0 | 0 | 4 | 6 | **0%** ⚠️ |
| **Confirmation** | 10 | 9 | 0 | 0 | 1 | **90%** ✅ |
| **Contact** | 8 | 3 | 0 | 0 | 5 | **38%** ⚠️ |
| **Web/Drive** | 5 | 4 | 0 | 0 | 1 | **80%** ✅ |

### Priority Fixes:

1. **Email brevity** (Test #7 FAIL) → Phase 1
2. **Calendar responses** (Test #1 FAIL) → Phase 2
3. **Calendar updates** (Tests #10-12 NOT IMPL) → Phase 3
4. **Task completion** (Tests #7-10 NOT IMPL) → Phase 4
5. **Complete remaining TO TEST cases** → Phase 5

### Target After Implementation:

**95% pass rate = 88/93 tests passing**

With Phases 1-4 complete, estimated pass rate: **85-90%**

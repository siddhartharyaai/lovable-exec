# Product Requirements Document (PRD)
## Personal AI Executive Assistant

**Version:** 1.0  
**Last Updated:** 2025-11-02  
**Owner:** Product Team  

---

## 1. Vision & Goals

Build a WhatsApp-first AI executive assistant that empowers busy professionals in India to manage their work and personal life through natural conversation. The assistant proactively surfaces important information, manages calendar and tasks, and handles communications - all through the familiar WhatsApp interface.

### Core Goal
Create a conversational AI assistant that:
- Lives where users already are (WhatsApp)
- Deeply integrates with Google Workspace (Gmail, Calendar, Tasks, People)
- Proactively surfaces important information (briefings, reminders, birthdays)
- Uses natural language and voice for all interactions
- Respects user privacy and data security

---

## 2. Target Users & Personas

### Primary Persona: "Busy Rohan"
- **Role:** Senior Manager / Executive
- **Location:** India (IST timezone)
- **Challenges:**
  - Constant context switching between apps
  - Misses important emails and meetings
  - Forgets to follow up on tasks
  - Wants to stay on top of relationships (birthdays, follow-ups)
- **Behaviors:**
  - Primarily uses WhatsApp for communication
  - Comfortable with voice notes
  - Uses Google Workspace for work
  - Values efficiency and proactive assistance

### Secondary Persona: "Entrepreneur Priya"
- **Role:** Startup Founder
- **Location:** India (IST timezone)
- **Challenges:**
  - Managing multiple priorities simultaneously
  - Needs quick access to information
  - Limited time for administrative tasks
- **Behaviors:**
  - Always on mobile
  - Prefers voice over typing
  - Needs context-aware assistance

---

## 3. Value Proposition

**For busy professionals** who need to stay on top of their work and personal commitments, the **Personal AI Executive Assistant** is a **WhatsApp-based AI agent** that **proactively manages your calendar, tasks, email, and relationships** unlike **traditional productivity apps** which require constant manual checking and context switching.

### Key Benefits
1. **Zero App Switching:** Everything through WhatsApp
2. **Voice-First:** Speak naturally, get things done
3. **Proactive Intelligence:** Daily briefings, timely reminders
4. **Deep Integration:** Native Google Workspace access
5. **Privacy-First:** Your data, your control

---

## 4. Key Use Cases

### UC1: Morning Briefing
**As a** busy professional  
**I want** a concise morning briefing  
**So that** I can start my day informed and prepared

**Flow:**
1. System sends briefing at 8:00 AM IST
2. Shows next 3 calendar events
3. Lists today's tasks
4. Summarizes top 3 important unread emails
5. Highlights any birthdays tomorrow

**Success Criteria:**
- Delivered on time (±2 minutes)
- Information is relevant and actionable
- Takes <30 seconds to read

### UC2: Voice-to-Calendar
**As a** mobile-first user  
**I want** to create calendar events via voice  
**So that** I can schedule without typing

**Flow:**
1. User sends voice note: "Block 30 mins tomorrow morning for weekly sync with Rohan"
2. System transcribes and parses intent
3. Looks up "Rohan" in contacts
4. Creates calendar event with attendee
5. Confirms creation via WhatsApp

**Success Criteria:**
- Accurate transcription (>95%)
- Correct intent parsing (>90%)
- Successful calendar creation
- Clear confirmation message

### UC3: WhatsApp Native Reminders
**As a** user  
**I want** to set reminders via WhatsApp  
**So that** I get timely notifications without another app

**Flow:**
1. User: "Remind me to call mom at 7 pm"
2. System parses time in user's timezone (IST)
3. Creates reminder in database
4. At 7:00 PM IST, sends WhatsApp message
5. User receives: "⏰ Reminder: call mom"

**Success Criteria:**
- Time parsing accuracy (>95%)
- Delivered within 1 minute of scheduled time
- Retry logic for failed deliveries

### UC4: Email Triage
**As a** email-overwhelmed user  
**I want** smart email summaries  
**So that** I don't miss important messages

**Flow:**
1. User: "What's in my inbox?"
2. System fetches unread emails
3. AI summarizes top 3 most important
4. Presents with sender, subject, key points
5. Offers to draft replies for selected emails

**Success Criteria:**
- Correct importance ranking
- Concise, actionable summaries
- Option to act on emails

### UC5: Task Management
**As a** user  
**I want** to create and check tasks via chat  
**So that** I can manage my todo list conversationally

**Flow:**
1. User: "Add 'Review Q4 budget' to my tasks"
2. System creates task in Google Tasks
3. Confirms creation
4. Later: User: "What's on my plate today?"
5. System shows today's tasks with status

**Success Criteria:**
- Successful task creation
- Accurate task retrieval
- Clear task status

---

## 5. Feature Requirements

### P0 (Must-Have for MVP)
- ✅ WhatsApp webhook integration
- ✅ Voice-to-text transcription (Lovable AI Whisper)
- ✅ Intent parsing and routing (Lovable AI)
- ✅ Google OAuth with token refresh
- ✅ WhatsApp native reminders
- ✅ Calendar CRUD operations
- ✅ Task creation and reading
- ✅ Email unread summary
- ✅ Daily briefing scheduler
- ✅ Birthday reminder scheduler
- ✅ Web dashboard (connection status, settings)
- ✅ Privacy controls (export, delete)

### P1 (High Priority Post-MVP)
- ✅ Email draft generation and sending (with confirmation)
- ✅ Web search (SERP API for general, Firecrawl for specific)
- ✅ Contact lookup via Google People API
- ✅ Reminder snooze functionality
- ✅ Task completion
- ✅ Calendar event modification and deletion
- ✅ Calendar events by person/attendee
- ✅ News, weather, and current affairs queries

### P2 (Nice-to-Have)
- Multi-user delegation
- Team coordination features
- Slack mirroring
- Voice reply synthesis
- Smart task priority suggestions
- Recurring events and reminders

### Removed Features
- ❌ Image generation (removed from scope - 2025-11-02)

---

## 6. Non-Goals (What We're NOT Building)

- ❌ Multi-platform messaging (only WhatsApp)
- ❌ Custom AI training (using Lovable AI)
- ❌ Video conferencing integration
- ❌ CRM features
- ❌ Project management
- ❌ Document editing
- ❌ Native mobile apps (WhatsApp is the interface)

---

## 7. Success Metrics

### Activation
- User completes Google OAuth: >80% of signups
- First successful interaction: <5 minutes from signup

### Engagement
- Daily Active Users (DAU): Target 60% of registered users
- Average interactions per user per day: >3
- Voice note usage: >40% of all messages

### Quality
- Intent parsing accuracy: >90%
- Webhook processing latency: <2 seconds p95
- Scheduler delivery accuracy: ±2 minutes

### Satisfaction
- User-reported helpfulness: >4/5
- Feature request volume: <10% of interactions
- Churn rate: <20% monthly

---

## 8. Technical Constraints

- **Platform:** Lovable Cloud (Supabase-based)
- **AI:** Lovable AI only (no external AI services)
- **Messaging:** Twilio WhatsApp API
- **Timezone:** Default IST, per-user configurable
- **Auth:** Google OAuth 2.0 (PKCE, offline access)
- **Data Residency:** Cloud provider default (with encryption)

---

## 9. Security & Privacy Requirements

- ✅ All tokens encrypted at rest
- ✅ Signature verification for webhooks
- ✅ No PII in logs (redaction)
- ✅ User data export (JSON)
- ✅ User data deletion (cascade)
- ✅ Least-privilege access scopes
- ✅ Rate limiting on endpoints
- ✅ CSRF protection on web routes

---

## 10. Rollout Plan

### Phase 1: Alpha (Weeks 1-2)
- Internal team testing
- Core flows validated
- Bug fixes and hardening

### Phase 2: Private Beta (Weeks 3-4)
- 10-20 external users
- Collect feedback
- Iterate on UX and prompts

### Phase 3: Open Beta (Week 5+)
- Open signups
- Monitor metrics
- Scale infrastructure

### Phase 4: Production
- Google OAuth verification
- Twilio production number
- Documentation and support

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google OAuth rejection | High | Prepare detailed privacy policy, justification, demo video |
| Twilio rate limits | Medium | Implement queue with backoff, monitor quotas |
| AI hallucinations | Medium | Clear disclaimers, explicit confirmations for destructive actions |
| Token refresh failures | Medium | Graceful degradation, user notification, retry logic |
| Webhook downtime | High | Idempotency, replay mechanism, health checks |
| User data leaks | Critical | Encryption, access controls, regular security audits |

---

## 12. Dependencies

- **External Services:**
  - Twilio (WhatsApp API)
  - Google APIs (OAuth, Gmail, Calendar, Tasks, People)
  - Lovable AI (NLP, STT, image generation)
  
- **Internal:**
  - Lovable Cloud infrastructure
  - Database migrations
  - Scheduler service

---

## 13. Open Questions

- [ ] How to handle multi-person meeting conflicts?
- [ ] Should we support recurring reminders?
- [ ] What's the right email summary length?
- [ ] How to handle timezone changes when traveling?

---

## 14. Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2025-11-02 | Initial PRD | Project kickoff | Team |

---

## Appendix

### Glossary
- **IST:** Indian Standard Time (UTC+5:30)
- **PKCE:** Proof Key for Code Exchange (OAuth security)
- **RLS:** Row-Level Security
- **STT:** Speech-to-Text
- **Lovable Cloud:** Lovable's Supabase-based backend platform

### References
- Lovable AI docs: https://docs.lovable.dev/features/ai
- Twilio WhatsApp API: https://www.twilio.com/docs/whatsapp
- Google OAuth: https://developers.google.com/identity/protocols/oauth2

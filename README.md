# Man Friday - WhatsApp AI Executive Assistant

An intelligent WhatsApp-based personal assistant that integrates with Google Workspace to manage your calendar, tasks, emails, documents, and more through natural conversation.

## What Can Man Friday Do?

- 📅 **Calendar Management**: View, create, and delete events using natural language
- ✅ **Task Management**: Create, complete, and manage Google Tasks
- 📧 **Email Assistance**: Summarize inbox, mark as read, draft emails with contact lookup
- 📄 **Document Q&A**: Upload PDFs/docs and ask questions about content (supports 150+ page documents)
- ⏰ **Smart Reminders**: Set reminders with natural language ("remind me tomorrow at 3pm")
- 🔍 **Web Search**: Real-time weather, news, and general web queries
- 🎤 **Voice Transcription**: Automatically transcribe WhatsApp voice messages
- 🌍 **Translation**: Auto-detect language and translate (100+ languages)
- 📂 **Drive Search**: Find and read documents from Google Drive
- 📨 **Daily Briefing**: Automated morning summary (8 AM IST) with weather, calendar, tasks, emails

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn-ui
- **Backend**: Lovable Cloud (Supabase) - 25 edge functions
- **Messaging**: Twilio WhatsApp Business API
- **AI**: Lovable AI (Gemini 2.5 Flash)
- **Integrations**: Google Workspace APIs (Calendar, Gmail, Tasks, Contacts, Drive)
- **External APIs**: Deepgram (voice), SerpAPI (search), Firecrawl (scraping)

## Required API Keys & Setup

### 1. Twilio WhatsApp
- Account SID and Auth Token
- WhatsApp-enabled phone number
- Webhook configured to: `https://<your-project>.lovable.app/whatsapp-webhook`

### 2. Google Cloud Console
- OAuth 2.0 Client ID and Secret
- Enable APIs: Calendar, Gmail, Tasks, Contacts, Drive, People API
- Authorized redirect URIs configured
- OAuth consent screen configured

### 3. External Services (Configure in Lovable Cloud Secrets)
- `LOVABLE_API_KEY` - AI processing
- `DEEPGRAM_API_KEY` - Voice transcription
- `SERP_API_KEY` - Web search
- `FIRECRAWL_API_KEY` - Website scraping

## Quick Start

### For End Users
1. Send the Twilio sandbox join code to the WhatsApp number (for testing)
2. Text "Hi" to Man Friday to start conversation
3. Complete Google OAuth by visiting the provided link
4. Set your city: "Set my city to Bangalore"
5. Start using: "What's on my calendar today?"

### For Developers

**Local Development:**
```bash
git clone <your-repo-url>
cd <project-name>
npm install
npm run dev
```

**Deploy Edge Functions:**
All edge functions auto-deploy when you push to the repo (if connected to Lovable).

**Database Migrations:**
Migrations in `supabase/migrations/` are auto-applied via Lovable Cloud.

## Key Files

- **Edge Functions**: `supabase/functions/` (25 serverless functions)
- **Database Schema**: `supabase/migrations/`
- **Frontend Pages**: `src/pages/` (Dashboard, Settings, Privacy)
- **Supabase Client**: `src/integrations/supabase/` (auto-generated, do not edit)

## Documentation

- **[NEW_USER_ONBOARDING_GUIDE.md](./NEW_USER_ONBOARDING_GUIDE.md)**: Step-by-step user onboarding
- **[RUNBOOK.md](./RUNBOOK.md)**: Operational procedures for incidents and troubleshooting
- **[TEST_SUITE.md](./TEST_SUITE.md)**: Comprehensive test cases for all features
- **[PRD.md](./PRD.md)**: Product requirements and use cases
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: System design and data flow
- **[BACKLOG.md](./BACKLOG.md)**: Nice-to-have features (not blocking MVP)
- **[MVP_COMPLETION.md](./MVP_COMPLETION.md)**: MVP completion criteria and acceptance tests

## Testing

### Manual Testing
See `TEST_SUITE.md` and `END_TO_END_TEST_PLAN.md` for comprehensive test scenarios.

### Automated Testing
(To be implemented - see MVP_COMPLETION.md for details)

## Deployment

**Frontend:**
1. Click "Publish" in Lovable editor (top right)
2. Click "Update" to deploy latest changes
3. Frontend is live at: `https://<your-project>.lovable.app`

**Backend (Edge Functions):**
- Auto-deploys on every code push (no manual action needed)

## Monitoring & Logs

- **Audit Log**: `audit_log` table captures all actions with trace IDs
- **Error Logs**: `logs` table records failures with stack traces
- **Edge Function Logs**: View in Lovable Cloud → Functions → [function name] → Logs

## Cron Jobs (Scheduled Tasks)

- `check-due-reminders`: Every 1 minute
- `daily-briefing`: Daily at 8 AM IST
- `check-birthday-reminders`: Daily at 8 AM IST

## Known Limitations

- Twilio Sandbox: 50 messages/day limit (upgrade to production for unlimited)
- Document Processing: First 150 pages of large PDFs (truncation notice shown)
- Google API Rate Limits: Standard quotas apply

## Support & Issues

- Check `RUNBOOK.md` for common incidents and resolutions
- Review `audit_log` table for detailed trace of actions
- Edge function logs show detailed errors with trace IDs

## License

MIT

---

**Project URL**: https://lovable.dev/projects/6e97bd32-02a0-40a5-a284-d08d734b7d96

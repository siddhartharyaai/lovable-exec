# WhatsApp AI Executive Assistant - New User Onboarding Guide
**Version**: 1.0  
**Last Updated**: November 12, 2025

---

## 📋 OVERVIEW

This guide provides a complete, step-by-step process for onboarding a new user to your WhatsApp AI Executive Assistant (Maria). This system provides a personal AI assistant that integrates with WhatsApp, Google Workspace, and provides intelligent task management, reminders, document processing, and more.

---

## 🎯 WHAT THE SYSTEM DOES

**Maria** is an AI Executive Assistant that users interact with entirely through WhatsApp. She can:

- 📅 Manage Google Calendar (view, create, update, delete events)
- ✅ Manage Google Tasks (create, complete, delete tasks)
- 📧 Manage Gmail (summarize inbox, search emails, draft messages)
- 📄 Process documents (PDF, DOC, DOCX) - extract text and answer questions
- 🔍 Search the web in real-time (weather, news, sports scores)
- 🌐 Scrape websites for structured data
- ⏰ Set native WhatsApp reminders with snooze functionality
- 🎤 Transcribe voice messages automatically
- 🌍 Auto-detect language and translate (100+ languages supported)
- 👥 Look up contacts from Google Contacts
- 📂 Search and read Google Drive documents
- 📨 Send automated daily briefings (8 AM IST)

---

## 🏗️ SYSTEM ARCHITECTURE

### Components:

1. **Twilio WhatsApp Business API** - Messaging infrastructure
2. **Supabase Backend** - Database + Edge Functions (25 serverless functions)
3. **Google Workspace APIs** - Calendar, Gmail, Tasks, Contacts, Drive
4. **External APIs**:
   - Lovable AI (Gemini 2.5 Flash) - Natural language processing
   - Deepgram - Voice transcription
   - SerpAPI - Web search
   - Firecrawl - Website scraping
5. **Cron Jobs** - Scheduled tasks (reminders, briefings, birthday alerts)

### Database Tables:
- `users` - User profiles and phone numbers
- `messages` - Conversation history
- `conversation_messages` - AI conversation context
- `session_state` - User session and context management
- `oauth_tokens` - Google OAuth tokens
- `reminders` - WhatsApp reminders
- `user_documents` - Uploaded document text
- `user_preferences` - Learned user preferences
- `audit_log` - All system actions for debugging

---

## 📝 PREREQUISITES

Before onboarding a new user, ensure you have:

### 1. **Twilio Account** (Required)
- Active Twilio account with WhatsApp Business API enabled
- Phone number registered for WhatsApp Business
- Account SID and Auth Token
- Webhook configured to point to your Supabase edge function

### 2. **Supabase Project** (Required)
- Running Supabase project with all edge functions deployed
- Database tables created (see migrations)
- Environment secrets configured

### 3. **Google Cloud Console** (Required for Google features)
- OAuth 2.0 Client ID and Secret
- APIs enabled: Calendar, Gmail, Tasks, Contacts, Drive, People
- Authorized redirect URIs configured
- Consent screen configured

### 4. **API Keys** (Configured in Supabase Secrets)
- `LOVABLE_API_KEY` - AI processing
- `TWILIO_ACCOUNT_SID` - WhatsApp messaging
- `TWILIO_AUTH_TOKEN` - WhatsApp auth
- `TWILIO_WHATSAPP_NUMBER` - Your Twilio WhatsApp number
- `DEEPGRAM_API_KEY` - Voice transcription
- `SERP_API_KEY` - Web search
- `FIRECRAWL_API_KEY` - Website scraping
- `GOOGLE_CLIENT_ID` - OAuth
- `GOOGLE_CLIENT_SECRET` - OAuth
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key
- `SUPABASE_PUBLISHABLE_KEY` - Supabase public key

---

## 🚀 ONBOARDING PROCESS

### PHASE 1: TWILIO SETUP (5-10 minutes)

#### Step 1: Add Phone Number to Twilio Sandbox (Testing)

**For Testing/Development:**

1. Go to Twilio Console → WhatsApp → Sandbox
2. Get your sandbox join code (e.g., "join [code]")
3. Have the new user text the join code to the Twilio WhatsApp number
4. Confirm user is added to sandbox

**Result**: User can now send/receive messages via WhatsApp sandbox.

#### Step 2: Add Phone Number to Production (Production Use)

**For Production:**

1. Go to Twilio Console → WhatsApp → Senders
2. Add new sender (requires approval from WhatsApp/Meta)
3. Follow Twilio's WhatsApp Business approval process
4. Once approved, add user's phone number to approved list

**Note**: Production WhatsApp Business requires Meta approval (can take 1-3 days).

#### Step 3: Verify Webhook Configuration

1. Go to Twilio Console → WhatsApp → Sandbox Settings (or Sender Settings)
2. Set webhook URL:
   ```
   https://[YOUR-PROJECT-ID].supabase.co/functions/v1/whatsapp-webhook
   ```
3. Set method: **POST**
4. Save configuration

**Test**: Send "hello" from user's WhatsApp → Should receive automated response.

---

### PHASE 2: DATABASE USER CREATION (Automatic)

**The system automatically creates users!**

When a new phone number sends a message:
1. `whatsapp-webhook` function receives the message
2. Phone number is extracted from Twilio payload
3. System upserts user into `users` table:
   ```sql
   INSERT INTO users (phone, created_at, updated_at) 
   VALUES ('whatsapp:+919876543210', NOW(), NOW())
   ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
   ```

**Result**: User record is created with a unique `user_id` (UUID).

**No manual action required** - just have the user send any message.

---

### PHASE 3: GOOGLE WORKSPACE INTEGRATION (10-15 minutes)

**CRITICAL**: Google OAuth is REQUIRED for:
- Gmail, Calendar, Tasks, Contacts, Drive, Daily Briefings

#### Step 1: User Initiates OAuth Flow

**Option A: Via Web App**
1. User visits: `https://[your-domain]/settings` (or your frontend URL)
2. User clicks "Connect Google" button
3. System redirects to Google OAuth consent screen

**Option B: Via WhatsApp Command** (If implemented)
1. User sends: "Connect my Google account"
2. Bot replies with OAuth link
3. User clicks link, completes OAuth

#### Step 2: OAuth Flow (Google Side)

1. User sees Google consent screen
2. Requested permissions:
   - ✉️ Gmail: Read, send, delete emails
   - 📅 Calendar: Read, create, update, delete events
   - ✅ Tasks: Read, create, complete, delete tasks
   - 👥 Contacts: Read contact information
   - 📂 Drive: Read files and folders
3. User clicks "Allow"
4. Google redirects back to callback URL:
   ```
   https://[YOUR-PROJECT-ID].supabase.co/functions/v1/auth-google-callback
   ```

#### Step 3: Token Storage (Automatic)

The `auth-google-callback` function:
1. Exchanges authorization code for access token + refresh token
2. Fetches user's email from Google
3. Updates `users` table with email
4. Stores tokens in `oauth_tokens` table:
   ```sql
   INSERT INTO oauth_tokens (
     user_id,
     provider,
     access_token,
     refresh_token,
     expires_at,
     scopes
   ) VALUES (...)
   ```

**Result**: User's Google account is connected and tokens are stored.

#### Step 4: Verify Connection

**Test Commands** (send via WhatsApp):
- "What's on my calendar today?" → Should show calendar events
- "Summarize my last 5 emails" → Should show email summaries
- "What tasks do I have?" → Should show Google Tasks

If any command fails with "permission denied" or "OAuth expired":
- User needs to reconnect Google (repeat Phase 3)

---

### PHASE 4: USER TESTING & TRAINING (15-30 minutes)

#### Basic Features Test:

1. **Conversational Test**:
   - User: "Hi, who are you?"
   - Bot: "I'm Maria, your AI executive assistant! I'm here to help..."

2. **Document Upload Test**:
   - User uploads a PDF document
   - Bot: "📄 Got it! I've saved your document 'filename.pdf'. What would you like to know about it?"
   - User: "Summarize this document"
   - Bot: [Provides summary]

3. **Voice Message Test**:
   - User sends voice message
   - Bot transcribes and responds to content

4. **Web Search Test**:
   - User: "What's the weather in Mumbai?"
   - Bot: [Searches web and provides weather info]

5. **Reminder Test**:
   - User: "Remind me to call John in 10 minutes"
   - Bot: "⏰ Got it! I'll remind you to 'call John' at [time]"
   - Wait 10 minutes → User receives WhatsApp reminder

#### Google Integration Test:

6. **Calendar Test**:
   - User: "What's on my calendar tomorrow?"
   - Bot: [Shows calendar events]
   - User: "Schedule a meeting with Sarah tomorrow at 3 PM"
   - Bot: [Creates calendar event]

7. **Email Test**:
   - User: "Summarize my last 5 emails"
   - Bot: [Shows email summaries]
   - User: "Search for emails from John"
   - Bot: [Shows matching emails]

8. **Tasks Test**:
   - User: "Add task: Finish project report"
   - Bot: [Creates task in Google Tasks]
   - User: "What tasks do I have?"
   - Bot: [Shows task list]

9. **Contacts Test**:
   - User: "What's Sarah's email?"
   - Bot: [Looks up contact, shows email]

10. **Drive Test**:
    - User: "Search my Drive for 'Q4 report'"
    - Bot: [Shows Drive search results]
    - User shares Drive link
    - User: "Summarize this document"
    - Bot: [Reads Drive doc and provides summary]

#### Daily Briefing Test:

11. **Wait for 8:00 AM IST next day**:
    - User should automatically receive:
      ```
      📅 Good morning! Here's your briefing for [date]:
      
      **Calendar Today:**
      • 10:00 AM - Team Standup
      • 2:00 PM - Client Call
      • 4:00 PM - Project Review
      
      **Recent Emails:**
      • Email from John: "Q4 Results..."
      • Email from Sarah: "Meeting notes..."
      
      Have a productive day!
      ```

---

## 🔧 TROUBLESHOOTING GUIDE

### Issue #1: User Not Receiving Messages

**Symptoms**: User sends messages but bot doesn't respond.

**Diagnosis**:
1. Check Twilio logs for incoming webhooks
2. Check Supabase edge function logs (`whatsapp-webhook`)
3. Verify webhook URL is correct in Twilio console

**Solutions**:
- Verify webhook URL: `https://[PROJECT-ID].supabase.co/functions/v1/whatsapp-webhook`
- Ensure webhook method is POST
- Check Twilio WhatsApp sandbox status (if using sandbox)
- Verify user joined sandbox (if using sandbox)

### Issue #2: Google OAuth Expired/Not Working

**Symptoms**: Bot says "I don't have access to your calendar" or similar.

**Diagnosis**:
```sql
SELECT provider, expires_at, expires_at > NOW() as is_valid 
FROM oauth_tokens 
WHERE user_id = '[USER-ID]'
```

**Solutions**:
- If `is_valid = false`: User needs to reconnect Google
- If no record exists: User never connected Google
- If `refresh_token` is NULL: User denied offline access (requires reconnection with proper consent)

**How to Reconnect**:
1. User goes to Settings page
2. Click "Disconnect Google"
3. Click "Connect Google" again
4. Complete OAuth flow, ensuring "Allow offline access" is checked

### Issue #3: Document Summarization Not Working

**Symptoms**: User uploads document, asks to summarize, bot says "can't find document".

**Diagnosis**:
```sql
SELECT id, filename, created_at 
FROM user_documents 
WHERE user_id = '[USER-ID]' 
ORDER BY created_at DESC 
LIMIT 5;
```

**Solutions**:
- If documents exist but bot can't find them:
  - Check `session_state` table for `last_uploaded_doc_id`
  - Verify document was uploaded within last 2 hours
  - Check edge function logs for `route-intent` and `handle-document-qna`
- If no documents in database:
  - Check `whatsapp-webhook` logs for document processing errors
  - Verify Lovable AI API key is configured
  - Check file size (max 20MB)

### Issue #4: Reminders Not Being Sent

**Symptoms**: User sets reminder but doesn't receive it at scheduled time.

**Diagnosis**:
```sql
-- Check if reminder was created
SELECT * FROM reminders WHERE user_id = '[USER-ID]' ORDER BY created_at DESC;

-- Check if cron job is active
SELECT * FROM cron.job WHERE jobname = 'check-due-reminders-every-minute';
```

**Solutions**:
- Verify reminder exists in database with correct `due_ts`
- Verify cron job is active: `active = true`
- Check edge function logs for `check-due-reminders`
- Check `send-whatsapp` logs for errors
- Verify Twilio credentials are correct

### Issue #5: Daily Briefing Not Arriving

**Symptoms**: User doesn't receive 8 AM briefing.

**Diagnosis**:
```sql
-- Check if cron job is active
SELECT * FROM cron.job WHERE jobname = 'daily-briefing-8am-ist';

-- Check if OAuth is valid
SELECT expires_at > NOW() as is_valid FROM oauth_tokens WHERE user_id = '[USER-ID]';
```

**Solutions**:
- Verify cron job is active
- Verify Google OAuth is valid (briefing requires Calendar + Gmail access)
- Check timezone: 8 AM IST = 2:30 AM UTC
- Check edge function logs for `daily-briefing`
- Manually trigger: `SELECT net.http_post(url := 'https://[PROJECT-ID].supabase.co/functions/v1/daily-briefing')`

### Issue #6: Bot Responses Are Robotic/Formal

**Symptoms**: Bot says "Oh dear, my sincerest apologies" or "I will now proceed to...".

**Diagnosis**: AI system prompt may need adjustment.

**Solution**:
- Check `ai-agent/index.ts` system prompt (lines 523-680)
- Verify anti-patterns section is included
- If bot is still too formal, increase temperature in AI calls (currently 0.9)

---

## 📊 MONITORING & MAINTENANCE

### Daily Checks:

1. **Cron Job Status**:
   ```sql
   SELECT jobname, active, schedule FROM cron.job ORDER BY jobname;
   ```
   All should be `active = true`

2. **Failed Messages**:
   ```sql
   SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

3. **OAuth Token Health**:
   ```sql
   SELECT user_id, provider, expires_at < NOW() as expired 
   FROM oauth_tokens 
   WHERE expires_at < NOW() + INTERVAL '7 days';
   ```
   Notify users if tokens expiring within 7 days

4. **Edge Function Errors**:
   - Check Supabase edge function logs for errors
   - Look for 500 status codes or timeouts

### Weekly Maintenance:

1. **Database Cleanup**:
   ```sql
   -- Delete old conversation history (keep last 30 days)
   DELETE FROM conversation_messages WHERE created_at < NOW() - INTERVAL '30 days';
   
   -- Delete old audit logs (keep last 90 days)
   DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '90 days';
   ```

2. **Token Refresh Check**:
   - Review `refresh-google-token` logs
   - Ensure tokens are refreshing automatically
   - Contact users with expired tokens

3. **API Usage Review**:
   - Check Lovable AI usage
   - Check Deepgram usage (voice transcription)
   - Check SerpAPI usage (web search)
   - Check Firecrawl usage (scraping)

### Monthly Review:

1. **User Engagement**:
   ```sql
   SELECT 
     COUNT(DISTINCT user_id) as active_users,
     COUNT(*) as total_messages
   FROM messages 
   WHERE created_at > NOW() - INTERVAL '30 days';
   ```

2. **Feature Usage**:
   ```sql
   SELECT 
     tool_used,
     COUNT(*) as usage_count
   FROM audit_log 
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY tool_used 
   ORDER BY usage_count DESC;
   ```

3. **Error Rate**:
   ```sql
   SELECT 
     result,
     COUNT(*) 
   FROM audit_log 
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY result;
   ```

---

## 🔐 SECURITY BEST PRACTICES

### For Production Deployment:

1. **Environment Secrets**:
   - NEVER commit secrets to Git
   - Use Supabase Secrets Manager for all API keys
   - Rotate keys every 90 days

2. **Twilio Security**:
   - Enable Twilio signature verification (implemented in `whatsapp-webhook`)
   - Whitelist webhook IPs
   - Use HTTPS only

3. **Database Security**:
   - Enable Row Level Security (RLS) on all tables
   - Use service role key only in edge functions
   - Never expose service role key to client

4. **OAuth Security**:
   - Store refresh tokens encrypted
   - Implement token rotation
   - Request minimal OAuth scopes needed
   - Handle token expiration gracefully

5. **User Data Privacy**:
   - Inform users what data is stored
   - Provide data export option
   - Implement data deletion on request
   - Comply with GDPR/local privacy laws

---

## 📋 USER ONBOARDING CHECKLIST

Use this checklist for each new user:

### Pre-Onboarding:
- [ ] Twilio WhatsApp number is active
- [ ] All Supabase edge functions deployed
- [ ] All API keys configured in Supabase Secrets
- [ ] Cron jobs are active
- [ ] Database tables created and RLS enabled

### Phase 1: WhatsApp Setup
- [ ] User added to Twilio sandbox (testing) OR approved sender list (production)
- [ ] Webhook URL configured in Twilio
- [ ] User sends test message "hello"
- [ ] Bot responds correctly

### Phase 2: Database Creation
- [ ] User record created automatically in `users` table
- [ ] Verify user_id exists

### Phase 3: Google Integration
- [ ] User clicks "Connect Google" in web app
- [ ] User completes OAuth consent flow
- [ ] Tokens stored in `oauth_tokens` table
- [ ] Test calendar query: "What's on my calendar today?"
- [ ] Test email query: "Summarize my last 5 emails"

### Phase 4: Feature Testing
- [ ] Document upload & summarization works
- [ ] Voice message transcription works
- [ ] Web search works
- [ ] Reminders work (create + receive)
- [ ] Calendar integration works
- [ ] Email integration works
- [ ] Tasks integration works
- [ ] Contacts lookup works
- [ ] Drive integration works

### Phase 5: Daily Briefing
- [ ] Wait for 8 AM IST next day
- [ ] Verify user receives automated briefing

### Post-Onboarding:
- [ ] User trained on basic commands
- [ ] User knows how to reconnect Google if needed
- [ ] User has support contact info
- [ ] User added to monitoring dashboard

---

## 🎓 USER TRAINING MATERIALS

### Quick Start Guide for Users

**Welcome to Your AI Executive Assistant!**

Here are some things you can say to Maria via WhatsApp:

**📅 Calendar**:
- "What's on my calendar today?"
- "Schedule a meeting with John tomorrow at 3 PM"
- "Cancel my 2 PM meeting tomorrow"
- "Reschedule tomorrow's meeting with Sarah to Friday"

**✅ Tasks**:
- "Add task: Finish project report"
- "What tasks do I have?"
- "Complete task: Call dentist"
- "Delete task: Buy groceries"

**📧 Email**:
- "Summarize my last 5 emails"
- "Search for emails from Sarah about Q4"
- "Draft an email to John thanking him for the meeting"

**📄 Documents**:
- Upload any PDF/DOC file
- "Summarize this document"
- "What does this document say about pricing?"

**⏰ Reminders**:
- "Remind me to call mom in 2 hours"
- "Set a reminder to take medicine at 9 PM"
- "Snooze" (when you receive a reminder)

**🔍 Web Search**:
- "What's the weather in Mumbai?"
- "What's the score of India vs Australia?"
- "Latest news about Apple stock"

**🎤 Voice Messages**:
- Just send a voice message - it will be transcribed automatically!

**🌍 Language**:
- Speak in ANY language - Maria will understand and respond!

**📱 Daily Briefing**:
- Every morning at 8 AM, you'll receive an automated briefing with your calendar and recent emails

**Need Help?**:
- "What can you do?"
- "Help with calendar"
- "How do I set reminders?"

---

## 🆘 SUPPORT CONTACTS

For technical issues during onboarding:

- **System Administrator**: [Your Contact]
- **Twilio Support**: [Twilio Account Link]
- **Supabase Support**: [Supabase Dashboard Link]
- **Documentation**: This guide + `CRITICAL_SYSTEM_AUDIT_NOV12.md`

---

## 📝 APPENDIX: API COSTS (Estimated)

**Per User, Per Month:**

| Service | Usage | Cost |
|---------|-------|------|
| Lovable AI (Gemini 2.5 Flash) | ~1000 requests | ~$5 |
| Twilio WhatsApp | ~500 messages | ~$2.50 |
| Deepgram (Voice) | ~100 minutes | ~$2.50 |
| SerpAPI (Search) | ~100 queries | ~$5 |
| Firecrawl (Scraping) | ~50 pages | ~$2.50 |
| Google Workspace APIs | Free tier | $0 |
| Supabase | Free tier | $0 |
| **Total** | | **~$17.50/user/month** |

**Note**: Costs scale with usage. Heavy users may cost more.

---

## ✅ FINAL CHECKLIST

Before marking onboarding as complete:

- [ ] User can send/receive WhatsApp messages
- [ ] User's Google account is connected
- [ ] All 10 feature tests passed
- [ ] User received first daily briefing
- [ ] User trained on basic commands
- [ ] User contact info added to monitoring system
- [ ] User added to support channel
- [ ] User feedback collected

**Onboarding Complete!** 🎉

---

**Document Version**: 1.0  
**Last Updated**: November 12, 2025  
**Maintained By**: System Administrator  
**Next Review**: Monthly

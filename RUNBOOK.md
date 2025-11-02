# Runbook
## Personal AI Executive Assistant

**Purpose:** Operational procedures for incidents, maintenance, and troubleshooting.

---

## Table of Contents
1. [Quick Reference](#quick-reference)
2. [Common Incidents](#common-incidents)
3. [Webhook Issues](#webhook-issues)
4. [OAuth Token Issues](#oauth-token-issues)
5. [Scheduler Job Failures](#scheduler-job-failures)
6. [Database Operations](#database-operations)
7. [Secret Rotation](#secret-rotation)
8. [Monitoring & Alerting](#monitoring--alerting)

---

## Quick Reference

### Service URLs
- **App:** `https://<project-id>.lovable.app`
- **Database:** Lovable Cloud dashboard
- **Twilio Console:** `https://console.twilio.com`
- **Google Cloud Console:** `https://console.cloud.google.com`

### Key Metrics Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Webhook latency (p95) | >2s | >5s |
| Webhook error rate | >5% | >10% |
| Scheduler failure rate | >10% | >25% |
| Token refresh failures | >5% | >15% |
| Reminder delivery delay | >5min | >15min |

---

## Common Incidents

### INC-001: High Webhook Latency

**Symptoms:**
- Webhook processing >2s p95
- Users reporting slow responses

**Diagnosis:**
```sql
-- Check recent webhook performance
SELECT 
  trace_id,
  payload->>'latency_ms' as latency,
  created_at
FROM logs
WHERE type = 'webhook'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY (payload->>'latency_ms')::int DESC
LIMIT 20;
```

**Resolution:**
1. Check Lovable AI rate limits (429/402 responses in logs)
2. Check Google API rate limits (429 responses)
3. Review complex intents causing timeouts
4. Consider adding caching for frequent queries

### INC-002: Webhook Not Receiving Messages

**Symptoms:**
- No new messages in database
- Users report no responses

**Diagnosis:**
1. Check Twilio webhook URL configured correctly
2. Verify signature validation not rejecting all requests
3. Check Lovable Cloud function deployment status

**Resolution:**
```bash
# Test webhook with cURL
curl -X POST https://<project-id>.lovable.app/webhooks/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: <signature>" \
  -d "From=whatsapp:+919999999999&Body=test"
```

### INC-003: Reminders Not Sending

**Symptoms:**
- Reminders with `status='pending'` past `due_ts`
- No WhatsApp messages sent

**Diagnosis:**
```sql
-- Check stuck reminders
SELECT 
  id, 
  user_id, 
  text, 
  due_ts, 
  status,
  last_attempt_ts
FROM reminders
WHERE status = 'pending'
  AND due_ts < NOW() - INTERVAL '10 minutes'
ORDER BY due_ts DESC
LIMIT 50;
```

**Resolution:**
1. Check scheduler job ran successfully (check logs)
2. Verify Twilio credentials valid
3. Check Twilio account balance/limits
4. Manually trigger job if scheduler failed
5. Update stuck reminders:
```sql
UPDATE reminders
SET last_attempt_ts = NULL
WHERE status = 'pending'
  AND due_ts < NOW()
  AND last_attempt_ts < NOW() - INTERVAL '30 minutes';
```

---

## Webhook Issues

### Replay Failed Webhooks

If webhooks failed due to temporary issues:

```sql
-- Find failed webhook messages
SELECT 
  id,
  user_id,
  body,
  created_at,
  parsed_intent
FROM messages
WHERE parsed_intent IS NULL
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- For each message, manually trigger intent parsing
-- (implement a replay script if needed)
```

### Invalid Twilio Signatures

If legitimate webhooks are being rejected:

1. Verify `TWILIO_AUTH_TOKEN` in secrets matches Twilio console
2. Check webhook URL matches exactly (trailing slash matters)
3. Review signature validation code for bugs
4. Temporarily log raw signature and computed signature (remove after debug)

---

## OAuth Token Issues

### Token Refresh Failures

**Symptoms:**
- 401 errors from Google APIs
- Users report "reconnect" messages

**Diagnosis:**
```sql
-- Check expired tokens
SELECT 
  u.phone,
  u.email,
  t.expires_at,
  t.scopes,
  t.updated_at
FROM oauth_tokens t
JOIN users u ON t.user_id = u.id
WHERE t.expires_at < NOW()
ORDER BY t.expires_at DESC;
```

**Resolution:**
1. Check if `refresh_token` is still valid (not revoked)
2. Verify Google OAuth client credentials
3. Ask user to re-authorize if refresh token invalid:
```sql
-- Delete invalid tokens to force re-auth
DELETE FROM oauth_tokens
WHERE user_id = '<user_id>';
```

### Revoke User Access

To revoke a user's Google access:

```sql
-- Delete OAuth tokens
DELETE FROM oauth_tokens
WHERE user_id = '<user_id>';

-- Notify user
-- (send WhatsApp message with re-auth link)
```

---

## Scheduler Job Failures

### Daily Briefing Not Sending

**Diagnosis:**
```sql
-- Check recent briefing logs
SELECT *
FROM logs
WHERE type = 'scheduler'
  AND payload->>'job' = 'proactive_daily_briefing'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

**Resolution:**
1. Check if job ran at scheduled time (8:00 AM IST)
2. Verify users have `daily_briefing_enabled=true`
3. Check Google API calls succeeded
4. Manually trigger briefing:
```typescript
// In Lovable Cloud Functions console, run:
await runDailyBriefing();
```

### Birthday Reminders Not Sending

**Similar diagnosis and resolution as daily briefing, but check:**
1. Job schedule (9:00 AM IST)
2. Calendar events have birthday category
3. Query logic for "tomorrow's birthdays"

---

## Database Operations

### Backup Current State

```sql
-- Export users table
COPY (SELECT * FROM users) TO '/tmp/users_backup.csv' CSV HEADER;

-- Export messages (last 30 days)
COPY (
  SELECT * FROM messages 
  WHERE created_at > NOW() - INTERVAL '30 days'
) TO '/tmp/messages_backup.csv' CSV HEADER;
```

### Delete User Data (GDPR/Privacy Request)

```sql
-- Cascade delete will handle related records
DELETE FROM users WHERE phone = '+919999999999';

-- Verify deletion
SELECT COUNT(*) FROM messages WHERE user_id = '<deleted_user_id>'; -- Should be 0
SELECT COUNT(*) FROM reminders WHERE user_id = '<deleted_user_id>'; -- Should be 0
```

### Clear Old Logs

```sql
-- Delete logs older than 90 days
DELETE FROM logs
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## Secret Rotation

### Rotate Twilio Auth Token

1. Generate new token in Twilio console
2. Update `TWILIO_AUTH_TOKEN` in Lovable Cloud Secrets
3. Test webhook with new token:
```bash
curl -X POST <webhook_url> \
  -H "X-Twilio-Signature: <new_signature>" \
  -d "From=whatsapp:+test&Body=test"
```
4. No downtime if done correctly

### Rotate Google OAuth Credentials

1. Create new OAuth client in Google Cloud Console
2. Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Update redirect URI if needed
4. **IMPORTANT:** All users will need to re-authorize
5. Send notification via WhatsApp with re-auth link

### Rotate App Secret Key

**⚠️ HIGH IMPACT - All encrypted data will be inaccessible**

1. Export all OAuth tokens with old key
2. Update `APP_SECRET_KEY`
3. Re-encrypt all tokens with new key
4. Test token refresh with new key
5. **Fallback:** Keep old key temporarily, add new key field, migrate gradually

---

## Monitoring & Alerting

### Health Checks

**Endpoint:** `GET /health`

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T10:30:00.000Z",
  "database": "connected",
  "lovable_ai": "reachable"
}
```

### Log Queries for Monitoring

**Recent Errors:**
```sql
SELECT 
  type,
  payload->>'error' as error_msg,
  COUNT(*) as count
FROM logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND payload->>'status' = 'error'
GROUP BY type, error_msg
ORDER BY count DESC;
```

**Webhook Success Rate:**
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE payload->>'status' = 'success') as success,
  COUNT(*) FILTER (WHERE payload->>'status' = 'error') as error,
  ROUND(100.0 * COUNT(*) FILTER (WHERE payload->>'status' = 'success') / COUNT(*), 2) as success_rate
FROM logs
WHERE type = 'webhook'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Reminder Delivery Performance:**
```sql
SELECT 
  AVG(EXTRACT(EPOCH FROM (last_attempt_ts - due_ts))/60) as avg_delay_minutes,
  MAX(EXTRACT(EPOCH FROM (last_attempt_ts - due_ts))/60) as max_delay_minutes,
  COUNT(*) as total_sent
FROM reminders
WHERE status = 'sent'
  AND last_attempt_ts > NOW() - INTERVAL '24 hours';
```

---

## Escalation Contacts

| Role | Contact | On-Call Hours |
|------|---------|---------------|
| Primary On-Call | TBD | 24/7 |
| Database Admin | TBD | Business hours |
| Security Lead | TBD | 24/7 |

---

## Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2025-11-02 | Initial runbook | Project launch | Team |

---

## Additional Resources

- [PRD.md](./PRD.md) - Product requirements
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [Lovable Cloud Docs](https://docs.lovable.dev/features/cloud)
- [Twilio WhatsApp API Docs](https://www.twilio.com/docs/whatsapp)
- [Google OAuth Troubleshooting](https://developers.google.com/identity/protocols/oauth2/troubleshooting)

# Privacy Policy
## Personal AI Executive Assistant

**Effective Date:** November 2, 2025  
**Last Updated:** November 2, 2025

---

## 1. Introduction

Welcome to Personal AI Executive Assistant ("we", "our", "the Service"). We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, store, and protect your information when you use our WhatsApp-based AI assistant.

---

## 2. Information We Collect

### 2.1 Information You Provide
- **Phone Number:** Your WhatsApp phone number (E.164 format)
- **Google Account Data:** Email address, name (via Google OAuth)
- **Messages:** Text and voice messages you send to the assistant
- **Calendar, Email, Tasks, Contacts:** Data you authorize us to access from Google Workspace

### 2.2 Information We Automatically Collect
- **Usage Data:** Message timestamps, intent types, interaction patterns
- **Technical Data:** Timezone, session information
- **Service Logs:** API calls, errors, performance metrics (with PII redaction)

### 2.3 Information from Third Parties
- **Google Workspace:** Calendar events, emails, tasks, contacts (with your explicit permission)
- **Twilio:** Message delivery status

---

## 3. How We Use Your Information

We use your data to:
- ✅ Process your requests (e.g., create reminders, read calendar)
- ✅ Provide proactive assistance (daily briefings, birthday reminders)
- ✅ Improve service quality and accuracy
- ✅ Maintain security and prevent abuse
- ✅ Comply with legal obligations

We **DO NOT**:
- ❌ Sell your data to third parties
- ❌ Use your data for advertising
- ❌ Share your data without your consent (except as required by law)
- ❌ Train AI models on your personal data

---

## 4. Data Storage & Security

### 4.1 Where We Store Data
- **Database:** Lovable Cloud (Supabase) - encrypted at rest
- **OAuth Tokens:** Encrypted using AES-256
- **Logs:** Structured logs with PII redaction, retained for 90 days

### 4.2 Security Measures
- ✅ HTTPS/TLS for all data in transit
- ✅ Webhook signature verification (Twilio HMAC)
- ✅ OAuth 2.0 with PKCE for authentication
- ✅ Token encryption at rest
- ✅ Row-level security on database
- ✅ Regular security audits

---

## 5. Data Retention

| Data Type | Retention Period | Reason |
|-----------|------------------|--------|
| Messages | 90 days | Service functionality, debugging |
| Reminders | Until sent or 30 days after due | Service functionality |
| OAuth Tokens | Until revoked by user | Service functionality |
| Logs | 90 days | Security, debugging |
| User Profile | Until account deletion | Service functionality |

---

## 6. Your Rights

You have the right to:

### 6.1 Access Your Data
Request a copy of all data we hold about you.  
**How:** Visit `/privacy` and click "Export Data"

### 6.2 Delete Your Data
Request deletion of all your data.  
**How:** Visit `/privacy` and click "Delete My Account"  
**Effect:** All data (messages, reminders, tokens) will be permanently deleted within 30 days.

### 6.3 Revoke Permissions
Revoke Google Workspace access at any time.  
**How:** Visit `/settings` and disconnect your Google account, or revoke access in [Google Account Permissions](https://myaccount.google.com/permissions)

### 6.4 Correct Your Data
Update your timezone or other profile settings.  
**How:** Via WhatsApp or in `/settings`

---

## 7. Third-Party Services

We integrate with:

### 7.1 Twilio (WhatsApp API)
- **Purpose:** Send and receive WhatsApp messages
- **Data Shared:** Phone number, message content
- **Privacy Policy:** [https://www.twilio.com/legal/privacy](https://www.twilio.com/legal/privacy)

### 7.2 Google Workspace
- **Purpose:** Access calendar, email, tasks, contacts
- **Data Shared:** Access tokens (with least-privilege scopes)
- **Privacy Policy:** [https://policies.google.com/privacy](https://policies.google.com/privacy)

### 7.3 Lovable AI
- **Purpose:** Natural language understanding, transcription
- **Data Shared:** Message content (transient, not stored by Lovable AI)
- **Privacy Policy:** [https://docs.lovable.dev/privacy](https://docs.lovable.dev/privacy)

---

## 8. Data Sharing & Disclosure

We may disclose your information:
- **With Your Consent:** When you explicitly authorize sharing
- **Legal Compliance:** If required by law, court order, or government request
- **Service Providers:** Twilio, Google, Lovable Cloud (under strict data processing agreements)
- **Safety & Security:** To prevent fraud, abuse, or security threats

We will **notify you** of any legal disclosure request unless prohibited by law.

---

## 9. Children's Privacy

The Service is not intended for users under 13 years old. We do not knowingly collect data from children. If we become aware of such data, we will delete it immediately.

---

## 10. International Data Transfers

Your data may be processed in countries where our service providers operate (primarily US and EU). We ensure adequate safeguards (e.g., standard contractual clauses) for international transfers.

---

## 11. Changes to This Policy

We may update this policy periodically. We will notify you of significant changes via WhatsApp. Continued use after changes constitutes acceptance.

---

## 12. Contact Us

For privacy questions or requests:

**Email:** privacy@yourapp.com  
**WhatsApp:** Send "privacy" to the assistant  
**Mail:** [Your company address]

**Data Protection Officer:** [If applicable for GDPR]

---

## 13. Cookies & Tracking

The web dashboard (`/dashboard`, `/settings`) uses:
- **Essential Cookies:** For authentication (session cookies)
- **NO** third-party tracking or analytics cookies

---

## 14. Compliance

We comply with:
- **GDPR** (EU General Data Protection Regulation)
- **CCPA** (California Consumer Privacy Act)
- **PIPEDA** (Personal Information Protection and Electronic Documents Act, Canada)
- **IT Act 2000** (India Information Technology Act)

---

## 15. Data Breach Notification

In the event of a data breach, we will:
1. Investigate within 24 hours
2. Notify affected users within 72 hours
3. Report to relevant authorities as required by law
4. Provide remediation steps

---

**Last Reviewed:** November 2, 2025  
**Version:** 1.0

# Feature Backlog - Nice-to-Have Improvements

## Email & Contacts Polish
- **Email Reuse Heuristics**: Improve "Email X again" to always reuse last_email_recipient without fresh lookup
- **Contact Disambiguation Memory**: Remember which "Rohan" user typically emails and auto-select
- **Email Thread Tracking**: Maintain conversation context across multiple emails with same contact

## Document Q&A Enhancements
- **Format Adherence Edge Cases**: Further improve strict adherence to user format instructions (e.g., "1 line each")
- **Citation Control**: Add user preference for including/excluding document citations
- **Multi-Document Q&A**: Answer questions across multiple uploaded documents

## Reminder Improvements
- **Recurring Reminders**: Support weekly/monthly recurring patterns
- **Smart Snooze Suggestions**: Offer context-aware snooze times (e.g., "next business day")
- **Location-Based Reminders**: Trigger when user arrives at specific location

## Calendar Enhancements
- **Natural Language Updates**: "Move meeting 1 hour later" without specifying exact time
- **Meeting Conflict Detection**: Warn when scheduling overlapping events
- **Calendar Sync Status**: Show when last synced with Google Calendar

## Task Management
- **Task Prioritization**: Support priority levels (high/medium/low)
- **Task Dependencies**: Link related tasks
- **Task Templates**: Create recurring task templates

## Voice & Transcription
- **Voice Command Shortcuts**: Dedicated voice commands for common actions
- **Speaker Identification**: Distinguish between multiple speakers in voice messages
- **Transcription Confidence Score**: Show when transcription might be inaccurate

## Web Search & Scraping
- **Search Result Caching**: Cache frequent searches (e.g., weather for same city)
- **Custom Search Sources**: Let user configure preferred news/data sources
- **Search History**: "What was that article you showed me yesterday?"

## Performance & Reliability
- **Retry Logic with Backoff**: Handle 429/503 from external APIs gracefully
- **Request Timeouts**: Clear error messages when operations exceed time limits
- **Offline Mode Indicators**: Tell user when external services are unavailable

## Analytics & Insights
- **Usage Analytics**: Show user their most common commands
- **Time Saved Metrics**: Estimate time saved by automation
- **Personalization Learning**: Adapt responses based on user preferences over time

## Security & Privacy
- **Data Export**: Let user export all their data
- **Selective Data Deletion**: Delete specific conversations or documents
- **End-to-End Encryption**: Explore E2E encryption for sensitive documents

## Integration Expansions
- **Slack Integration**: Post updates to Slack channels
- **Notion Integration**: Sync tasks/notes with Notion
- **Microsoft 365 Support**: Alternative to Google Workspace
- **Calendar App Integration**: iCal/Outlook support

---

**Note**: These are not blocking MVP completion. They represent future value adds based on user feedback and usage patterns.

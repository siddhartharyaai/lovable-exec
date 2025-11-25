# Tasks Reliability Patch - Implementation Summary

## Problem Statement
Tasks experience had three critical issues:
1. **Partial list display**: Only showed 5 tasks despite knowing 20 existed
2. **No way to see full list**: User couldn't access remaining tasks even when explicitly requesting
3. **NL misinterpretation**: "balance tasks" / "remaining tasks" routed to financial queries instead of task operations
4. **Duplicate handling**: "Both" keyword not supported when completing duplicate task titles

## Solution Implemented

### 1. Backend Changes (`handle-tasks/index.ts`)

#### Task Snapshot Storage
- Modified `read` action to fetch up to 50 tasks per list using pagination (`nextPageToken`)
- Added `read_all` action variant for showing complete list in one message
- Stores full task list in `session_state.tasks_snapshot`:
```json
{
  "list": [
    {
      "index": 1,
      "id": "task-abc123",
      "listId": "list-xyz",
      "listName": "Default List",
      "title": "Task title",
      "due": "2025-11-25T00:00:00Z",
      "notes": "Optional notes",
      "updated": "2025-11-21T10:00:00Z"
    }
  ],
  "timestamp": "2025-11-21T10:00:00Z"
}
```

#### Numbered Task References
- Added support for `taskIndex` parameter in `complete` action
- When user says "remove 4", system looks up task with `index: 4` in snapshot
- Deterministic completion using stored snapshot (no re-fetching from Google Tasks)

#### Duplicate Handling Improvements
- Stores disambiguation state in `session_state.pending_disambiguation`
- When multiple tasks match, shows numbered list with details (due date, list name)
- Added support for `completeBoth` parameter
- When user replies "both", completes all pending matches

#### Smart List Display
- Shows first 10 tasks by default (not 5)
- Includes clear message: "...and 15 more tasks. Reply 'show me all tasks' or 'show me the rest' to see the full list."
- Support for `show_rest` to display tasks 11+
- Support for `show_all` to display complete list

### 2. AI Agent Changes (`ai-agent/index.ts`)

#### Tool Definition Updates
**`read_tasks` tool:**
- Updated description to mention snapshot storage
- Added `show_all` parameter (boolean) for full list display
- Added `show_rest` parameter (boolean) for tasks 11 onwards

**`complete_task` tool:**
- Added `task_index` parameter (number) for numbered references
- Added `complete_both` parameter (boolean) for duplicate completion
- Made `task_title` optional when using `task_index`

#### System Prompt Enhancements
Added explicit NL interpretation rules for tasks:
```
TASKS NATURAL LANGUAGE (CRITICAL):
- When user says "balance tasks", "remaining tasks", "rest of tasks", "the other X tasks", "show me the 15 more tasks":
  → These are TASK-RELATED, NOT financial/banking queries
  → Call read_tasks with show_rest=true to show tasks 11+ from stored snapshot
- When user says "show all tasks", "full list", "complete list":
  → Call read_tasks with show_all=true
- When user says "remove 4" or "complete task 4":
  → Call complete_task with task_index=4 (uses stored snapshot, NOT title matching)
- When user replies "both" after task disambiguation:
  → Call complete_task with complete_both=true
- NEVER route "balance tasks" to web_search or financial queries
```

### 3. Database Migration

Added two new columns to `session_state` table:
- `tasks_snapshot` (JSONB): Stores snapshot of user tasks with indices
- `pending_disambiguation` (JSONB): Stores task matches when disambiguation is needed

### 4. Tests (`tests/backend_validation.test.ts`)

Added comprehensive test coverage for:
- **Snapshot storage**: Validates full task list storage with indices
- **Numbered references**: Tests completing task by index
- **Duplicate handling**: Tests disambiguation and "both" completion
- **NL interpretation**: Tests that "balance tasks" is recognized as task-related

## Files Modified

1. `supabase/functions/handle-tasks/index.ts` - Core task operations
2. `supabase/functions/ai-agent/index.ts` - Tool definitions and system prompt
3. `tests/backend_validation.test.ts` - Test coverage
4. Database migration for new session_state columns

## Usage Examples

### Initial List Request
**User:** "What tasks are pending"
**Response:**
```
✅ *Your Tasks* (20 pending)

*Default List*
1. Attend to documents that meet Tucker's requirements
2. Review CP editor software by Uptick
3. Review email parsing software by Lisa
4. Review Navio software platform
...
10. Submit expense report

...and 10 more tasks.
Reply "show me all tasks" or "show me the rest" to see the full list.
```

### Show Remaining Tasks
**User:** "Show me the balance pending tasks"
**AI:** Calls `read_tasks(show_rest=true)`
**Response:** Shows tasks 11-20 in numbered format

### Complete by Number
**User:** "Remove 4"
**AI:** Calls `complete_task(task_index=4)` using snapshot
**Response:** "✅ Task 4 completed: 'Review Navio software platform'"

### Duplicate Handling
**User:** "Remove 'Review email parsing software by Lisa'"
**AI:** Finds 2 matches, stores in `pending_disambiguation`
**Response:**
```
📋 I found **2 matching tasks** with that name:

1. **Review email parsing software by Lisa** (due Nov 25)
   _Default List_

2. **Review email parsing software by Lisa** (due Nov 28)
   _Default List_

Reply with "1", "2", or "both" to complete them.
```

**User:** "Both"
**AI:** Calls `complete_task(complete_both=true)`
**Response:** "✅ Completed 2 tasks: 'Review email parsing software by Lisa'"

## Backward Compatibility

✅ **No breaking changes to existing workflows:**
- Email flows unchanged
- Daily briefing unchanged
- Reminders unchanged
- Calendar operations unchanged

## Extending Task Cap

To increase the 50-task cap per list:
1. Edit `supabase/functions/handle-tasks/index.ts`
2. Find line: `if (tasksInList >= 50) {`
3. Change 50 to desired limit (e.g., 100)
4. Redeploy (automatic with code changes)

## Future Enhancements (Not in Scope)

- Multi-list task aggregation (currently per-list)
- Task priority/categorization in display
- Recurring task support
- Task search/filter within snapshot

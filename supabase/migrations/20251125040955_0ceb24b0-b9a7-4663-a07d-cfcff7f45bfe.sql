-- Add tasks_snapshot and pending_disambiguation columns to session_state table
-- tasks_snapshot stores the full list of tasks with indices for numbered references
-- pending_disambiguation stores task matches when multiple tasks have the same name

ALTER TABLE session_state
ADD COLUMN IF NOT EXISTS tasks_snapshot JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS pending_disambiguation JSONB DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN session_state.tasks_snapshot IS 'Stores snapshot of user tasks with indices for numbered task operations. Structure: {list: [{index, id, listId, listName, title, due, notes, updated}], timestamp}';
COMMENT ON COLUMN session_state.pending_disambiguation IS 'Stores task matches when disambiguation is needed. Structure: {action, matches: [{task, listId, listName}], timestamp}';
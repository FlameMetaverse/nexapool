-- Add baseline_user_id to indexer_state table
-- This marks the highest user ID at the time of "reset"
-- Only users with user_id > baseline_user_id will count for weekly leaderboard

ALTER TABLE indexer_state 
ADD COLUMN IF NOT EXISTS baseline_user_id INTEGER DEFAULT 0;

-- Set initial baseline to 0 (all users count until we run mark-current-users-as-baseline.js)
UPDATE indexer_state 
SET baseline_user_id = 0 
WHERE id = 1 AND baseline_user_id IS NULL;

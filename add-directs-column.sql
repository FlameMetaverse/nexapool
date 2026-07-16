-- Add directs column to user_stats table
ALTER TABLE user_stats
ADD COLUMN IF NOT EXISTS directs INTEGER DEFAULT 0;

-- Create index for sorting by directs (for weekly leaderboard)
CREATE INDEX IF NOT EXISTS idx_user_stats_directs ON user_stats(directs DESC);

-- Update comment
COMMENT ON COLUMN user_stats.directs IS 'Number of direct referrals (immediate downline)';

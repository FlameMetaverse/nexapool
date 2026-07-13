-- NexaPool Indexer Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)

-- User statistics table
CREATE TABLE IF NOT EXISTS user_stats (
  address TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  referrer_id INTEGER NOT NULL,
  total_team INTEGER DEFAULT 0,
  total_earned DECIMAL(20, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexer state table (tracks last processed block)
CREATE TABLE IF NOT EXISTS indexer_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_block INTEGER NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_team ON user_stats(total_team DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_earned ON user_stats(total_earned DESC);

-- Insert initial indexer state
INSERT INTO indexer_state (id, last_block, updated_at)
VALUES (1, 106346061, NOW())
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE indexer_state ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Allow public read access to user_stats"
  ON user_stats FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to indexer_state"
  ON indexer_state FOR SELECT
  USING (true);

-- Insert/Update policies (for backend service role only)
-- Note: Backend should use service_role key, not anon key
CREATE POLICY "Allow service role to insert/update user_stats"
  ON user_stats FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role to insert/update indexer_state"
  ON indexer_state FOR ALL
  USING (auth.role() = 'service_role');

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update timestamps
CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_indexer_state_updated_at
  BEFORE UPDATE ON indexer_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant access
GRANT SELECT ON user_stats TO anon, authenticated;
GRANT SELECT ON indexer_state TO anon, authenticated;
GRANT ALL ON user_stats TO service_role;
GRANT ALL ON indexer_state TO service_role;

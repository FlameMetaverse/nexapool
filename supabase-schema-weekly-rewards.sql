-- Weekly Referral Rewards Extension
-- Add this to your Supabase database

-- User registration events table (for weekly leaderboard)
CREATE TABLE IF NOT EXISTS user_registrations (
  id BIGSERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  referrer_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(transaction_hash, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_registrations_referrer_id ON user_registrations(referrer_id);
CREATE INDEX IF NOT EXISTS idx_user_registrations_block_timestamp ON user_registrations(block_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_registrations_user_address ON user_registrations(user_address);

-- Enable Row Level Security (RLS)
ALTER TABLE user_registrations ENABLE ROW LEVEL SECURITY;

-- Public read access policy
CREATE POLICY "Allow public read access to user_registrations"
  ON user_registrations FOR SELECT
  USING (true);

-- Insert policy (for backend service role only)
CREATE POLICY "Allow service role to insert user_registrations"
  ON user_registrations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Grant access
GRANT SELECT ON user_registrations TO anon, authenticated;
GRANT ALL ON user_registrations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE user_registrations_id_seq TO service_role;


# ✅ Weekly Leaderboard Fix - Complete

## Problem Identified
- Indexer state was set to block 834 (2015) instead of deployment block 44715765
- This caused 0 registrations to be indexed
- Direct referrals counting was not implemented

## Solutions Applied

### 1. Fixed Indexer State ✅
```bash
node fix-indexer-state.js
```
- Reset `last_block` to correct deployment block (44715765)

### 2. Added Direct Referrals Tracking ✅
Updated files:
- `src/processor.js` - Now calculates `directReferrals` count for each user
- `src/database.js` - Added `directs` parameter to `saveUserStats()`

### 3. Database Schema Update Required
Run this SQL in Supabase:
```sql
-- Add directs column
ALTER TABLE user_stats
ADD COLUMN IF NOT EXISTS directs INTEGER DEFAULT 0;

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_user_stats_directs ON user_stats(directs DESC);
```

Or run: `add-directs-column.sql` in Supabase SQL Editor

## How to Use

### Start the Indexer
```bash
cd backend
node src/index.js
```

The indexer will:
1. Fetch all `UserRegistered` events from block 44715765 to current
2. Calculate direct referrals for each user
3. Save to `user_registrations` table (for weekly tracking)
4. Save to `user_stats` table (with `directs` field)

### Check Weekly Leaderboard
```bash
node get-weekly-leaderboard.js
```

This shows:
- Top 10 users by direct referrals THIS WEEK
- Their total team (all time)
- Their direct referrals (all time)
- List of who they referred this week with timestamps

## Weekly Leaderboard Logic

**Simple & Direct:**
1. Query `user_registrations` table for current week (Sunday 00:00 UTC to now)
2. Count how many times each `referrer_id` appears
3. Sort by count (descending)
4. Top user = most direct referrals this week

**No complex calculations needed** - the contract already emits the `referrer_id` in the `UserRegistered` event!

## API Endpoint (Future)
Can easily add to `src/api.js`:
```javascript
app.get('/api/leaderboard/weekly', async (req, res) => {
  const weekStart = getWeekStart(); // Sunday 00:00 UTC
  
  const { data } = await supabase
    .from('user_registrations')
    .select('referrer_id')
    .gte('block_timestamp', weekStart);
  
  // Count and sort
  const counts = countByReferrer(data);
  res.json(counts);
});
```

## Next Steps
1. ✅ Run `add-directs-column.sql` in Supabase
2. ✅ Start indexer: `node src/index.js`
3. ⏳ Wait for sync (will take time for full historical data)
4. ✅ Check leaderboard: `node get-weekly-leaderboard.js`

## Notes
- Indexer processes in 5000-block chunks with retry logic
- Each chunk takes ~100ms delay to avoid rate limiting
- Full sync from block 44715765 to current (~65M blocks) will take time
- Weekly leaderboard works immediately once any data is indexed

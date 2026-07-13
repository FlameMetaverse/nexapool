# Setup Forward-Only Indexer

## Problem
The indexer is trying to sync 400,000+ historical blocks, which free RPCs reject with rate limits.

## Solution
Update the database to start from the CURRENT block (forward-only mode).

## Steps

### 1. Go to Supabase SQL Editor

1. Open your Supabase dashboard: https://supabase.com/dashboard/project/znapvpsvgitiwcgiozjb
2. Click **"SQL Editor"** in the left sidebar
3. Click **"+ New query"**

### 2. Run This SQL Command

Copy and paste this SQL:

```sql
UPDATE indexer_state 
SET last_block = (SELECT MAX(number) FROM eth.blocks WHERE chain = 'bsc')
WHERE id = 1;

-- Or manually set to current block number (check bscscan.com for latest block):
-- UPDATE indexer_state SET last_block = 106747500 WHERE id = 1;

-- Check the result:
SELECT * FROM indexer_state;
```

Click **"RUN"**

You should see the `last_block` updated to a recent block number (106747xxx or higher).

### 3. Start the Indexer

Now start the backend:

```powershell
cd C:\Users\Mekdashi\Desktop\autoboost\backend
npm run indexer
```

You should see:
```
📍 Current block: 106747xxx
📍 Last processed: 106747xxx
✅ Already up to date
```

This means it's in forward-only mode!

### 4. Keep Both Services Running

**Terminal 1** - API Server (already running):
```powershell
npm run api
```

**Terminal 2** - Indexer (tracks new events):
```powershell
npm run indexer
```

## How It Works

- **Before**: Indexer tries to sync from block 106,346,061 → fails with rate limits
- **After**: Indexer starts from block 106,747,xxx → only tracks NEW blocks (no rate limits!)

## Expected Behavior

### Initially
- Database is empty (no user stats)
- API returns 404 for users
- Frontend shows contract data only

### After New Activity
- When a NEW user registers → indexer catches it → adds to database
- When a NEW payment happens → indexer counts it → updates Total Earned
- Stats gradually build over time

### Timeline Example
- **Day 1**: Start indexer → tracks blocks 106,747,xxx to current
- **Day 2**: 50 new blocks → any new users/payments indexed
- **Week 1**: All recent activity tracked
- **Month 1**: Complete forward-looking data

## Testing

Test that both services are running:

```powershell
# Test API (should return OK)
curl http://localhost:3001/health

# Test stats (will be empty initially)
curl http://localhost:3001/api/stats/0x48e3bc95a32005447d80f5fcdc6438f965dc7168
```

## Troubleshooting

**Indexer still trying to sync old blocks?**
→ The SQL update didn't work. Manually set the block:
```sql
UPDATE indexer_state SET last_block = 106747500 WHERE id = 1;
```

**How do I know what the current block is?**
→ Visit https://bscscan.com/ and check the latest block number

**Can I backfill historical data later?**
→ Yes, if you get a paid RPC key, you can:
1. Stop the indexer
2. Set `last_block` back to 106346061
3. Update `BSC_RPC_URL` to paid endpoint
4. Run `npm run sync:full`

## Summary

✅ 100% FREE (works with free RPCs)
✅ No rate limits
✅ Tracks all future activity
❌ No historical data (only from now forward)

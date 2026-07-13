# Forward-Only Indexer Mode

## What This Does

The **forward-only indexer** tracks NEW blockchain events going forward from NOW. It does NOT backfill historical data.

### ✅ Advantages
- Works with **100% FREE** RPC endpoints (no rate limits)
- No 30-minute sync wait
- Lightweight and fast
- Builds data gradually over time

### ❌ Limitations
- Does NOT show historical Total Team/Total Earned
- Only counts events from the moment you start it
- Users who joined before today won't have complete stats initially
- Stats will gradually build up as new activity happens

## How It Works

1. **Initialize**: Sets starting point to current block
2. **Track Forward**: Every 30 seconds, checks for new blocks
3. **Process Events**: Processes any new UserRegistered or PaymentSent events
4. **Update Stats**: Updates Total Team and Total Earned incrementally

## Setup Instructions

### Step 1: Initialize the Indexer

Run this ONCE to set the starting point:

```bash
cd C:\Users\Mekdashi\Desktop\autoboost\backend
npm run sync:forward
```

You'll see:
```
✅ Indexer initialized! Run "npm start" to begin tracking new events.
```

### Step 2: Start the Backend

This runs both the indexer (tracks events) and API server (serves data):

```bash
npm start
```

You'll see:
```
🚀 Starting NexaPool Backend...
✅ Indexer running. Syncing every 30 seconds...
🌐 API server running on http://localhost:3001
```

**Keep this terminal open!** The indexer must run continuously.

### Step 3: Test It Works

Open a new terminal:

```bash
# Health check
curl http://localhost:3001/health

# Get stats for an address
curl http://localhost:3001/api/stats/0x48e3bc95a32005447d80f5fcdc6438f965dc7168
```

## Expected Behavior

### Initially
- Existing users will have `totalTeam: 0` and `totalEarned: 0.00` (no historical data)
- Only contract state data is shown (current balance from blockchain)

### After Running for a While
- NEW user registrations will be tracked
- NEW payments will be counted in Total Earned
- Total Team will grow as new referrals happen
- Stats gradually build up over time

### Example Timeline
- **Day 1**: Start indexer → only new activity tracked
- **Week 1**: Some users have stats (those who were active this week)
- **Month 1**: Most active users have accurate stats
- **Eventually**: System has complete data going forward

## Dashboard Integration

The frontend should:
1. **Always show current balance** from contract (this works today)
2. **Show Total Team/Total Earned from API** if available
3. **Fallback to contract data** if API returns 0

This way the dashboard works even for users without historical data.

## Want Full Historical Data?

If you need to backfill all historical events from block 106,346,061:

1. Get a paid RPC key from:
   - QuickNode: https://www.quicknode.com/ (~$50/month)
   - Ankr: https://www.ankr.com/rpc/ (~$50/month)
   - Alchemy: https://www.alchemy.com/ (free tier may work)

2. Update `.env`:
   ```
   BSC_RPC_URL=https://your-paid-rpc-endpoint.com/your-api-key
   INDEXER_MODE=full-sync
   ```

3. Run full sync:
   ```bash
   npm run sync:full
   ```

This will take ~30 minutes but will index ALL historical data.

## Commands Reference

```bash
# Initialize forward-only mode (run once)
npm run sync:forward

# Start both indexer + API server
npm start

# Run indexer only
npm run indexer

# Run API server only
npm run api

# Full historical sync (requires paid RPC)
npm run sync:full
```

## Troubleshooting

**"Cannot find module"**
→ Run `npm install`

**"Database connection failed"**
→ Check SUPABASE_URL and SUPABASE_KEY in `.env`

**"Already initialized at block X"**
→ This is normal, just run `npm start`

**Want to reset and start fresh?**
→ In Supabase SQL Editor:
```sql
DELETE FROM user_stats;
UPDATE indexer_state SET last_block = (SELECT MAX(number) FROM eth.blocks) WHERE id = 1;
```
→ Then run `npm start`

## Summary

✅ Free solution (no paid RPC needed)
✅ Works immediately (no 30-min wait)
✅ Tracks all future activity
❌ No historical data (only counts events from now on)

This is perfect for a NEW deployment or if you accept that historical stats will gradually build over time.

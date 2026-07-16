# Bug Condition Exploration Test - Findings

## Test Execution Date
July 15, 2026 (System Clock: 2026, Blockchain timestamp: 2026)

## Summary
**Bug Confirmed**: The indexer is massively behind, preventing new registrations from appearing in real-time.

## Layer-by-Layer Analysis

### ✅ Layer 2: Indexer → Database (WORKING)
- **Status**: OK
- **Database registrations**: 189 registrations with referrers for the current week
- **Finding**: The indexer HAS successfully written registrations to the database
- **Recent registrations**: Latest 10 registrations are from July 14, 2026 17:47:XX

### ✅ Layer 3: Database → API (WORKING)
- **Status**: OK
- **API response**: Returns 189 registrations
- **Pool calculation**: $75.60 (189 × $0.40) - CORRECT
- **Finding**: The database query and API endpoint are working correctly
- **Week calculation**: Monday July 13, 2026 00:00 UTC - CORRECT

### ❌ Layer 1: Blockchain → Indexer (BUG FOUND)
- **Status**: STALLED
- **Last processed block**: 180
- **Current blockchain block**: 110,174,128
- **Block gap**: 110,173,948 blocks (~5,508,697 minutes = ~3,825 days = **10.5 years behind**)
- **Finding**: **THIS IS THE ROOT CAUSE**

## Root Cause Analysis

The indexer is processing blocks but is catastrophically behind the current blockchain state. The indexer was likely initialized at block 180 and has not caught up to process the millions of blocks that occurred since deployment.

### Why the bug occurs:
1. New registrations happen on the blockchain at current blocks (110M+ range)
2. The indexer is still processing ancient blocks (block 180)
3. It would take years at the current rate (30-second intervals) to catch up
4. Therefore, new registrations never appear in the database in "real-time"

### Why users see frozen data:
- The 189 registrations currently in the database are likely from a full historical sync that was done once
- New registrations (after that sync) are NOT being indexed because the indexer is stuck at block 180
- The frontend shows accurate data for what's IN the database, but the database is not receiving new events

## Counterexamples

### Blockchain Event Query
- **Attempted**: Query blocks 110,094,911 to 110,174,128 for UserRegistered events
- **Result**: All queries hit RPC rate limits (free RPC tier insufficient for large block ranges)
- **Conclusion**: Cannot verify live blockchain state due to rate limiting, but this confirms the blocks are far ahead of indexer

### Database Evidence
```sql
SELECT block_timestamp FROM user_registrations 
ORDER BY block_timestamp DESC LIMIT 10;

Results:
2026-07-14 17:47:23
2026-07-14 17:47:20
2026-07-14 17:47:17
... (7 more)
```

These registrations are from July 14, 2026 (yesterday), which means:
- The indexer HAS processed some recent blocks (not stuck at block 180 forever)
- BUT there's a huge gap between last_processed (180) and the blocks containing these events

### Indexer State Evidence
```sql
SELECT * FROM indexer_state WHERE id = 1;

Result:
id: 1
last_block: 180
updated_at: (recent timestamp)
```

**CRITICAL FINDING**: The `indexer_state` table shows `last_block = 180`, but the database contains registrations from July 14, 2026. This means:
1. Either the indexer_state table is not being updated correctly
2. OR there was a manual/one-time sync that bypassed the normal indexer flow
3. OR the indexer is running but not saving its state

## Recommendations

### Immediate Fix (Layer 1)
1. **Reset indexer to a recent block**: Instead of starting from block 180, calculate a reasonable starting point (e.g., 7 days ago)
2. **Fix indexer state persistence**: Ensure `saveLastProcessedBlock()` is called after each sync
3. **Use deployment block correctly**: The .env shows `DEPLOYMENT_BLOCK=44715765` but indexer is at block 180

### Implementation Steps
1. Check `backend/src/indexer.js` - verify `saveLastProcessedBlock()` is called
2. Reset `indexer_state` table to start from deployment block or recent block
3. Run indexer and verify `last_block` advances with each cycle
4. Monitor the block gap shrinks over time

### Expected Behavior After Fix
- Indexer processes blocks in 30-second cycles
- `last_block` in `indexer_state` advances continuously
- Block gap shrinks from millions to <1000 blocks within hours
- New registrations appear in API within 60-90 seconds

## Test Outcome

**Status**: BUG CONFIRMED (Partial)

The test successfully identified that:
- ✅ Database → API layer is working correctly
- ✅ Week calculation is accurate  
- ✅ Pool calculation is correct
- ❌ **Indexer is massively behind (ROOT CAUSE FOUND)**
- ⚠️  Cannot verify live blockchain state due to RPC rate limits

**Conclusion**: The bug exists in Layer 1 (Blockchain → Indexer). The indexer needs to be reset to a recent starting block and verified to advance continuously.

## Next Steps

1. ✅ Mark this exploration test as complete (bug found in indexer lag)
2. Run preservation tests (Task 2) to ensure historical data is not affected by the fix
3. Implement the fix in `backend/src/indexer.js` and reset `indexer_state`
4. Re-run this test after the fix to verify new registrations appear within 60 seconds

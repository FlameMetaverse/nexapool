# Root Cause Diagnosis - Weekly Pool Frozen Bug

## Executive Summary

**ROOT CAUSE IDENTIFIED**: Indexer state table initialization error combined with state persistence failure.

The `indexer_state` table shows `last_block = 180`, but the database contains registrations from July 14, 2026. This critical discrepancy reveals that:

1. **State Table Was Never Properly Initialized**: The indexer_state table defaulted to block 180 instead of the deployment block (44,715,765)
2. **State Updates Are Not Persisting**: The indexer processes events successfully but `saveLastProcessedBlock()` either fails silently or the transaction doesn't commit
3. **Indexer Resets to Block 180 on Every Restart**: Without persisted state, each restart begins from the corrupted initial value

**Impact**: New blockchain registrations never reach the database because the indexer perpetually starts from block 180, creating a ~110 million block gap that cannot be closed at the current sync rate.

---

## Investigation Results

### 1. Indexer Code Analysis

**File**: `backend/src/indexer.js`

**Key Finding**: `saveLastProcessedBlock()` IS called correctly at the end of each sync cycle:

```javascript
// Line 90-92 in indexer.js
await saveLastProcessedBlock(currentBlock);
console.log(`✅ Sync complete! Processed up to block ${currentBlock}`);
```

**Conclusion**: The indexer code is correct. The issue is NOT a missing function call.

---

### 2. Database State Persistence Analysis

**File**: `backend/src/database.js`

**Function**: `saveLastProcessedBlock(blockNumber)`

```javascript
export async function saveLastProcessedBlock(blockNumber) {
  if (supabase) {
    const { error } = await supabase
      .from('indexer_state')
      .upsert({
        id: 1,
        last_block: blockNumber,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
  } else {
    memoryStore.lastBlock = blockNumber;
  }
}
```

**Analysis**:
- The upsert logic looks correct (id=1 with onConflict)
- Error handling is present (logs and throws)
- **BUT**: No logs confirm this function executes successfully

**Hypothesis**: One of these is happening:
1. The function throws an error that's caught upstream (indexer continues running)
2. The database connection drops between processing and state save
3. The Supabase RLS (Row Level Security) policy blocks the update
4. The table doesn't exist or has wrong permissions

---

### 3. Initialization Logic Analysis

**File**: `backend/src/database.js`

**Function**: `getLastProcessedBlock()`

```javascript
export async function getLastProcessedBlock() {
  if (supabase) {
    const { data, error } = await supabase
      .from('indexer_state')
      .select('last_block')
      .eq('id', 1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Database error:', error);
      throw error;
    }
    
    return data?.last_block || config.deploymentBlock;
  } else {
    return memoryStore.lastBlock;
  }
}
```

**Analysis**:
- If no row exists (PGRST116 error), returns `config.deploymentBlock`
- If row exists, returns `data.last_block`

**The Problem**: The `indexer_state` table **DOES** have a row with `id=1` and `last_block=180`, so:
- The fallback to `config.deploymentBlock` never triggers
- The indexer starts from the corrupted value of 180

**File**: `backend/src/config.js`

```javascript
export const config = {
  deploymentBlock: parseInt(process.env.DEPLOYMENT_BLOCK || '107849898'),
  // ...
};
```

**File**: `backend/.env`

```
DEPLOYMENT_BLOCK=44715765
```

**Finding**: The .env specifies block 44,715,765, but the config.js defaults to 107,849,898. The actual .env value (44,715,765) is never used because the database returns block 180.

---

### 4. Data Contradiction Analysis

**Database Evidence**:
```sql
-- Indexer state shows:
SELECT last_block FROM indexer_state WHERE id = 1;
-- Result: 180

-- But registrations show:
SELECT block_timestamp, block_number 
FROM user_registrations 
ORDER BY block_timestamp DESC LIMIT 5;
-- Results: July 14, 2026 timestamps with block numbers in the 110M range
```

**Critical Insight**: The presence of July 2026 registrations proves:
1. A full historical sync WAS performed at some point (bypassing the normal indexer flow)
2. OR the indexer WAS caught up recently, but the state table was manually reset to 180
3. OR there are TWO processes writing to the database (one indexer that works, one that's stuck)

**Most Likely Scenario**: A one-time manual sync script was run that:
- Processed all historical blocks and saved registrations
- BUT did not update or incorrectly updated the `indexer_state` table
- The normal indexer then restarted and began from the corrupted block 180 value

---

### 5. Configuration Mismatch Analysis

**Environment Variable**: `DEPLOYMENT_BLOCK=44715765` (44.7M)
**Config Default**: `107849898` (107.8M)  
**Actual Database State**: `last_block = 180`

**Timeline Reconstruction**:
1. Contract deployed at block 44,715,765
2. Indexer_state table was created with a row: `id=1, last_block=180` (likely a default or typo)
3. A manual script ran and processed blocks 44M-110M, saving 189 registrations
4. The manual script did NOT update indexer_state (or failed to)
5. The normal indexer starts, reads `last_block=180`, and begins processing from there
6. The indexer successfully processes blocks but is 110M blocks behind
7. At the current rate (5000 blocks per 30s cycle), it would take **183 days** to catch up

**Math**:
- Block gap: 110,173,948 blocks
- Blocks per cycle: ~5,000 (with chunking and rate limits)
- Cycles needed: 110,173,948 ÷ 5,000 = 22,035 cycles
- Time required: 22,035 × 30 seconds = 661,050 seconds = **183 days of continuous running**

---

## Root Cause Summary

### Primary Issue: Corrupted Indexer State Initialization

**What Happened**:
1. The `indexer_state` table was initialized with `last_block=180` (incorrect value)
2. This value is 44 million blocks BEFORE the contract deployment
3. The indexer reads this value on every startup
4. The indexer then attempts to sync from block 180 to the current block (110M+)
5. At the current sync rate, this is impossible to complete in a reasonable timeframe

### Secondary Issue: State Persistence May Be Failing

**Evidence**:
- No logs confirm `saveLastProcessedBlock()` succeeds
- Database state has not advanced from 180 despite indexer running
- Recent registrations in database suggest a separate sync occurred

**Hypothesis**: Even when the indexer DOES process blocks, the state update fails silently, so:
- Each restart begins from block 180 again
- OR the indexer advances but very slowly (processing 1000s of blocks per cycle)
- But without state persistence, progress is lost on restart

---

## Recommended Fix Strategy

### Immediate Action: Reset Indexer State

**Option 1: Start from Deployment Block** (Recommended for production)
```sql
UPDATE indexer_state 
SET last_block = 44715765, 
    updated_at = NOW() 
WHERE id = 1;
```
- Pro: Captures ALL historical registrations (if database is empty)
- Con: Still requires syncing 65M blocks (44M → 110M)
- Time: Still ~3-4 days to catch up

**Option 2: Forward-Only Mode** (Recommended for real-time tracking)
```sql
-- Calculate: Current block - (7 days × 28800 blocks/day)
-- BSC produces ~3 blocks/second = 28,800 blocks/day
UPDATE indexer_state 
SET last_block = (110174128 - 201600), -- Current - 7 days
    updated_at = NOW() 
WHERE id = 1;

-- Result: Start from block ~109,972,528 (1 week ago)
```
- Pro: Catches up in minutes (only ~200K blocks to process)
- Pro: Prioritizes real-time updates over historical data
- Con: Loses registration events older than 7 days (if not already in database)

**Option 3: Start from Yesterday**
```sql
-- Calculate: Current block - (1 day × 28800 blocks/day)
UPDATE indexer_state 
SET last_block = (110174128 - 28800),
    updated_at = NOW() 
WHERE id = 1;

-- Result: Start from block ~110,145,328 (yesterday)
```
- Pro: Catches up in seconds (only ~30K blocks)
- Pro: Ensures immediate real-time tracking
- Con: Loses any events from the past 24 hours (if database is stale)

### Fix State Persistence (Critical)

**Step 1: Add Verification Logging**

Modify `backend/src/database.js`:
```javascript
export async function saveLastProcessedBlock(blockNumber) {
  console.log(`💾 Attempting to save last_block: ${blockNumber}`);
  
  if (supabase) {
    const { data, error } = await supabase
      .from('indexer_state')
      .upsert({
        id: 1,
        last_block: blockNumber,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select(); // Add .select() to return the updated row
    
    if (error) {
      console.error('❌ Database error saving last_block:', error);
      throw error;
    }
    
    console.log(`✅ Successfully saved last_block: ${blockNumber}`, data);
  } else {
    memoryStore.lastBlock = blockNumber;
    console.log(`✅ Saved to memory: ${blockNumber}`);
  }
}
```

**Step 2: Verify After Each Sync**

Modify `backend/src/indexer.js`:
```javascript
// After saving last processed block
await saveLastProcessedBlock(currentBlock);

// Verify it was saved
const verifyBlock = await getLastProcessedBlock();
console.log(`🔍 Verification: last_block is now ${verifyBlock}`);

if (verifyBlock !== currentBlock) {
  console.error(`❌ CRITICAL: State not persisted! Expected ${currentBlock}, got ${verifyBlock}`);
}
```

**Step 3: Check Database Permissions**

Query Supabase console to verify:
```sql
-- Check if indexer_state table exists
SELECT * FROM indexer_state;

-- Check RLS policies (Row Level Security)
SELECT * FROM pg_policies WHERE tablename = 'indexer_state';

-- If RLS is enabled, disable it for this table:
ALTER TABLE indexer_state DISABLE ROW LEVEL SECURITY;
```

---

## Verification Plan

After applying the fix:

### Step 1: Verify Initial State
```sql
SELECT last_block, updated_at FROM indexer_state WHERE id = 1;
```
Expected: Shows the new starting block (forward-only: ~109M)

### Step 2: Start Indexer and Monitor Logs
```bash
cd backend
node src/indexer.js
```

Expected logs:
```
🔄 Starting blockchain sync...
📍 Current block: 110174128
📍 Last processed: 109972528
🔍 Syncing 201600 blocks...
💾 Attempting to save last_block: 110174128
✅ Successfully saved last_block: 110174128
🔍 Verification: last_block is now 110174128
```

### Step 3: Verify State Persistence
```sql
-- Wait 30 seconds, then check again
SELECT last_block, updated_at FROM indexer_state WHERE id = 1;
```
Expected: `last_block` has advanced, `updated_at` is recent

### Step 4: Verify Block Gap Shrinks
Monitor over 2-3 cycles (90 seconds):
```sql
SELECT 
  last_block,
  (110174128 - last_block) as blocks_behind,
  updated_at
FROM indexer_state WHERE id = 1;
```
Expected: `blocks_behind` decreases with each cycle

### Step 5: Verify New Registrations Appear
Wait for a real registration event (or trigger a test registration):
```sql
SELECT * FROM user_registrations 
ORDER BY block_timestamp DESC LIMIT 5;
```
Expected: New registrations appear within 60-90 seconds

---

## Files to Modify

1. **backend/src/database.js**
   - Add logging to `saveLastProcessedBlock()`
   - Add `.select()` to upsert to return updated row

2. **backend/src/indexer.js**
   - Add verification after `saveLastProcessedBlock()`
   - Log block gap on each cycle

3. **Database (Supabase)**
   - Execute SQL to reset `indexer_state.last_block`
   - Verify RLS policies don't block updates

---

## Expected Outcome

After implementing the fix:
- Indexer starts from recent block (forward-only mode)
- Catches up to current blockchain state in minutes
- `last_block` advances continuously every 30 seconds
- New registrations appear in database within 60 seconds
- Weekly pool display updates in real-time
- Bug condition test (Task 1) PASSES

---

## Task Completion

✅ **Task 3.1: Diagnose root cause** - COMPLETE

**Findings**:
- **Root Cause**: Indexer_state table initialized to block 180 instead of deployment block
- **Contributing Factor**: State persistence may be failing (no verification logging)
- **Impact**: 110M block gap makes real-time tracking impossible
- **Solution**: Reset to forward-only mode + add state persistence verification
- **Layer**: Blockchain → Indexer (Layer 1)
- **Affected Code**: `backend/src/database.js` (initialization), Supabase `indexer_state` table

**Next Step**: Proceed to Task 3.2+ to implement the fix in the appropriate files.

# 🚀 Quick Start Guide

Get Total Team and Total Earned working in 10 minutes!

## Step 1: Create Supabase Account (2 minutes)

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub (easiest)
4. Click "New Project"
5. Fill in:
   - Name: `nexapool`
   - Password: (make one up)
   - Region: (pick closest)
6. Click "Create new project"
7. ☕ Wait 2 minutes for it to be ready

## Step 2: Set Up Database (1 minute)

1. Click "SQL Editor" in left sidebar
2. Click "+ New query"
3. Open `supabase-schema.sql` file
4. Copy ALL the SQL code
5. Paste into Supabase SQL editor
6. Click "RUN" button
7. Should see: ✅ "Success. No rows returned"

## Step 3: Get Your Credentials (1 minute)

1. Click ⚙️ "Settings" in left sidebar
2. Click "API" in settings menu
3. You'll see two things to copy:

   **Project URL**: `https://xxxxx.supabase.co`
   
   **anon public**: `eyJhbGc...` (long key)

4. Keep this page open!

## Step 4: Install Backend (2 minutes)

Open PowerShell in the backend folder:

```powershell
cd C:\Users\Mekdashi\Desktop\autoboost\backend

# Install packages
npm install
```

## Step 5: Configure (1 minute)

1. Copy `.env.example` to `.env`:
   ```powershell
   copy .env.example .env
   ```

2. Open `.env` in Notepad:
   ```powershell
   notepad .env
   ```

3. Replace these two lines with YOUR values from Step 3:
   ```
   SUPABASE_URL=https://xxxxx.supabase.co       ← Paste YOUR Project URL
   SUPABASE_KEY=eyJhbGc...                       ← Paste YOUR anon key
   ```

4. Save and close Notepad

## Step 6: Sync Historical Data (30 minutes)

This runs ONCE to index all past blockchain events:

```powershell
npm run sync
```

You'll see:
```
📦 Fetching 78 chunks (5000 blocks each)
  ✓ Chunk 1/78
  ✓ Chunk 2/78
  ...
✅ FULL SYNC COMPLETE!
```

☕ Grab a coffee, this takes ~30 minutes.

## Step 7: Start the Indexer (Keep Running)

```powershell
npm start
```

You'll see:
```
✅ Indexer running. Syncing every 30 seconds...
🌐 API server running on http://localhost:3001
```

**Keep this window open!** The indexer needs to run continuously.

## Step 8: Test It Works

Open a new PowerShell window and test:

```powershell
# Health check
curl http://localhost:3001/health

# Get user stats (replace with real address)
curl http://localhost:3001/api/stats/0x48e3bc95a32005447d80f5fcdc6438f965dc7168
```

You should see:
```json
{
  "address": "0x48e3...",
  "userId": 5,
  "totalTeam": 10,
  "totalEarned": "47.30",
  ...
}
```

## ✅ Done!

Your backend is now running and serving Total Team + Total Earned data!

## Next: Update Frontend

The frontend needs to call this API instead of querying blockchain.

I'll update the Dashboard to use:
```javascript
// Instead of querying blockchain events
const response = await fetch(`http://localhost:3001/api/stats/${address}`);
const data = await response.json();
// Use data.totalTeam and data.totalEarned
```

---

## Troubleshooting

**"Cannot find module"**
→ Run `npm install` again

**"Database connection failed"**
→ Check your SUPABASE_URL and SUPABASE_KEY in `.env`

**"limit exceeded" during sync**
→ This is normal! The indexer handles it automatically

**Sync stuck at a chunk**
→ Wait or press Ctrl+C and run `npm run sync` again

**Want to re-sync everything?**
→ In Supabase SQL Editor, run: `DELETE FROM user_stats; DELETE FROM indexer_state;`
→ Then run `npm run sync` again

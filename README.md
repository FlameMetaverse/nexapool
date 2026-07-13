# NexaPool Backend Indexer

This backend service indexes blockchain events from the NexaPool contract and provides an API for the frontend to query Total Team and Total Earned statistics.

## Features

- ✅ Indexes UserRegistered and PaymentSent events
- ✅ Calculates Total Team (direct + indirect referrals)
- ✅ Calculates Total Earned (lifetime earnings from all sources)
- ✅ REST API for frontend queries
- ✅ Automatic periodic sync (every 30 seconds)
- ✅ Chunked event processing (no RPC rate limits)
- ✅ Works with free Supabase PostgreSQL database

## Setup Instructions

### 1. Create Supabase Project (FREE)

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - **Name**: nexapool-indexer
   - **Database Password**: (create a strong password)
   - **Region**: (choose closest to you)
4. Wait for project to be created (~2 minutes)

### 2. Set Up Database

1. In Supabase dashboard, click "SQL Editor" in left sidebar
2. Click "New Query"
3. Copy contents of `supabase-schema.sql` and paste
4. Click "Run" to execute the schema
5. You should see: "Success. No rows returned"

### 3. Get Supabase Credentials

1. In Supabase dashboard, click "Settings" (gear icon) → "API"
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (long string)

### 4. Configure Backend

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file:
   ```env
   BSC_RPC_URL=https://bsc-dataseed.binance.org/
   CONTRACT_ADDRESS=0x2353c8133e2cc7c5ee91a9fff4d38cec25e4fa5f
   DEPLOYMENT_BLOCK=106346061
   
   SUPABASE_URL=https://xxxxx.supabase.co  # <-- Paste your Project URL
   SUPABASE_KEY=eyJhbGc...                  # <-- Paste your anon key
   
   PORT=3001
   ```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run Initial Sync (ONE TIME)

This will sync all historical blockchain data from deployment to now (~30 minutes):

```bash
npm run sync
```

You'll see output like:
```
📦 Fetching 78 chunks (5000 blocks each)
  ✓ Chunk 1/78 (12 events so far)
  ✓ Chunk 10/78 (145 events so far)
  ...
✅ Found 523 UserRegistered events
✅ Found 1847 PaymentSent events
✅ FULL SYNC COMPLETE!
```

### 7. Start the Indexer (KEEP RUNNING)

```bash
npm start
```

This will:
- Keep syncing new blocks every 30 seconds
- Run continuously to keep data up-to-date

**Note**: Keep this running in a terminal or deploy to a server.

## API Endpoints

Once running, the API is available at `http://localhost:3001`:

### Get User Stats
```bash
GET /api/stats/:address

# Example
GET /api/stats/0x48e3bc95a32005447d80f5fcdc6438f965dc7168

# Response
{
  "address": "0x48e3bc95a32005447d80f5fcdc6438f965dc7168",
  "userId": 5,
  "referrerId": 1,
  "totalTeam": 10,
  "totalEarned": "47.30",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Get All Users
```bash
GET /api/stats

# Response
{
  "total": 523,
  "users": [
    {
      "address": "0x...",
      "userId": 1,
      "totalTeam": 45,
      "totalEarned": "1247.80"
    },
    ...
  ]
}
```

### Health Check
```bash
GET /health

# Response
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Deployment Options

### Option 1: Run on Your Computer

Just keep `npm start` running in a terminal.

### Option 2: Deploy to Railway (FREE)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your backend repo
5. Add environment variables from `.env`
6. Railway will auto-deploy and keep it running

**Free tier**: 500 hours/month ($5 credit, resets monthly)

### Option 3: Deploy to Render (FREE)

1. Go to https://render.com
2. Sign up with GitHub
3. Click "New" → "Background Worker"
4. Connect your repo
5. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Add environment variables
7. Deploy

**Free tier**: Unlimited (with some limits)

## Troubleshooting

### "limit exceeded" errors during sync

This is normal! The chunked approach handles this:
- Failed chunks are retried 3 times
- If still failing, they're skipped
- Sync continues with other chunks

### Sync takes too long

- Initial sync: ~30 minutes (387k blocks)
- Periodic syncs: ~5 seconds (only new blocks)

### Database connection errors

Check:
1. `SUPABASE_URL` is correct
2. `SUPABASE_KEY` is correct
3. Database schema was created successfully
4. Network connection is stable

### API returns 404 for all users

Run `npm run sync` first to populate the database.

## Project Structure

```
backend/
├── src/
│   ├── config.js       # Configuration and contract ABI
│   ├── database.js     # Supabase database operations
│   ├── processor.js    # Event processing logic
│   ├── indexer.js      # Main indexer (continuous sync)
│   ├── sync.js         # One-time full sync script
│   └── api.js          # REST API server
├── package.json
├── .env.example
├── .env                # Your credentials (git ignored)
├── supabase-schema.sql # Database schema
└── README.md
```

## Next Steps

After the backend is running:

1. Test the API:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:3001/api/stats/0x48e3bc95a32005447d80f5fcdc6438f965dc7168
   ```

2. Update the frontend to call this API instead of querying blockchain directly

3. Deploy backend to Railway/Render for production use

## Support

If you encounter issues:
1. Check logs for error messages
2. Verify Supabase credentials
3. Ensure contract address and deployment block are correct
4. Try running `npm run sync` again

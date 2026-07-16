# 🚀 Deploy Weekly Leaderboard to Production

The weekly leaderboard endpoint is **ready to deploy**. Here's how to get it live.

## What's Ready

✅ API endpoint: `/api/leaderboard/weekly-referrals`
✅ Fetches events from yesterday onwards
✅ Calculates weekly pool and rewards
✅ Works without database

## Deploy to Render (Recommended)

### Step 1: Push to GitHub

```bash
cd backend
git add .
git commit -m "Add weekly referral leaderboard endpoint"
git push
```

### Step 2: Deploy on Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Configure:
   - **Name**: `nexapool-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     ```
     BSC_RPC_URL=https://bsc-dataseed1.defibit.io/
     CONTRACT_ADDRESS=0x695E28B8d61F7211d16537B5055A180eaDEbad3E
     DEPLOYMENT_BLOCK=107849898
     PORT=3000
     SUPABASE_URL=(your supabase url)
     SUPABASE_KEY=(your supabase key)
     ```
5. Click **"Create Web Service"**

### Step 3: Wait for Deployment

- Takes 2-5 minutes
- You'll get a URL like: `https://nexapool-backend.onrender.com`

### Step 4: Test Production Endpoint

```bash
curl https://nexapool-backend.onrender.com/api/leaderboard/weekly-referrals
```

## Alternative: Deploy to Heroku

### Step 1: Install Heroku CLI

```bash
# If not installed
# Download from: https://devcenter.heroku.com/articles/heroku-cli
```

### Step 2: Deploy

```bash
cd backend
heroku login
heroku create nexapool-backend
git push heroku main

# Set environment variables
heroku config:set BSC_RPC_URL=https://bsc-dataseed1.defibit.io/
heroku config:set CONTRACT_ADDRESS=0x695E28B8d61F7211d16537B5055A180eaDEbad3E
heroku config:set DEPLOYMENT_BLOCK=107849898
heroku config:set SUPABASE_URL=(your url)
heroku config:set SUPABASE_KEY=(your key)
```

### Step 3: Test

```bash
curl https://nexapool-backend.herokuapp.com/api/leaderboard/weekly-referrals
```

## Update Frontend

Once deployed, update your frontend to use the production URL:

```javascript
// In your React component
const BACKEND_URL = 'https://nexapool-backend.onrender.com';

async function fetchWeeklyLeaderboard() {
  const response = await fetch(`${BACKEND_URL}/api/leaderboard/weekly-referrals`);
  const data = await response.json();
  return data;
}
```

## Expected Response

```json
{
  "timestamp": "2026-07-14T10:30:00.000Z",
  "weekStart": 1720915200,
  "weekStartReadable": "2024-07-13T00:00:00.000Z",
  "totalWeeklyRegistrations": 25,
  "weeklyPool": 10.00,
  "leaderboard": [
    {
      "rank": 1,
      "referrerId": 6,
      "referrerAddress": "0x...",
      "weeklyReferrals": 8,
      "estimatedReward": 2.00
    }
  ]
}
```

## Next Steps

1. **Deploy backend** (5 minutes)
2. **Test the endpoint** in browser
3. **Update frontend** to fetch from production URL
4. **Display leaderboard** in your UI

Need help with the frontend integration? Let me know! 🎉

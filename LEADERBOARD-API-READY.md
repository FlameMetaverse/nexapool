# ✅ Weekly Leaderboard API Endpoint Ready

## New Endpoint

**URL**: `GET /api/leaderboard/weekly-referrals`

**Description**: Reads UserRegistered events from the blockchain starting from **yesterday 00:00 UTC** and counts NEW referrals for this week only.

## Response Format

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
    },
    {
      "rank": 2,
      "referrerId": 123,
      "referrerAddress": "0x...",
      "weeklyReferrals": 5,
      "estimatedReward": 1.50
    }
    // ... up to top 100
  ]
}
```

## Reward Tiers (60% of pool to top 8)

- **Rank 1**: 20% of weekly pool
- **Rank 2**: 15% of weekly pool
- **Rank 3**: 10% of weekly pool
- **Rank 4**: 5% of weekly pool
- **Rank 5**: 4% of weekly pool
- **Rank 6**: 3% of weekly pool
- **Rank 7**: 2% of weekly pool
- **Rank 8**: 1% of weekly pool

Total: 60% distributed, 40% kept for operational costs.

## How to Test

1. **Start your backend**:
   ```bash
   cd backend
   npm start
   ```

2. **Test the endpoint**:
   - Open browser: http://localhost:3000/api/leaderboard/weekly-referrals
   - Or use curl:
     ```bash
     curl http://localhost:3000/api/leaderboard/weekly-referrals
     ```

3. **Frontend integration**:
   ```javascript
   // In your frontend React component
   async function fetchWeeklyLeaderboard() {
     const response = await fetch('https://your-backend.onrender.com/api/leaderboard/weekly-referrals');
     const data = await response.json();
     
     console.log(`Weekly pool: $${data.weeklyPool}`);
     console.log(`Top referrer has ${data.leaderboard[0].weeklyReferrals} referrals this week`);
     
     return data;
   }
   ```

## Performance Notes

- Takes ~10-30 seconds to fetch events from yesterday onwards
- Much faster than all-time leaderboard (only scans recent blocks)
- Weekly pool = total registrations × $0.40
- Resets every day at 00:00 UTC (yesterday becomes the new start)

## Available Endpoints

1. **`/api/leaderboard/weekly-referrals`** - **THIS WEEK** (from yesterday) ✨ NEW
2. **`/api/leaderboard/direct-referrals`** - All-time totals (slower, ~1-2 min)
3. **`/api/referrals/weekly-leaderboard`** - Database version (requires indexer)

## Next Steps

### Deploy to Production
1. Deploy backend to Render/Heroku
2. Update frontend to call this endpoint
3. Display weekly leaderboard with countdown timer

### Add Caching (Optional)
- Cache results for 10 minutes
- Background refresh every 10 minutes
- Instant response for users

Want me to add caching? 🚀


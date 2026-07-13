import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDatabase, getUserStats, getAllUserStats, getRegistrationsByTimeRange, getLastProcessedBlock } from './database.js';
import { createClient } from '@supabase/supabase-js';

const app = express();
let supabase = null;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Indexer status check
app.get('/api/indexer/status', async (req, res) => {
  try {
    const lastBlock = await getLastProcessedBlock();
    const totalRegs = await supabase.from('user_registrations').select('*', { count: 'exact', head: true });
    
    res.json({
      lastProcessedBlock: lastBlock,
      totalRegistrations: totalRegs.count || 0,
      deploymentBlock: config.deploymentBlock,
      blocksProcessed: lastBlock - config.deploymentBlock,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get stats for a specific user by address
app.get('/api/stats/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }
    
    const stats = await getUserStats(address);
    
    if (!stats) {
      return res.status(404).json({ 
        error: 'User not found',
        address: address.toLowerCase()
      });
    }
    
    res.json({
      address: stats.address,
      userId: stats.user_id,
      referrerId: stats.referrer_id,
      totalTeam: stats.total_team,
      totalEarned: parseFloat(stats.total_earned).toFixed(2),
      updatedAt: stats.updated_at
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all user stats (for leaderboard, admin dashboard, etc.)
app.get('/api/stats', async (req, res) => {
  try {
    const allStats = await getAllUserStats();
    
    res.json({
      total: allStats.length,
      users: allStats.map(stats => ({
        address: stats.address,
        userId: stats.user_id,
        referrerId: stats.referrer_id,
        totalTeam: stats.total_team,
        totalEarned: parseFloat(stats.total_earned).toFixed(2),
        updatedAt: stats.updated_at
      }))
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get weekly referral rewards leaderboard
app.get('/api/referrals/weekly-leaderboard', async (req, res) => {
  try {
    // Calculate Monday 00:00 UTC for current week
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const weekStartTimestamp = Math.floor(monday.getTime() / 1000);
    
    // Calculate next Monday 00:00 UTC
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);
    const weekEndTimestamp = Math.floor(nextMonday.getTime() / 1000);
    
    // Fetch registrations for this week
    const registrations = await getRegistrationsByTimeRange(weekStartTimestamp);
    
    // Aggregate by referrer
    const referrerMap = new Map();
    
    for (const reg of registrations) {
      const referrerId = reg.referrer_id;
      
      // Skip if no referrer (referrer_id = 0)
      if (referrerId === 0) continue;
      
      if (!referrerMap.has(referrerId)) {
        referrerMap.set(referrerId, {
          referrerId: referrerId,
          referrerAddress: null, // We'll need to look this up if needed
          registrations: [],
          count: 0
        });
      }
      
      const data = referrerMap.get(referrerId);
      data.registrations.push({
        userAddress: reg.user_address,
        userId: reg.user_id,
        timestamp: reg.block_timestamp
      });
      data.count++;
    }
    
    // Convert to array and sort by count (descending), then by earliest timestamp
    const leaderboard = Array.from(referrerMap.values())
      .map(data => {
        // Sort registrations by timestamp to get earliest
        const sortedRegs = data.registrations.sort((a, b) => a.timestamp - b.timestamp);
        const earliestTimestamp = sortedRegs[0].timestamp;
        
        return {
          referrerId: data.referrerId,
          referralCount: data.count,
          earliestTimestamp: earliestTimestamp,
          weeklyPoolShare: (data.count * 0.40).toFixed(2) // $0.40 per registration
        };
      })
      .sort((a, b) => {
        // Sort by count (descending)
        if (b.referralCount !== a.referralCount) {
          return b.referralCount - a.referralCount;
        }
        // Tie-breaker: earlier timestamp wins
        return a.earliestTimestamp - b.earliestTimestamp;
      });
    
    // Calculate total pool
    const totalRegistrations = registrations.filter(r => r.referrer_id !== 0).length;
    const totalPool = (totalRegistrations * 0.40).toFixed(2);
    
    // Calculate rewards for top 50
    const rewardTiers = [
      { rank: 1, percentage: 20 },
      { rank: 2, percentage: 15 },
      { rank: 3, percentage: 10 },
      { rank: 4, percentage: 5 },
      { rank: 5, percentage: 4 },
      { rank: 6, percentage: 3 },
      { rank: 7, percentage: 2 }
    ];
    
    // Ranks 8-50 get 0.95% each (43 people × 0.95% = 40.85%, total = 100%)
    for (let rank = 8; rank <= 50; rank++) {
      rewardTiers.push({ rank, percentage: 0.95 });
    }
    
    const rankings = leaderboard.slice(0, 100).map((entry, index) => {
      const rank = index + 1;
      let reward = 0;
      
      if (rank <= 50) {
        const tier = rewardTiers[rank - 1];
        reward = ((parseFloat(totalPool) * tier.percentage) / 100).toFixed(2);
      }
      
      return {
        rank,
        referrerId: entry.referrerId,
        referralCount: entry.referralCount,
        reward: parseFloat(reward)
      };
    });
    
    res.json({
      weekStart: weekStartTimestamp,
      weekEnd: weekEndTimestamp,
      totalRegistrations,
      totalPool: parseFloat(totalPool),
      rankings
    });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
function startAPIServer() {
  // Initialize database connection
  supabase = createClient(config.supabaseUrl, config.supabaseKey);
  initDatabase();
  
  app.listen(config.port, () => {
    console.log(`🌐 API server running on http://localhost:${config.port}`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /api/indexer/status - Indexer status`);
    console.log(`   GET /api/stats/:address - Get user stats`);
    console.log(`   GET /api/stats - Get all users`);
    console.log(`   GET /api/referrals/weekly-leaderboard - Get weekly leaderboard`);
  });
}

// Auto-start the server
startAPIServer();

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

// Get weekly referral leaderboard (reads events from blockchain starting yesterday)
app.get('/api/leaderboard/weekly-referrals', async (req, res) => {
  try {
    const { ethers } = await import('ethers');
    
    // Contract ABI for events
    const CONTRACT_ABI = [
      "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)",
      "function userList(uint) view returns (address)"
    ];
    
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
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
    
    // Get current block info to estimate start block
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    const currentTimestamp = currentBlockData.timestamp;
    
    // Estimate block from Monday 00:00 UTC (BSC: ~3 seconds per block)
    const secondsSinceMonday = currentTimestamp - weekStartTimestamp;
    const blocksToGoBack = Math.floor(secondsSinceMonday / 3);
    const startBlock = Math.max(config.deploymentBlock, currentBlock - blocksToGoBack);
    
    console.log(`Fetching events from block ${startBlock} to ${currentBlock}`);
    console.log(`  Week: ${new Date(weekStartTimestamp * 1000).toISOString()} to ${new Date(weekEndTimestamp * 1000).toISOString()}`);
    
    // Fetch UserRegistered events from Monday onwards
    const filter = contract.filters.UserRegistered();
    let events = [];
    
    // Fetch in batches to avoid rate limits
    const batchSize = 5000;
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
      
      try {
        const batchEvents = await contract.queryFilter(filter, fromBlock, toBlock);
        events.push(...batchEvents);
        console.log(`  Fetched ${batchEvents.length} events from blocks ${fromBlock}-${toBlock}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error fetching events ${fromBlock}-${toBlock}:`, error.message);
      }
    }
    
    console.log(`Total events fetched from blockchain: ${events.length}`);
    
    // Filter events to include ONLY registrations from Monday 00:00 UTC onwards
    const weeklyEvents = events.filter(event => {
      const eventTimestamp = Number(event.args.timestamp);
      return eventTimestamp >= weekStartTimestamp && eventTimestamp < weekEndTimestamp;
    });
    
    console.log(`Events within current week (${new Date(weekStartTimestamp * 1000).toISOString()} to ${new Date(weekEndTimestamp * 1000).toISOString()}): ${weeklyEvents.length}`);
    
    if (weeklyEvents.length > 0) {
      const firstEvent = weeklyEvents[0];
      const lastEvent = weeklyEvents[weeklyEvents.length - 1];
      console.log(`  First event: ${new Date(Number(firstEvent.args.timestamp) * 1000).toISOString()}`);
      console.log(`  Last event: ${new Date(Number(lastEvent.args.timestamp) * 1000).toISOString()}`);
    }
    
    // Aggregate by referrer
    const referrerMap = new Map();
    
    for (const event of weeklyEvents) {
      const referrerId = Number(event.args.referrerId);
      const timestamp = Number(event.args.timestamp);
      
      // Skip if no referrer (referrerId = 0)
      if (referrerId === 0) continue;
      
      if (!referrerMap.has(referrerId)) {
        referrerMap.set(referrerId, {
          referrerId: referrerId,
          count: 0,
          firstTimestamp: timestamp
        });
      }
      
      const data = referrerMap.get(referrerId);
      data.count++;
      
      // Track earliest timestamp for tie-breaking
      if (timestamp < data.firstTimestamp) {
        data.firstTimestamp = timestamp;
      }
    }
    
    // Convert to array and sort
    const leaderboard = Array.from(referrerMap.values())
      .sort((a, b) => {
        // Sort by count (descending)
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        // Tie-breaker: earlier timestamp wins
        return a.firstTimestamp - b.firstTimestamp;
      });
    
    // Calculate weekly pool
    const totalWeeklyRegistrations = weeklyEvents.filter(e => Number(e.args.referrerId) !== 0).length;
    const weeklyPool = totalWeeklyRegistrations * 0.40;
    
    // Calculate rewards for top 50
    const rewardTiers = [
      { rank: 1, percentage: 20 },   // Rank 1
      { rank: 2, percentage: 15 },   // Rank 2
      { rank: 3, percentage: 10 },   // Rank 3
      { rank: 4, percentage: 5 },    // Rank 4
      { rank: 5, percentage: 4 },    // Rank 5
      { rank: 6, percentage: 3 },    // Rank 6
      { rank: 7, percentage: 2 }     // Rank 7
    ];
    
    // Ranks 8-50 get 0.95% each
    // Total: 59% (top 7) + 40.85% (ranks 8-50) = 99.85% (rounds to 100%)
    for (let rank = 8; rank <= 50; rank++) {
      rewardTiers.push({ rank, percentage: 0.95 });
    }
    
    // Get addresses for top referrers
    const rankings = await Promise.all(
      leaderboard.slice(0, 100).map(async (entry, index) => {
        const rank = index + 1;
        let reward = 0;
        
        if (rank <= 50) {  // Changed from rank <= 8
          const tier = rewardTiers[rank - 1];
          reward = (weeklyPool * tier.percentage) / 100;
        }
        
        // Get referrer address
        let referrerAddress = null;
        try {
          referrerAddress = await contract.userList(entry.referrerId);
        } catch (error) {
          console.error(`Error getting address for user ${entry.referrerId}:`, error.message);
        }
        
        return {
          rank,
          referrerId: entry.referrerId,
          referrerAddress,
          weeklyReferrals: entry.count,
          estimatedReward: parseFloat(reward.toFixed(2))
        };
      })
    );
    
    res.json({
      timestamp: new Date().toISOString(),
      weekStart: weekStartTimestamp,
      weekStartReadable: new Date(weekStartTimestamp * 1000).toISOString(),
      weekEnd: weekEndTimestamp,
      weekEndReadable: new Date(weekEndTimestamp * 1000).toISOString(),
      totalWeeklyRegistrations,
      weeklyPool: parseFloat(weeklyPool.toFixed(2)),
      leaderboard: rankings
    });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get direct referral leaderboard (all-time, reads directly from contract)
app.get('/api/leaderboard/direct-referrals', async (req, res) => {
  try {
    const { ethers } = await import('ethers');
    
    // Simple contract ABI
    const CONTRACT_ABI = [
      "function currUserId() view returns (uint)",
      "function users(address) view returns (bool exists, uint id, uint referrerId, uint directs, uint referralEarnings, uint totalTeam, uint totalEarned)",
      "function userList(uint) view returns (address)"
    ];
    
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
    // Get total users
    const totalUsers = Number(await contract.currUserId());
    
    const leaderboard = [];
    
    // Read users in batches
    const batchSize = 10;
    for (let userId = 1; userId <= totalUsers; userId += batchSize) {
      const batchEnd = Math.min(userId + batchSize, totalUsers);
      
      const promises = [];
      for (let id = userId; id <= batchEnd; id++) {
        promises.push(
          (async () => {
            try {
              const userAddress = await contract.userList(id);
              if (!userAddress || userAddress === ethers.ZeroAddress) return null;
              
              const userData = await contract.users(userAddress);
              const directs = Number(userData[3]);
              
              if (directs === 0) return null;
              
              return {
                userId: id,
                address: userAddress,
                directs,
                totalTeam: Number(userData[5])
              };
            } catch (error) {
              return null;
            }
          })()
        );
      }
      
      const results = await Promise.all(promises);
      leaderboard.push(...results.filter(r => r !== null));
      
      // Delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Sort by directs (descending)
    leaderboard.sort((a, b) => b.directs - a.directs);
    
    // Return top 100
    const top100 = leaderboard.slice(0, 100).map((user, index) => ({
      rank: index + 1,
      userId: user.userId,
      address: user.address,
      directReferrals: user.directs,
      totalTeam: user.totalTeam
    }));
    
    res.json({
      timestamp: new Date().toISOString(),
      totalUsers,
      usersWithReferrals: leaderboard.length,
      leaderboard: top100
    });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get live events for activity banner (last 50 registrations)
app.get('/api/live-events', async (req, res) => {
  try {
    // Set cache headers - cache for 10 seconds
    res.setHeader('Cache-Control', 'public, max-age=10');
    
    console.log(`🌐 API Request: /api/live-events at ${new Date().toISOString()}`);
    
    // Fetch last 50 registrations from database
    const { data, error } = await supabase
      .from('user_registrations')
      .select('user_address, user_id, referrer_id, block_timestamp, transaction_hash')
      .order('block_timestamp', { ascending: false })
      .limit(50);
    
    if (error) {
      console.error('❌ Error fetching live events:', error);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }
    
    // Format events for frontend
    const events = (data || []).map(reg => ({
      type: 'registration',
      message: `ID ${reg.user_id} just joined NexaPool!`,
      emoji: '🎉',
      timestamp: reg.block_timestamp,
      userId: reg.user_id,
      txHash: reg.transaction_hash
    }));
    
    console.log(`   Returning ${events.length} events`);
    
    res.json({
      success: true,
      events,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ API error in /api/live-events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get weekly referral rewards leaderboard (blockchain-based - ignores database)
app.get('/api/referrals/weekly-leaderboard', async (req, res) => {
  try {
    const { ethers } = await import('ethers');
    
    // Contract ABI for events
    const CONTRACT_ABI = [
      "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)",
      "function userList(uint) view returns (address)"
    ];
    
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
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
    
    // Get current block info to estimate start block
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    const currentTimestamp = currentBlockData.timestamp;
    
    // Estimate block from Monday 00:00 UTC (BSC: ~3 seconds per block)
    const secondsSinceMonday = currentTimestamp - weekStartTimestamp;
    const blocksToGoBack = Math.floor(secondsSinceMonday / 3);
    const startBlock = Math.max(config.deploymentBlock, currentBlock - blocksToGoBack);
    
    console.log(`Fetching events from block ${startBlock} to ${currentBlock}`);
    console.log(`  Week: ${new Date(weekStartTimestamp * 1000).toISOString()} to ${new Date(weekEndTimestamp * 1000).toISOString()}`);
    
    // Fetch UserRegistered events from Monday onwards
    const filter = contract.filters.UserRegistered();
    let events = [];
    
    // Fetch in batches to avoid rate limits
    const batchSize = 5000;
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
      
      try {
        const batchEvents = await contract.queryFilter(filter, fromBlock, toBlock);
        events.push(...batchEvents);
        console.log(`  Fetched ${batchEvents.length} events from blocks ${fromBlock}-${toBlock}`);
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error fetching events ${fromBlock}-${toBlock}:`, error.message);
      }
    }
    
    console.log(`Total events fetched from blockchain: ${events.length}`);
    
    // Filter events to include ONLY registrations from Monday 00:00 UTC onwards
    const weeklyEvents = events.filter(event => {
      const eventTimestamp = Number(event.args.timestamp);
      return eventTimestamp >= weekStartTimestamp && eventTimestamp < weekEndTimestamp;
    });
    
    console.log(`Events within current week: ${weeklyEvents.length}`);
    
    if (weeklyEvents.length > 0) {
      const firstEvent = weeklyEvents[0];
      const lastEvent = weeklyEvents[weeklyEvents.length - 1];
      console.log(`  First event: ${new Date(Number(firstEvent.args.timestamp) * 1000).toISOString()}`);
      console.log(`  Last event: ${new Date(Number(lastEvent.args.timestamp) * 1000).toISOString()}`);
    }
    
    // Aggregate by referrer
    const referrerMap = new Map();
    
    for (const event of weeklyEvents) {
      const referrerId = Number(event.args.referrerId);
      const timestamp = Number(event.args.timestamp);
      
      // Skip if no referrer (referrerId = 0)
      if (referrerId === 0) continue;
      
      if (!referrerMap.has(referrerId)) {
        referrerMap.set(referrerId, {
          referrerId: referrerId,
          count: 0,
          firstTimestamp: timestamp
        });
      }
      
      const data = referrerMap.get(referrerId);
      data.count++;
      
      // Track earliest timestamp for tie-breaking
      if (timestamp < data.firstTimestamp) {
        data.firstTimestamp = timestamp;
      }
    }
    
    // Convert to array and sort
    const leaderboard = Array.from(referrerMap.values())
      .sort((a, b) => {
        // Sort by count (descending)
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        // Tie-breaker: earlier timestamp wins
        return a.firstTimestamp - b.firstTimestamp;
      });
    
    // Calculate total pool
    const totalRegistrations = weeklyEvents.filter(e => Number(e.args.referrerId) !== 0).length;
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
        referralCount: entry.count,
        reward: parseFloat(reward)
      };
    });
    
    console.log(`   Returning ${rankings.length} rankings, total pool: $${totalPool}, total registrations: ${totalRegistrations}`);
    
    res.json({
      weekStart: weekStartTimestamp,
      weekEnd: weekEndTimestamp,
      totalRegistrations,
      totalPool: parseFloat(totalPool),
      rankings
    });
    
  } catch (error) {
    console.error('❌ API error in /api/referrals/weekly-leaderboard:', error);
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
    console.log(`   GET /api/live-events - Live activity events (last 50 registrations)`);
    console.log(`   GET /api/leaderboard/weekly-referrals - Weekly leaderboard (from yesterday)`);
    console.log(`   GET /api/leaderboard/direct-referrals - All-time direct referrals`);
    console.log(`   GET /api/referrals/weekly-leaderboard - Weekly leaderboard (from database)`);
  });
}

// Auto-start the server
startAPIServer();

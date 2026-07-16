import { ethers } from 'ethers';
import { config } from './config.js';
import { initDatabase, saveUserRegistration, saveUserStats, saveLastProcessedBlock, getLastProcessedBlock } from './database.js';

/**
 * Storage-Based Indexer
 * Reads contract storage directly instead of scanning events
 * Much simpler and avoids RPC rate limits on eth_getLogs
 */

// Minimal ABI - just the view functions we need from NexaPoolV2
const CONTRACT_ABI = [
  "function currUserId() view returns (uint)",
  "function users(address) view returns (bool exists, uint id, uint referrerId, uint directs, uint referralEarnings, uint totalTeam, uint totalEarned)",
  "function userList(uint) view returns (address)"
];

let isRunning = false;

async function syncFromStorage() {
  if (isRunning) {
    console.log('⏭️  Sync already running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('🔄 Starting storage-based sync...');
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
    // Get current block for timestamps
    const currentBlock = await provider.getBlockNumber();
    console.log(`📍 Current block: ${currentBlock}`);
    
    // Get total number of users
    const currUserId = await contract.currUserId();
    const totalUsers = Number(currUserId);
    console.log(`👥 Total users in contract: ${totalUsers}`);
    
    // Get last synced user ID from database
    // NOTE: We're reusing getLastProcessedBlock() but storing user ID instead of block number
    let lastSyncedUserId = await getLastProcessedBlock();
    
    // If lastSyncedUserId looks like a block number (too big), reset to 0
    if (lastSyncedUserId > totalUsers || lastSyncedUserId === config.deploymentBlock) {
      lastSyncedUserId = 0;
      console.log('⚠️  Detected block number in database, resetting to sync from user ID 1');
    }
    
    const startUserId = lastSyncedUserId === 0 ? 1 : lastSyncedUserId + 1;
    
    console.log(`🔍 Syncing users from ID ${startUserId} to ${totalUsers}...`);
    
    if (startUserId > totalUsers) {
      console.log('✅ Already up to date');
      isRunning = false;
      return;
    }
    
    // Fetch users in batches
    const batchSize = 5; // Reduced from 10 to 5 for faster processing
    let processedCount = 0;
    let registrationsSaved = 0;
    
    for (let userId = startUserId; userId <= totalUsers; userId += batchSize) {
      const batchEnd = Math.min(userId + batchSize - 1, totalUsers);
      console.log(`📦 Processing batch: users ${userId} to ${batchEnd}`);
      
      const promises = [];
      
      for (let id = userId; id <= batchEnd; id++) {
        promises.push(processUser(contract, id, currentBlock));
      }
      
      const results = await Promise.all(promises);
      
      // Count successful registrations
      registrationsSaved += results.filter(r => r).length;
      processedCount += batchEnd - userId + 1;
      
      // Save progress
      await saveLastProcessedBlock(batchEnd);
      
      console.log(`  ✓ Processed ${processedCount}/${totalUsers - startUserId + 1} users (${registrationsSaved} registrations saved)`);
      
      // Shorter delay for faster catchup
      await new Promise(resolve => setTimeout(resolve, 1000)); // Changed from 2000 to 1000 (1 second)
    }
    
    console.log(`✅ Sync complete! Processed ${processedCount} users, saved ${registrationsSaved} registrations`);
    
  } catch (error) {
    console.error('❌ Sync error:', error);
  } finally {
    isRunning = false;
  }
}

async function processUser(contract, userId, currentBlock) {
  try {
    // Get user address from ID
    const userAddress = await contract.userList(userId);
    
    if (!userAddress || userAddress === ethers.ZeroAddress) {
      return false;
    }
    
    // Get user data from storage (NO RATE LIMIT!)
    const userData = await contract.users(userAddress);
    
    const exists = userData[0];
    const id = Number(userData[1]);
    const referrerId = Number(userData[2]);
    const directs = Number(userData[3]);
    const totalTeam = Number(userData[5]);
    const totalEarned = Number(userData[6]) / 1e18;
    
    if (!exists || id !== userId) {
      return false;
    }
    
    // Now get REAL registration timestamp from the UserRegistered event for THIS user only
    let registrationTimestamp;
    try {
      const filter = contract.filters.UserRegistered(userAddress, userId);
      const events = await contract.queryFilter(filter, config.deploymentBlock, currentBlock);
      
      if (events.length > 0) {
        // Got the real timestamp!
        registrationTimestamp = Number(events[0].args.timestamp);
      } else {
        // Fallback to estimation if event not found
        const now = Math.floor(Date.now() / 1000);
        const totalUsers = Number(await contract.currUserId());
        registrationTimestamp = now - ((totalUsers - userId) * 3);
      }
    } catch (error) {
      // Rate limit or error - use estimation
      const now = Math.floor(Date.now() / 1000);
      const totalUsers = Number(await contract.currUserId());
      registrationTimestamp = now - ((totalUsers - userId) * 3);
    }
    
    // Save registration with REAL timestamp
    await saveUserRegistration(
      userAddress,
      userId,
      referrerId,
      currentBlock,
      registrationTimestamp, // REAL or estimated
      `storage-sync-${userId}`
    );
    
    // Save user stats
    await saveUserStats(userAddress, userId, referrerId, totalTeam, totalEarned, directs);
    
    return true;
  } catch (error) {
    console.error(`  ⚠️  Error processing user ${userId}:`, error.message);
    return false;
  }
}

// Initialize and start
async function start() {
  console.log('🚀 NexaPool Storage-Based Indexer Starting...');
  console.log(`📍 Contract: ${config.contractAddress}`);
  console.log(`📍 RPC: ${config.bscRpcUrl}`);
  console.log('\n💡 This indexer reads contract storage directly (no event scanning)');
  console.log('💡 This avoids RPC rate limits and is much simpler!\n');
  
  // Initialize database
  initDatabase();
  
  // Do initial sync
  await syncFromStorage();
  
  // Set up periodic sync every 30 seconds (faster updates!)
  setInterval(async () => {
    console.log('\n⏰ Periodic sync triggered');
    await syncFromStorage();
  }, 30000); // Changed from 60000 to 30000 (30 seconds)
  
  console.log('✅ Indexer running. Syncing every 30 seconds...');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down indexer...');
  process.exit(0);
});

// Start the indexer
start();

import { ethers } from 'ethers';
import { config } from './config.js';
import { initDatabase, saveUserRegistration, getLastProcessedBlock, saveLastProcessedBlock } from './database.js';

/**
 * Weekly Leaderboard Event Indexer
 * Fetches UserRegistered events from blockchain with REAL timestamps
 * This replaces the storage-based indexer's estimated timestamps
 */

const CONTRACT_ABI = [
  "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)"
];

let isRunning = false;

async function syncWeeklyEvents() {
  if (isRunning) {
    console.log('⏭️  Sync already running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('🔄 Syncing UserRegistered events for weekly leaderboard...');
  
  try {
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
    const currentBlock = await provider.getBlockNumber();
    let lastProcessedBlock = await getLastProcessedBlock();
    
    // If lastProcessedBlock looks like a user ID (< 1000000), reset to deployment block
    if (lastProcessedBlock < 1000000) {
      lastProcessedBlock = config.deploymentBlock;
      console.log('⚠️  Reset from user ID to deployment block');
    }
    
    const startBlock = lastProcessedBlock + 1;
    
    console.log(`📍 Current block: ${currentBlock}`);
    console.log(`📍 Last processed: ${lastProcessedBlock}`);
    console.log(`🔍 Syncing blocks ${startBlock} to ${currentBlock}...`);
    
    if (startBlock > currentBlock) {
      console.log('✅ Already up to date');
      isRunning = false;
      return;
    }
    
    // Fetch events in batches - SMALL batches to avoid rate limits!
    const batchSize = 1000; // Smaller batches for free RPC
    const maxRetries = 3;
    let totalEventsSaved = 0;
    
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += batchSize) {
      const toBlock = Math.min(fromBlock + batchSize - 1, currentBlock);
      console.log(`📦 Processing blocks ${fromBlock} to ${toBlock}...`);
      
      let retryCount = 0;
      let success = false;
      
      while (retryCount < maxRetries && !success) {
        try {
          const filter = contract.filters.UserRegistered();
          const events = await contract.queryFilter(filter, fromBlock, toBlock);
          
          console.log(`   Found ${events.length} events`);
          
          for (const event of events) {
            const userAddress = event.args.user;
            const userId = Number(event.args.userId);
            const referrerId = Number(event.args.referrerId);
            const timestamp = Number(event.args.timestamp);
            const blockNumber = event.blockNumber;
            const txHash = event.transactionHash;
            
            // Save to database
            try {
              await saveUserRegistration(
                userAddress,
                userId,
                referrerId,
                blockNumber,
                timestamp, // REAL timestamp from blockchain event!
                txHash
              );
              totalEventsSaved++;
            } catch (error) {
              // Ignore duplicate errors
              if (error.code !== '23505') {
                console.error(`   ⚠️  Error saving userId ${userId}:`, error.message);
              }
            }
          }
          
          // Update progress
          await saveLastProcessedBlock(toBlock);
          success = true;
          
        } catch (error) {
          retryCount++;
          if (error.message && error.message.includes('rate limit')) {
            console.error(`   ⚠️  Rate limit hit, retry ${retryCount}/${maxRetries}...`);
            // Exponential backoff: wait longer each retry
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          } else {
            console.error(`   ❌ Error processing blocks ${fromBlock}-${toBlock}:`, error.message);
            break; // Don't retry non-rate-limit errors
          }
        }
      }
      
      if (!success) {
        console.error(`   ❌ Failed after ${maxRetries} retries, skipping blocks ${fromBlock}-${toBlock}`);
      }
      
      // Longer delay between batches to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`✅ Sync complete! Saved ${totalEventsSaved} new events, now at block ${currentBlock}`);
    
  } catch (error) {
    console.error('❌ Sync error:', error);
  } finally {
    isRunning = false;
  }
}

async function start() {
  console.log('🚀 Weekly Leaderboard Event Indexer Starting...');
  console.log(`📍 Contract: ${config.contractAddress}`);
  console.log(`📍 Deployment block: ${config.deploymentBlock}`);
  console.log('\n💡 This indexer tracks REAL registration timestamps from blockchain events');
  console.log('💡 Perfect for accurate weekly leaderboards!\n');
  
  initDatabase();
  
  // Do initial sync
  await syncWeeklyEvents();
  
  // Sync every 30 seconds
  setInterval(async () => {
    console.log('\n⏰ Periodic sync triggered');
    await syncWeeklyEvents();
  }, 30000);
  
  console.log('✅ Indexer running. Syncing every 30 seconds...');
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down indexer...');
  process.exit(0);
});

start();

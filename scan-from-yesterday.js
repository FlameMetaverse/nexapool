import { ethers } from 'ethers';
import { config, contractABI } from './src/config.js';
import { initDatabase, saveUserRegistration } from './src/database.js';

/**
 * Scan UserRegistered events from yesterday to now
 * This gets accurate timestamps for weekly leaderboard
 */

async function scanFromYesterday() {
  console.log('🔍 Scanning registrations from yesterday...\n');
  
  // Initialize database
  initDatabase();
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, contractABI, provider);
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    console.log(`📍 Current block: ${currentBlock}`);
    
    // Calculate yesterday (24 hours ago)
    const now = Math.floor(Date.now() / 1000);
    const yesterday = now - (24 * 60 * 60);
    console.log(`📅 Yesterday timestamp: ${yesterday} (${new Date(yesterday * 1000).toISOString()})`);
    
    // Estimate block number from yesterday
    // BSC: ~3 seconds per block
    const blocksIn24Hours = Math.floor((24 * 60 * 60) / 3);
    const startBlock = Math.max(currentBlock - blocksIn24Hours, config.deploymentBlock);
    
    console.log(`📍 Scanning from block ${startBlock} to ${currentBlock}`);
    console.log(`📍 Estimated ${currentBlock - startBlock} blocks (~${((currentBlock - startBlock) / blocksIn24Hours * 24).toFixed(1)} hours)\n`);
    
    // Fetch UserRegistered events in chunks
    console.log('📥 Fetching UserRegistered events...');
    
    const chunkSize = 5000;
    const totalBlocks = currentBlock - startBlock;
    const numChunks = Math.ceil(totalBlocks / chunkSize);
    
    let allEvents = [];
    
    for (let i = 0; i < numChunks; i++) {
      const chunkStart = startBlock + (i * chunkSize);
      const chunkEnd = Math.min(chunkStart + chunkSize - 1, currentBlock);
      
      console.log(`  📦 Chunk ${i + 1}/${numChunks}: blocks ${chunkStart}-${chunkEnd}`);
      
      try {
        const filter = contract.filters.UserRegistered();
        const events = await contract.queryFilter(filter, chunkStart, chunkEnd);
        allEvents.push(...events);
        
        console.log(`     Found ${events.length} events (total: ${allEvents.length})`);
        
        // Delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`     ⚠️  Error fetching chunk: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Total events found: ${allEvents.length}\n`);
    
    if (allEvents.length === 0) {
      console.log('ℹ️  No registrations in the last 24 hours');
      return;
    }
    
    // Filter events from yesterday onwards
    const recentEvents = [];
    for (const event of allEvents) {
      const timestamp = Number(event.args.timestamp);
      if (timestamp >= yesterday) {
        recentEvents.push(event);
      }
    }
    
    console.log(`📊 Events from yesterday: ${recentEvents.length}\n`);
    
    // Save to database
    console.log('💾 Saving to database...');
    let savedCount = 0;
    
    for (const event of recentEvents) {
      const address = event.args.user;
      const userId = Number(event.args.userId);
      const referrerId = Number(event.args.referrerId);
      const timestamp = Number(event.args.timestamp);
      const blockNumber = event.blockNumber;
      const txHash = event.transactionHash;
      
      try {
        await saveUserRegistration(address, userId, referrerId, blockNumber, timestamp, txHash);
        savedCount++;
        
        const date = new Date(timestamp * 1000).toISOString();
        console.log(`  ✓ User ${userId} (ref: ${referrerId}) - ${date}`);
      } catch (error) {
        // Ignore duplicates
        if (!error.message.includes('duplicate')) {
          console.error(`  ⚠️  Error saving user ${userId}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n✅ Saved ${savedCount} registrations from yesterday`);
    console.log('\n🎯 Now you can check the weekly leaderboard:');
    console.log('   node get-weekly-leaderboard.js');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

scanFromYesterday();

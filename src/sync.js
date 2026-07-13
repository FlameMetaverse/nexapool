import { ethers } from 'ethers';
import { config, contractABI } from './config.js';
import { initDatabase, saveLastProcessedBlock } from './database.js';
import { processEvents } from './processor.js';

async function fetchEventsInChunks(contract, filter, fromBlock, toBlock) {
  const events = [];
  const chunkSize = 2000; // Smaller chunks to avoid rate limits
  const totalBlocks = toBlock - fromBlock;
  const numChunks = Math.ceil(totalBlocks / chunkSize);
  
  console.log(`📦 Fetching ${numChunks} chunks (${chunkSize} blocks each)`);
  
  for (let i = 0; i < numChunks; i++) {
    const chunkStart = fromBlock + (i * chunkSize);
    const chunkEnd = Math.min(chunkStart + chunkSize - 1, toBlock);
    
    let retries = 0;
    while (retries < config.maxRetries) {
      try {
        const chunkEvents = await contract.queryFilter(filter, chunkStart, chunkEnd);
        events.push(...chunkEvents);
        
        console.log(`  ✓ Chunk ${i + 1}/${numChunks} (${events.length} events so far)`);
        
        // Longer delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;
      } catch (error) {
        retries++;
        if (retries >= config.maxRetries) {
          console.error(`  ✗ Chunk ${i + 1} failed after ${config.maxRetries} retries:`, error.message);
          // Continue to next chunk instead of breaking
          break;
        }
        console.warn(`  ⚠️  Chunk ${i + 1} failed, retry ${retries}/${config.maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * retries));
      }
    }
  }
  
  return events;
}

async function syncFull() {
  console.log('🔄 Starting FULL blockchain sync from deployment...');
  console.log(`📍 Contract: ${config.contractAddress}`);
  console.log(`📍 From block: ${config.deploymentBlock}`);
  
  // Initialize database
  initDatabase();
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, contractABI, provider);
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    console.log(`📍 Current block: ${currentBlock}`);
    
    const blocksToSync = currentBlock - config.deploymentBlock;
    console.log(`🔍 Syncing ${blocksToSync} blocks...`);
    
    // Fetch UserRegistered events
    console.log('\n📥 Fetching UserRegistered events...');
    const userRegisteredFilter = contract.filters.UserRegistered();
    const userRegisteredEvents = await fetchEventsInChunks(
      contract,
      userRegisteredFilter,
      config.deploymentBlock,
      currentBlock
    );
    console.log(`✅ Found ${userRegisteredEvents.length} UserRegistered events`);
    
    // Fetch PaymentSent events
    console.log('\n📥 Fetching PaymentSent events...');
    const paymentSentFilter = contract.filters.PaymentSent();
    const paymentSentEvents = await fetchEventsInChunks(
      contract,
      paymentSentFilter,
      config.deploymentBlock,
      currentBlock
    );
    console.log(`✅ Found ${paymentSentEvents.length} PaymentSent events`);
    
    // Process events and update database
    console.log('\n💾 Processing and saving to database...');
    const result = await processEvents(userRegisteredEvents, paymentSentEvents);
    console.log('📊 Processing result:', result);
    
    // Save last processed block
    await saveLastProcessedBlock(currentBlock);
    
    console.log(`\n✅ FULL SYNC COMPLETE!`);
    console.log(`   Processed ${result.usersProcessed} users`);
    console.log(`   Calculated teams for ${result.totalTeamCalculated} users`);
    console.log(`   Calculated earnings for ${result.totalEarningsCalculated} users`);
    console.log(`   Up to block: ${currentBlock}`);
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the sync
syncFull();

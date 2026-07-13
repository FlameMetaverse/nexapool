import { ethers } from 'ethers';
import { config, contractABI } from './config.js';
import { initDatabase, getLastProcessedBlock, saveLastProcessedBlock } from './database.js';
import { processEvents } from './processor.js';

let isRunning = false;

async function fetchEventsInChunks(contract, filter, fromBlock, toBlock) {
  const events = [];
  const totalBlocks = toBlock - fromBlock;
  const numChunks = Math.ceil(totalBlocks / config.chunkSize);
  
  console.log(`📦 Fetching ${numChunks} chunks (${config.chunkSize} blocks each)`);
  
  for (let i = 0; i < numChunks; i++) {
    const chunkStart = fromBlock + (i * config.chunkSize);
    const chunkEnd = Math.min(chunkStart + config.chunkSize - 1, toBlock);
    
    let retries = 0;
    while (retries < config.maxRetries) {
      try {
        const chunkEvents = await contract.queryFilter(filter, chunkStart, chunkEnd);
        events.push(...chunkEvents);
        
        if (i % 10 === 0) {
          console.log(`  ✓ Chunk ${i + 1}/${numChunks} (${events.length} events so far)`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        break;
      } catch (error) {
        retries++;
        if (retries >= config.maxRetries) {
          console.error(`  ✗ Chunk ${i + 1} failed after ${config.maxRetries} retries:`, error.message);
          // Continue with other chunks
          break;
        }
        console.warn(`  ⚠️  Chunk ${i + 1} failed, retry ${retries}/${config.maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  }
  
  return events;
}

async function syncBlockchain() {
  if (isRunning) {
    console.log('⏭️  Sync already running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('🔄 Starting blockchain sync...');
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, contractABI, provider);
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    const lastProcessed = await getLastProcessedBlock();
    
    console.log(`📍 Current block: ${currentBlock}`);
    console.log(`📍 Last processed: ${lastProcessed}`);
    
    if (lastProcessed >= currentBlock) {
      console.log('✅ Already up to date');
      isRunning = false;
      return;
    }
    
    const blocksToSync = currentBlock - lastProcessed;
    console.log(`🔍 Syncing ${blocksToSync} blocks...`);
    
    // Fetch UserRegistered events
    console.log('📥 Fetching UserRegistered events...');
    const userRegisteredFilter = contract.filters.UserRegistered();
    const userRegisteredEvents = await fetchEventsInChunks(
      contract,
      userRegisteredFilter,
      lastProcessed + 1,
      currentBlock
    );
    console.log(`✅ Found ${userRegisteredEvents.length} UserRegistered events`);
    
    // Fetch PaymentSent events
    console.log('📥 Fetching PaymentSent events...');
    const paymentSentFilter = contract.filters.PaymentSent();
    const paymentSentEvents = await fetchEventsInChunks(
      contract,
      paymentSentFilter,
      lastProcessed + 1,
      currentBlock
    );
    console.log(`✅ Found ${paymentSentEvents.length} PaymentSent events`);
    
    // Process events and update database
    if (userRegisteredEvents.length > 0 || paymentSentEvents.length > 0) {
      const result = await processEvents(userRegisteredEvents, paymentSentEvents);
      console.log('📊 Processing result:', result);
    }
    
    // Save last processed block
    await saveLastProcessedBlock(currentBlock);
    console.log(`✅ Sync complete! Processed up to block ${currentBlock}`);
    
  } catch (error) {
    console.error('❌ Sync error:', error);
  } finally {
    isRunning = false;
  }
}

// Initialize and start
async function start() {
  console.log('🚀 NexaPool Indexer Starting...');
  console.log(`📍 Contract: ${config.contractAddress}`);
  console.log(`📍 RPC: ${config.bscRpcUrl}`);
  
  // Initialize database
  initDatabase();
  
  // Do initial sync
  await syncBlockchain();
  
  // Set up periodic sync every 30 seconds
  setInterval(async () => {
    console.log('\n⏰ Periodic sync triggered');
    await syncBlockchain();
  }, 30000);
  
  console.log('✅ Indexer running. Syncing every 30 seconds...');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down indexer...');
  process.exit(0);
});

// Start the indexer
start();

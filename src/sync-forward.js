import { ethers } from 'ethers';
import { config, contractABI } from './config.js';
import { initDatabase, saveLastProcessedBlock, getLastProcessedBlock } from './database.js';
import { processEvents } from './processor.js';

/**
 * Forward-Only Sync
 * Only indexes NEW events going forward (doesn't backfill history)
 * Works with free RPC endpoints
 */
async function syncForwardOnly() {
  console.log('🔄 Starting FORWARD-ONLY sync mode...');
  console.log('⚠️  Note: This will ONLY track NEW events from now on');
  console.log('⚠️  Historical data will NOT be indexed');
  console.log(`📍 Contract: ${config.contractAddress}`);
  
  // Initialize database
  initDatabase();
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, contractABI, provider);
    
    // Get current block as starting point
    const currentBlock = await provider.getBlockNumber();
    console.log(`📍 Current block: ${currentBlock}`);
    
    // Check if we have a last processed block
    const lastProcessedBlock = await getLastProcessedBlock();
    
    if (lastProcessedBlock === null) {
      // First time running - start from current block
      console.log(`✅ Initializing indexer to start from block ${currentBlock}`);
      await saveLastProcessedBlock(currentBlock);
      console.log('✅ Indexer initialized! Run "npm start" to begin tracking new events.');
    } else {
      console.log(`ℹ️  Indexer already initialized at block ${lastProcessedBlock}`);
      console.log(`ℹ️  It will continue tracking from block ${lastProcessedBlock + 1}`);
      console.log('✅ Run "npm start" to begin tracking new events.');
    }
    
  } catch (error) {
    console.error('❌ Initialization error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the forward-only sync initialization
syncForwardOnly();

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function updateToCurrentBlock() {
  console.log('🔄 Updating indexer to start from current block...');
  
  // Get current block from blockchain
  const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
  const currentBlock = await provider.getBlockNumber();
  console.log(`📍 Current block: ${currentBlock}`);
  
  // Update Supabase
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { error } = await supabase
    .from('indexer_state')
    .update({ last_block: currentBlock, updated_at: new Date().toISOString() })
    .eq('id', 1);
  
  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  console.log(`✅ Updated indexer_state to block ${currentBlock}`);
  console.log('✅ Indexer will now only track NEW events going forward!');
  console.log('\n📝 Next step: Run "npm run indexer" to start tracking');
  
  process.exit(0);
}

updateToCurrentBlock();

import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Get current block from BSC
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.defibit.io/');
const currentBlock = await provider.getBlockNumber();

console.log(`Current BSC block: ${currentBlock}`);

// Update indexer state to current block
const { error } = await supabase
  .from('indexer_state')
  .upsert({
    id: 1,
    last_block: currentBlock,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'id'
  });

if (error) {
  console.error('Error updating indexer state:', error);
} else {
  console.log(`✅ Indexer reset to block ${currentBlock}`);
  console.log('The indexer will now only track NEW registrations from this point forward.');
}

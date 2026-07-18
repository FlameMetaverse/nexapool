import { ethers } from 'ethers';
import { config } from './src/config.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function markCurrentUsersAsBaseline() {
  console.log('🔍 Connecting to contract...');
  
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const contract = new ethers.Contract(
    config.contractAddress,
    ['function currUserId() view returns (uint)'],
    provider
  );
  
  // Get current highest user ID
  const currentHighestUserId = Number(await contract.currUserId());
  
  console.log(`📊 Current highest user ID: ${currentHighestUserId}`);
  console.log(`🎯 From now on, ONLY users with ID > ${currentHighestUserId} will appear in weekly leaderboard`);
  
  // Save this baseline in database
  const { data, error } = await supabase
    .from('indexer_state')
    .upsert({
      id: 1,
      baseline_user_id: currentHighestUserId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    })
    .select();
  
  if (error) {
    console.error('❌ Error saving baseline:', error);
    throw error;
  }
  
  console.log(`✅ Baseline set! Only NEW users (ID > ${currentHighestUserId}) will count for weekly leaderboard`);
  console.log('');
  console.log('Next steps:');
  console.log('1. Backend endpoint will check user_id > baseline_user_id');
  console.log('2. Old users will be filtered out automatically');
  console.log('3. Weekly leaderboard starts fresh from NOW');
}

markCurrentUsersAsBaseline().catch(console.error);

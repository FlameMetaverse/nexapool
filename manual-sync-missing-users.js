// Manual script to sync missing users 840-845
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const CONTRACT_ADDRESS = '0x695E28B8d61F7211d16537B5055A180eaDEbad3E';
const BSC_RPC = 'https://bsc-dataseed1.defibit.io/';

const CONTRACT_ABI = [
  "function currUserId() view returns (uint)",
  "function users(address) view returns (bool exists, uint id, uint referrerId, uint directs, uint referralEarnings, uint totalTeam, uint totalEarned)",
  "function userList(uint) view returns (address)"
];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function syncMissingUsers() {
  console.log('🚀 Manual sync for missing users...\n');
  
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  
  // Get total users from contract
  const currUserId = await contract.currUserId();
  const totalUsers = Number(currUserId);
  console.log(`📊 Total users in contract: ${totalUsers}`);
  
  // Get actual last user ID from database (not the indexer_state)
  const { data: actualMax } = await supabase
    .from('user_registrations')
    .select('user_id')
    .lte('user_id', totalUsers) // Only valid user IDs
    .order('user_id', { ascending: false })
    .limit(1);
  
  const lastSyncedUserId = actualMax && actualMax.length > 0 ? actualMax[0].user_id : 0;
  
  console.log(`📝 Last synced user ID: ${lastSyncedUserId}`);
  console.log(`📝 Will sync users ${lastSyncedUserId + 1} to ${totalUsers}\n`);
  
  if (lastSyncedUserId >= totalUsers) {
    console.log('✅ Already up to date!');
    return;
  }
  
  const currentBlock = await provider.getBlockNumber();
  const now = Math.floor(Date.now() / 1000);
  
  // Sync missing users
  for (let userId = lastSyncedUserId + 1; userId <= totalUsers; userId++) {
    try {
      console.log(`Processing user ${userId}...`);
      
      // Get user address
      const userAddress = await contract.userList(userId);
      
      if (!userAddress || userAddress === ethers.ZeroAddress) {
        console.log(`  ⚠️  User ${userId} has zero address, skipping`);
        continue;
      }
      
      // Get user data
      const userData = await contract.users(userAddress);
      const exists = userData[0];
      const id = Number(userData[1]);
      const referrerId = Number(userData[2]);
      const directs = Number(userData[3]);
      const totalTeam = Number(userData[5]);
      const totalEarned = Number(userData[6]) / 1e18;
      
      if (!exists) {
        console.log(`  ⚠️  User ${userId} does not exist, skipping`);
        continue;
      }
      
      // Use current timestamp for registration time
      const timestamp = now - (totalUsers - userId) * 3; // Rough estimate
      
      // Insert into user_registrations
      const { error: regError } = await supabase
        .from('user_registrations')
        .insert({
          user_address: userAddress.toLowerCase(),
          user_id: userId,
          referrer_id: referrerId,
          block_number: currentBlock,
          block_timestamp: timestamp,
          transaction_hash: `manual-sync-${userId}`
        });
      
      if (regError && regError.code !== '23505') { // Ignore duplicates
        console.error(`  ❌ Error inserting registration:`, regError);
      } else {
        console.log(`  ✅ Saved registration for user ${userId} (referrer: ${referrerId})`);
      }
      
      // Update user_stats
      const { error: statsError } = await supabase
        .from('user_stats')
        .upsert({
          address: userAddress.toLowerCase(),
          user_id: userId,
          referrer_id: referrerId,
          total_team: totalTeam,
          total_earned: totalEarned.toFixed(2),
          directs: directs,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'address'
        });
      
      if (statsError) {
        console.error(`  ❌ Error updating stats:`, statsError);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`  ❌ Error processing user ${userId}:`, error.message);
    }
  }
  
  // Update indexer_state with latest user ID
  const { error: stateError } = await supabase
    .from('indexer_state')
    .upsert({
      id: 1,
      last_block: totalUsers, // Store last user ID
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    });
  
  if (stateError) {
    console.error('❌ Error updating indexer_state:', stateError);
  }
  
  console.log(`\n✅ Manual sync complete!`);
  console.log(`📊 Database now has users 1-${totalUsers}`);
  console.log(`💰 Refresh the leaderboard page to see updated pool amount`);
}

syncMissingUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const config = {
  rpcUrl: 'https://bsc-dataseed1.defibit.io/',
  contractAddress: '0x695E28B8d61F7211d16537B5055A180eaDEbad3E',
  deploymentBlock: 107849898
};

const CONTRACT_ABI = [
  "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)"
];

async function backfillTimestamps() {
  console.log('🔄 Starting timestamp backfill...\n');
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
    // Get all registrations from database
    console.log('📊 Fetching all registrations from database...');
    const { data: registrations, error } = await supabase
      .from('user_registrations')
      .select('user_id, user_address, block_timestamp')
      .order('user_id', { ascending: true });
    
    if (error) throw error;
    
    console.log(`   Found ${registrations.length} registrations\n`);
    
    // Process in batches
    const batchSize = 50;
    let updated = 0;
    let skipped = 0;
    
    for (let i = 0; i < registrations.length; i += batchSize) {
      const batch = registrations.slice(i, Math.min(i + batchSize, registrations.length));
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(registrations.length / batchSize)} (users ${batch[0].user_id} to ${batch[batch.length - 1].user_id})`);
      
      for (const reg of batch) {
        try {
          // Query event for this specific user
          const filter = contract.filters.UserRegistered(reg.user_address, reg.user_id);
          const events = await contract.queryFilter(filter, config.deploymentBlock, 'latest');
          
          if (events.length > 0) {
            const realTimestamp = Number(events[0].args.timestamp);
            
            // Update database with real timestamp
            const { error: updateError } = await supabase
              .from('user_registrations')
              .update({ block_timestamp: realTimestamp })
              .eq('user_id', reg.user_id);
            
            if (updateError) {
              console.error(`  ⚠️  Error updating user ${reg.user_id}:`, updateError.message);
            } else {
              console.log(`  ✓ User ${reg.user_id}: ${new Date(realTimestamp * 1000).toISOString()}`);
              updated++;
            }
          } else {
            console.log(`  ⚠️  No event found for user ${reg.user_id}`);
            skipped++;
          }
          
          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`  ❌ Error processing user ${reg.user_id}:`, error.message);
          skipped++;
        }
      }
      
      console.log(`  Progress: ${updated} updated, ${skipped} skipped\n`);
      
      // Longer delay between batches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`\n✅ Backfill complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
  }
}

backfillTimestamps();

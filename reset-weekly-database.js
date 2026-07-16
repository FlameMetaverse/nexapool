import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function reset() {
  console.log('🔄 Resetting weekly leaderboard database...\n');
  
  // 1. Clear all user_registrations
  console.log('1️⃣  Clearing user_registrations table...');
  const { error: deleteError } = await supabase
    .from('user_registrations')
    .delete()
    .neq('user_id', 0); // Delete all rows
  
  if (deleteError) {
    console.error('❌ Error:', deleteError);
  } else {
    console.log('✅ Cleared user_registrations\n');
  }
  
  // 2. Reset indexer_state to deployment block
  console.log('2️⃣  Resetting indexer_state to deployment block...');
  const DEPLOYMENT_BLOCK = 107849898;
  
  const { error: updateError } = await supabase
    .from('indexer_state')
    .update({ 
      last_block: DEPLOYMENT_BLOCK,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1);
  
  if (updateError) {
    console.error('❌ Error:', updateError);
  } else {
    console.log(`✅ Reset to block ${DEPLOYMENT_BLOCK}\n`);
  }
  
  console.log('✅ Database reset complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Stop the current indexer (storage-indexer.js)');
  console.log('2. Start the new event-based indexer: node src/weekly-sync.js');
  console.log('3. Wait 2-3 minutes for it to sync all events');
  console.log('4. Check the weekly leaderboard - it should show ONLY this week\'s registrations!\n');
}

reset();

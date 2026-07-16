import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function resetIndexer() {
  console.log('🔧 Resetting indexer to start fresh...\n');
  
  // Delete the indexer_state row (will force it to start from user ID 0)
  const { error: deleteError } = await supabase
    .from('indexer_state')
    .delete()
    .eq('id', 1);
  
  if (deleteError) {
    console.error('❌ Error deleting state:', deleteError);
  } else {
    console.log('✅ Indexer state cleared');
  }
  
  // Clear existing data (optional - comment out if you want to keep existing data)
  console.log('\n🗑️  Clearing existing data...');
  
  const { error: clearRegsError } = await supabase
    .from('user_registrations')
    .delete()
    .neq('user_id', 0); // Delete all
  
  if (clearRegsError) {
    console.error('❌ Error clearing registrations:', clearRegsError);
  } else {
    console.log('✅ User registrations cleared');
  }
  
  const { error: clearStatsError } = await supabase
    .from('user_stats')
    .delete()
    .neq('user_id', 0); // Delete all
  
  if (clearStatsError) {
    console.error('❌ Error clearing stats:', clearStatsError);
  } else {
    console.log('✅ User stats cleared');
  }
  
  console.log('\n✅ Reset complete!');
  console.log('\n🚀 Now restart the indexer with: node src/index.js');
}

resetIndexer();

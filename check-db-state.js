import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkDatabase() {
  console.log('🔍 Checking database state...\n');
  
  // Check indexer state
  const { data: indexerState, error: stateError } = await supabase
    .from('indexer_state')
    .select('*')
    .eq('id', 1)
    .single();
  
  if (stateError && stateError.code !== 'PGRST116') {
    console.error('❌ Error checking indexer state:', stateError);
  } else if (indexerState) {
    console.log('📊 Indexer State:');
    console.log('  Last Block:', indexerState.last_block);
    console.log('  Updated At:', indexerState.updated_at);
    console.log('  Deployment Block:', process.env.DEPLOYMENT_BLOCK);
    console.log('  Blocks Processed:', indexerState.last_block - parseInt(process.env.DEPLOYMENT_BLOCK));
  } else {
    console.log('⚠️  No indexer state found - indexer never ran');
  }
  
  console.log('\n');
  
  // Check user registrations count
  const { count: regCount, error: regError } = await supabase
    .from('user_registrations')
    .select('*', { count: 'exact', head: true });
  
  if (regError) {
    console.error('❌ Error checking registrations:', regError);
  } else {
    console.log('👥 User Registrations:', regCount);
  }
  
  // Check user stats count
  const { count: statsCount, error: statsError } = await supabase
    .from('user_stats')
    .select('*', { count: 'exact', head: true });
  
  if (statsError) {
    console.error('❌ Error checking user stats:', statsError);
  } else {
    console.log('📈 User Stats Records:', statsCount);
  }
  
  // Sample recent registrations
  const { data: recentRegs, error: recentError } = await supabase
    .from('user_registrations')
    .select('*')
    .order('block_number', { ascending: false })
    .limit(5);
  
  if (recentError) {
    console.error('❌ Error fetching recent registrations:', recentError);
  } else if (recentRegs && recentRegs.length > 0) {
    console.log('\n🔥 Recent Registrations:');
    recentRegs.forEach(reg => {
      console.log(`  User ${reg.user_id} (${reg.user_address.substring(0, 8)}...) - Block ${reg.block_number}`);
    });
  } else {
    console.log('\n⚠️  No registrations found in database');
  }
  
  console.log('\n✅ Database check complete');
}

checkDatabase().catch(console.error);

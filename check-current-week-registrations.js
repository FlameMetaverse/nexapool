// Quick diagnostic to check current week registrations
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function checkCurrentWeek() {
  console.log('🔍 Checking current week registrations...\n');
  
  // Calculate Monday 00:00 UTC for current week
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const weekStartTimestamp = Math.floor(monday.getTime() / 1000);
  
  console.log(`📅 Current week starts: ${monday.toISOString()}`);
  console.log(`📅 Week start timestamp: ${weekStartTimestamp}\n`);
  
  // Query database for current week
  const { data, error, count } = await supabase
    .from('user_registrations')
    .select('*', { count: 'exact' })
    .gte('block_timestamp', weekStartTimestamp)
    .order('block_timestamp', { ascending: false });
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`📊 Total registrations in database for current week: ${count}`);
  
  // Filter by referrerId > 0
  const withReferrer = data.filter(r => r.referrer_id > 0);
  console.log(`📊 Registrations with referrer (referrer_id > 0): ${withReferrer.length}`);
  console.log(`📊 Expected weekly pool: $${(withReferrer.length * 0.40).toFixed(2)}\n`);
  
  // Show last 10 registrations
  console.log('📝 Last 10 registrations:');
  data.slice(0, 10).forEach((reg, i) => {
    const date = new Date(reg.block_timestamp * 1000);
    console.log(`   ${i + 1}. User ${reg.user_id} (referrer: ${reg.referrer_id}) at ${date.toISOString()}`);
  });
  
  // Check indexer state
  const { data: indexerData } = await supabase
    .from('indexer_state')
    .select('*')
    .eq('id', 1)
    .single();
  
  console.log(`\n🔧 Indexer state:`);
  console.log(`   Last processed block: ${indexerData?.last_block || 'N/A'}`);
  console.log(`   Last updated: ${indexerData?.updated_at || 'N/A'}`);
}

checkCurrentWeek().catch(console.error);

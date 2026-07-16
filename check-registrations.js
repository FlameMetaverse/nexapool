import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Get all registrations
const { data, error } = await supabase
  .from('user_registrations')
  .select('*')
  .order('block_timestamp', { ascending: false })
  .limit(10);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Recent registrations:', JSON.stringify(data, null, 2));
  
  // Convert timestamps to dates
  data.forEach(reg => {
    const date = new Date(reg.block_timestamp * 1000);
    console.log(`\nUser ID ${reg.user_id}: ${date.toISOString()} (${date.toUTCString()})`);
  });
  
  // Check current week
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  const weekStartTimestamp = Math.floor(monday.getTime() / 1000);
  
  console.log(`\nCurrent week started: ${monday.toISOString()} (timestamp: ${weekStartTimestamp})`);
  console.log(`Current time: ${now.toISOString()}`);
  
  const thisWeekRegs = data.filter(r => r.block_timestamp >= weekStartTimestamp);
  console.log(`\nRegistrations this week: ${thisWeekRegs.length}`);
}

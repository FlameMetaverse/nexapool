// Quick test to see what the API is returning
const response = await fetch('https://nexapool-backend.onrender.com/api/referrals/weekly-leaderboard');
const data = await response.json();

console.log('\n=== WEEKLY LEADERBOARD RESPONSE ===\n');
console.log(`Week Start: ${new Date(data.weekStart * 1000).toISOString()}`);
console.log(`Week End: ${new Date(data.weekEnd * 1000).toISOString()}`);
console.log(`Total Registrations THIS WEEK: ${data.totalRegistrations}`);
console.log(`Total Pool: $${data.totalPool}`);
console.log(`\nTop 10 Rankings:`);
data.rankings.slice(0, 10).forEach(r => {
  console.log(`  ${r.rank}. Referrer #${r.referrerId}: ${r.referralCount} referrals, $${r.reward} reward`);
});

// Also check database directly
console.log('\n=== DATABASE CHECK ===\n');

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// Check total registrations in database
const { count } = await supabase
  .from('user_registrations')
  .select('*', { count: 'exact', head: true });

console.log(`Total registrations in database: ${count}`);

// Check Monday 00:00 UTC
const now = new Date();
const dayOfWeek = now.getUTCDay();
const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
const monday = new Date(now);
monday.setUTCDate(now.getUTCDate() - daysToMonday);
monday.setUTCHours(0, 0, 0, 0);
const weekStartTimestamp = Math.floor(monday.getTime() / 1000);

console.log(`Monday 00:00 UTC: ${monday.toISOString()} (timestamp: ${weekStartTimestamp})`);

// Check registrations since Monday
const { data: thisWeek } = await supabase
  .from('user_registrations')
  .select('*')
  .gte('block_timestamp', weekStartTimestamp);

console.log(`Registrations since Monday in database: ${thisWeek?.length || 0}`);

if (thisWeek && thisWeek.length > 0) {
  console.log('\nSample timestamps from database:');
  thisWeek.slice(0, 5).forEach(r => {
    const date = new Date(r.block_timestamp * 1000);
    console.log(`  User #${r.user_id}: ${date.toISOString()}`);
  });
}

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function getWeeklyLeaderboard() {
  // Get current week start (Sunday 00:00:00 UTC)
  const now = new Date();
  const currentDay = now.getUTCDay();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - currentDay);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  const weekStartTimestamp = Math.floor(weekStart.getTime() / 1000);
  
  console.log('📅 Weekly Leaderboard - Most Direct Referrals');
  console.log(`Week starting: ${weekStart.toISOString()}`);
  console.log(`Timestamp: ${weekStartTimestamp}\n`);
  
  // Get all registrations this week, grouped by referrer
  const { data: weeklyRegs, error: regError } = await supabase
    .from('user_registrations')
    .select('referrer_id, user_id, user_address, block_timestamp')
    .gte('block_timestamp', weekStartTimestamp)
    .order('block_timestamp', { ascending: true });
  
  if (regError) {
    console.error('❌ Error fetching registrations:', regError);
    return;
  }
  
  console.log(`📊 Total registrations this week: ${weeklyRegs.length}\n`);
  
  // Count direct referrals per referrer this week
  const referrerCounts = new Map();
  
  for (const reg of weeklyRegs) {
    const referrerId = reg.referrer_id;
    if (referrerId && referrerId !== 0) {
      const current = referrerCounts.get(referrerId) || {
        count: 0,
        referrals: []
      };
      current.count++;
      current.referrals.push({
        userId: reg.user_id,
        address: reg.user_address,
        timestamp: reg.block_timestamp
      });
      referrerCounts.set(referrerId, current);
    }
  }
  
  // Convert to array and sort by count
  const leaderboard = Array.from(referrerCounts.entries())
    .map(([referrerId, data]) => ({
      referrerId,
      directReferralsThisWeek: data.count,
      referrals: data.referrals
    }))
    .sort((a, b) => b.directReferralsThisWeek - a.directReferralsThisWeek);
  
  // Get user details for top 10
  console.log('🏆 TOP 10 LEADERS BY DIRECT REFERRALS THIS WEEK:\n');
  
  for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
    const leader = leaderboard[i];
    
    // Get user details from user_stats
    const { data: userData } = await supabase
      .from('user_stats')
      .select('address, user_id, total_team, directs')
      .eq('user_id', leader.referrerId)
      .single();
    
    const position = i + 1;
    const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
    
    console.log(`${emoji} User ID ${leader.referrerId}`);
    if (userData) {
      console.log(`   Address: ${userData.address}`);
      console.log(`   Total Team (all time): ${userData.total_team}`);
      console.log(`   Direct Referrals (all time): ${userData.directs}`);
    }
    console.log(`   ⭐ New Direct Referrals This Week: ${leader.directReferralsThisWeek}`);
    console.log(`   Referrals:`);
    leader.referrals.forEach(ref => {
      const date = new Date(ref.timestamp * 1000).toISOString();
      console.log(`     • User ${ref.userId} (${ref.address.substring(0, 10)}...) - ${date}`);
    });
    console.log('');
  }
  
  console.log(`\n✅ Total users with referrals this week: ${leaderboard.length}`);
}

getWeeklyLeaderboard().catch(console.error);

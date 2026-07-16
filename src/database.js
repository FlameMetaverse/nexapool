import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let supabase = null;

export function initDatabase() {
  if (!config.supabaseUrl || !config.supabaseKey) {
    console.warn('⚠️  Supabase credentials not found. Using in-memory storage.');
    return null;
  }
  
  supabase = createClient(config.supabaseUrl, config.supabaseKey);
  console.log('✅ Database connected');
  return supabase;
}

export function getDatabase() {
  return supabase;
}

// In-memory fallback storage (for development without Supabase)
let memoryStore = {
  users: new Map(),
  lastBlock: config.deploymentBlock
};

export async function saveUserStats(address, userId, referrerId, totalTeam, totalEarned, directs = 0) {
  if (supabase) {
    const { data, error } = await supabase
      .from('user_stats')
      .upsert({
        address: address.toLowerCase(),
        user_id: userId,
        referrer_id: referrerId,
        total_team: totalTeam,
        total_earned: totalEarned,
        directs: directs,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'address'
      });
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    return data;
  } else {
    // In-memory fallback
    memoryStore.users.set(address.toLowerCase(), {
      userId,
      referrerId,
      totalTeam,
      totalEarned,
      directs,
      updatedAt: Date.now()
    });
  }
}

export async function getUserStats(address) {
  if (supabase) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('address', address.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Database error:', error);
      throw error;
    }
    
    return data;
  } else {
    // In-memory fallback
    const stats = memoryStore.users.get(address.toLowerCase());
    return stats ? {
      address: address.toLowerCase(),
      user_id: stats.userId,
      referrer_id: stats.referrerId,
      total_team: stats.totalTeam,
      total_earned: stats.totalEarned,
      updated_at: new Date(stats.updatedAt).toISOString()
    } : null;
  }
}

export async function saveLastProcessedBlock(blockNumber) {
  console.log(`💾 Attempting to save last_block: ${blockNumber}`);
  
  if (supabase) {
    const { data, error } = await supabase
      .from('indexer_state')
      .upsert({
        id: 1,
        last_block: blockNumber,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select(); // Add .select() to return the updated row
    
    if (error) {
      console.error('❌ Database error saving last_block:', error);
      console.error('   Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    console.log(`✅ Successfully saved last_block: ${blockNumber}`, data);
  } else {
    memoryStore.lastBlock = blockNumber;
    console.log(`✅ Saved to memory: ${blockNumber}`);
  }
}

export async function getLastProcessedBlock() {
  if (supabase) {
    const { data, error } = await supabase
      .from('indexer_state')
      .select('last_block')
      .eq('id', 1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Database error:', error);
      throw error;
    }
    
    return data?.last_block || config.deploymentBlock;
  } else {
    return memoryStore.lastBlock;
  }
}

export async function getAllUserStats() {
  if (supabase) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .order('total_team', { ascending: false });
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    
    return data || [];
  } else {
    return Array.from(memoryStore.users.entries()).map(([address, stats]) => ({
      address,
      user_id: stats.userId,
      referrer_id: stats.referrerId,
      total_team: stats.totalTeam,
      total_earned: stats.totalEarned,
      updated_at: new Date(stats.updatedAt).toISOString()
    }));
  }
}

// Save a user registration event (for weekly leaderboard)
export async function saveUserRegistration(userAddress, userId, referrerId, blockNumber, blockTimestamp, txHash) {
  console.log(`💾 Saving registration: userId=${userId}, referrerId=${referrerId}, block=${blockNumber}`);
  console.log(`   Timestamp: ${blockTimestamp} seconds (${new Date(blockTimestamp * 1000).toISOString()})`);
  
  if (supabase) {
    const { data, error } = await supabase
      .from('user_registrations')
      .insert({
        user_address: userAddress.toLowerCase(),
        user_id: userId,
        referrer_id: referrerId,
        block_number: blockNumber,
        block_timestamp: blockTimestamp,
        transaction_hash: txHash
      })
      .select();
    
    if (error) {
      // Ignore duplicate key errors (event already saved)
      if (error.code === '23505') { // PostgreSQL duplicate key error
        console.log(`   ℹ️  Registration already exists (duplicate): userId=${userId}`);
        return null;
      }
      console.error('❌ Database error saving registration:', error);
      console.error('   Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    console.log(`✅ Registration saved successfully: userId=${userId}`);
    return data;
  }
  return null;
}

// Get user registrations within a time range (for weekly leaderboard)
export async function getRegistrationsByTimeRange(fromTimestamp, toTimestamp = null) {
  console.log(`🔍 Query registrations: fromTimestamp=${fromTimestamp}, toTimestamp=${toTimestamp}`);
  console.log(`   From date: ${new Date(fromTimestamp * 1000).toISOString()}`);
  if (toTimestamp) {
    console.log(`   To date: ${new Date(toTimestamp * 1000).toISOString()}`);
  }
  
  if (supabase) {
    let query = supabase
      .from('user_registrations')
      .select('*')
      .gte('block_timestamp', fromTimestamp);
    
    if (toTimestamp) {
      query = query.lte('block_timestamp', toTimestamp);
    }
    
    query = query.order('block_timestamp', { ascending: true });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('❌ Database error fetching registrations:', error);
      console.error('   Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
    
    console.log(`✅ Query returned ${data?.length || 0} registrations`);
    if (data && data.length > 0) {
      console.log(`   First registration: ${new Date(data[0].block_timestamp * 1000).toISOString()}`);
      console.log(`   Last registration: ${new Date(data[data.length - 1].block_timestamp * 1000).toISOString()}`);
    }
    
    return data || [];
  }
  return [];
}

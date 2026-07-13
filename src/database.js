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

export async function saveUserStats(address, userId, referrerId, totalTeam, totalEarned) {
  if (supabase) {
    const { data, error } = await supabase
      .from('user_stats')
      .upsert({
        address: address.toLowerCase(),
        user_id: userId,
        referrer_id: referrerId,
        total_team: totalTeam,
        total_earned: totalEarned,
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
  if (supabase) {
    const { error } = await supabase
      .from('indexer_state')
      .upsert({
        id: 1,
        last_block: blockNumber,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
  } else {
    memoryStore.lastBlock = blockNumber;
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
        return null;
      }
      console.error('Database error saving registration:', error);
      throw error;
    }
    return data;
  }
  return null;
}

// Get user registrations within a time range (for weekly leaderboard)
export async function getRegistrationsByTimeRange(fromTimestamp, toTimestamp = null) {
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
      console.error('Database error fetching registrations:', error);
      throw error;
    }
    
    return data || [];
  }
  return [];
}

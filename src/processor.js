import { saveUserStats, saveUserRegistration } from './database.js';

// Build referral tree from UserRegistered events
export function buildReferralTree(events) {
  const referralMap = new Map(); // userId -> referrerId
  const addressToId = new Map(); // address -> userId
  
  for (const event of events) {
    const userId = Number(event.args.userId);
    const referrerId = Number(event.args.referrerId);
    const userAddress = event.args.user;
    
    referralMap.set(userId, referrerId);
    addressToId.set(userAddress.toLowerCase(), userId);
  }
  
  return { referralMap, addressToId };
}

// Calculate total team and direct referrals for each user
export function calculateTeamCounts(referralMap, addressToId) {
  const teamCounts = new Map(); // userId -> team count
  const directReferrals = new Map(); // userId -> direct referral count
  
  // First, count direct referrals (people who have this user as immediate sponsor)
  for (const [userId, referrerId] of referralMap.entries()) {
    if (referrerId && referrerId !== 0) {
      const currentDirects = directReferrals.get(referrerId) || 0;
      directReferrals.set(referrerId, currentDirects + 1);
    }
  }
  
  // For each user, count how many people have them in their upline (total team)
  for (const [userId, referrerId] of referralMap.entries()) {
    // Walk up the referral chain and increment team count for each upline
    let currentReferrer = referrerId;
    let depth = 0;
    const maxDepth = 100; // Prevent infinite loops
    
    while (currentReferrer && currentReferrer !== 0 && depth < maxDepth) {
      const currentCount = teamCounts.get(currentReferrer) || 0;
      teamCounts.set(currentReferrer, currentCount + 1);
      
      currentReferrer = referralMap.get(currentReferrer);
      depth++;
    }
  }
  
  return { teamCounts, directReferrals };
}

// Calculate total earned for each user from PaymentSent events
export function calculateEarnings(paymentEvents) {
  const earnings = new Map(); // address -> total earned
  
  for (const event of paymentEvents) {
    const recipient = event.args.to.toLowerCase();
    const amount = Number(event.args.amount) / 1e18; // Convert from wei to USDT
    
    const current = earnings.get(recipient) || 0;
    earnings.set(recipient, current + amount);
  }
  
  return earnings;
}

// Process all events and save to database
export async function processEvents(userRegisteredEvents, paymentSentEvents) {
  console.log(`📊 Processing ${userRegisteredEvents.length} registrations and ${paymentSentEvents.length} payments`);
  
  // Build referral tree
  const { referralMap, addressToId } = buildReferralTree(userRegisteredEvents);
  
  // Calculate team counts and direct referrals
  const { teamCounts, directReferrals } = calculateTeamCounts(referralMap, addressToId);
  
  // Calculate earnings
  const earnings = calculateEarnings(paymentSentEvents);
  
  // Save to database
  const updates = [];
  const registrations = [];
  
  // Process all users from registration events
  for (const event of userRegisteredEvents) {
    const address = event.args.user.toLowerCase();
    const userId = Number(event.args.userId);
    const referrerId = Number(event.args.referrerId);
    const totalTeam = teamCounts.get(userId) || 0;
    const directs = directReferrals.get(userId) || 0;
    const totalEarned = earnings.get(address) || 0;
    const blockNumber = event.blockNumber;
    
    // Verify BigInt conversion - ensure timestamp is correctly converted
    let blockTimestamp;
    try {
      const rawTimestamp = event.args.timestamp;
      console.log(`🔢 Processing event - Raw timestamp type: ${typeof rawTimestamp}, value: ${rawTimestamp}`);
      
      // Handle BigInt or Number types from blockchain
      if (typeof rawTimestamp === 'bigint') {
        blockTimestamp = Number(rawTimestamp);
        console.log(`   Converted BigInt to Number: ${blockTimestamp}`);
      } else {
        blockTimestamp = Number(rawTimestamp);
      }
      
      // Validate timestamp is reasonable (not in the future, not before 2020)
      const currentTime = Math.floor(Date.now() / 1000);
      const year2020 = 1577836800; // Jan 1, 2020 UTC
      if (blockTimestamp < year2020 || blockTimestamp > currentTime + 3600) {
        console.warn(`⚠️  Suspicious timestamp: ${blockTimestamp} (${new Date(blockTimestamp * 1000).toISOString()})`);
      }
    } catch (conversionError) {
      console.error(`❌ Error converting timestamp for userId=${userId}:`, conversionError);
      console.error(`   Raw timestamp value:`, event.args.timestamp);
      throw conversionError;
    }
    
    const txHash = event.transactionHash;
    
    // Log each registration event being processed
    console.log(`📝 Event received → userId: ${userId}, referrerId: ${referrerId}, block: ${blockNumber}`);
    console.log(`   Timestamp: ${blockTimestamp} (${new Date(blockTimestamp * 1000).toISOString()})`);
    console.log(`   Address: ${address}, txHash: ${txHash}`);
    
    updates.push(
      saveUserStats(address, userId, referrerId, totalTeam, totalEarned, directs)
        .catch(error => {
          console.error(`❌ Failed to save user stats for userId=${userId}:`, error);
          throw error;
        })
    );
    
    // Save raw registration event for weekly leaderboard
    registrations.push(
      saveUserRegistration(address, userId, referrerId, blockNumber, blockTimestamp, txHash)
        .catch(error => {
          console.error(`❌ Failed to save registration for userId=${userId}:`, error);
          console.error(`   Event details: block=${blockNumber}, timestamp=${blockTimestamp}, txHash=${txHash}`);
          throw error;
        })
    );
  }
  
  // Also process any users who received payments but didn't register (edge case)
  for (const [address, earned] of earnings.entries()) {
    if (!addressToId.has(address)) {
      // User received payment but not in registration events
      updates.push(
        saveUserStats(address, 0, 0, 0, earned, 0)
          .catch(error => {
            console.error(`❌ Failed to save payment-only user stats for address=${address}:`, error);
            throw error;
          })
      );
    }
  }
  
  console.log(`⏳ Writing ${updates.length} user stats and ${registrations.length} registrations to database...`);
  
  try {
    await Promise.all([...updates, ...registrations]);
    console.log(`✅ Database write SUCCESS: ${updates.length} user stats and ${registrations.length} registrations saved`);
  } catch (writeError) {
    console.error(`❌ Database write FAILURE:`, writeError);
    console.error(`   Failed during batch write of ${updates.length + registrations.length} total operations`);
    throw writeError;
  }
  
  return {
    usersProcessed: updates.length,
    registrationsSaved: registrations.length,
    totalTeamCalculated: teamCounts.size,
    totalEarningsCalculated: earnings.size,
    directReferralsCalculated: directReferrals.size
  };
}

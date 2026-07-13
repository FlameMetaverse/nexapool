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

// Calculate total team for each user
export function calculateTeamCounts(referralMap, addressToId) {
  const teamCounts = new Map(); // userId -> team count
  
  // For each user, count how many people have them in their upline
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
  
  return teamCounts;
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
  
  // Calculate team counts
  const teamCounts = calculateTeamCounts(referralMap, addressToId);
  
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
    const totalEarned = earnings.get(address) || 0;
    const blockNumber = event.blockNumber;
    const blockTimestamp = Number(event.args.timestamp);
    const txHash = event.transactionHash;
    
    updates.push(
      saveUserStats(address, userId, referrerId, totalTeam, totalEarned)
    );
    
    // Save raw registration event for weekly leaderboard
    registrations.push(
      saveUserRegistration(address, userId, referrerId, blockNumber, blockTimestamp, txHash)
    );
  }
  
  // Also process any users who received payments but didn't register (edge case)
  for (const [address, earned] of earnings.entries()) {
    if (!addressToId.has(address)) {
      // User received payment but not in registration events
      updates.push(
        saveUserStats(address, 0, 0, 0, earned)
      );
    }
  }
  
  await Promise.all([...updates, ...registrations]);
  
  console.log(`✅ Processed ${updates.length} user stats and ${registrations.length} registrations`);
  
  return {
    usersProcessed: updates.length,
    registrationsSaved: registrations.length,
    totalTeamCalculated: teamCounts.size,
    totalEarningsCalculated: earnings.size
  };
}

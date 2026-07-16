import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Simple contract ABI
const CONTRACT_ABI = [
  "function currUserId() view returns (uint)",
  "function users(address) view returns (bool exists, uint id, uint referrerId, uint directs, uint referralEarnings, uint totalTeam, uint totalEarned)",
  "function userList(uint) view returns (address)"
];

async function getDirectLeaderboard() {
  console.log('🏆 DIRECT REFERRALS LEADERBOARD (from contract)\n');
  
  try {
    // Connect to blockchain
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    
    // Get total users
    const totalUsers = Number(await contract.currUserId());
    console.log(`👥 Total users: ${totalUsers}\n`);
    console.log('📊 Reading direct referral counts from contract...\n');
    
    const leaderboard = [];
    
    // Read users in batches to avoid rate limits
    const batchSize = 5;
    for (let userId = 1; userId <= totalUsers; userId += batchSize) {
      const batchEnd = Math.min(userId + batchSize, totalUsers);
      
      const promises = [];
      for (let id = userId; id <= batchEnd; id++) {
        promises.push(
          (async () => {
            try {
              const userAddress = await contract.userList(id);
              if (!userAddress || userAddress === ethers.ZeroAddress) return null;
              
              const userData = await contract.users(userAddress);
              const directs = Number(userData[3]);
              
              return {
                userId: id,
                address: userAddress,
                directs,
                totalTeam: Number(userData[5])
              };
            } catch (error) {
              return null;
            }
          })()
        );
      }
      
      const results = await Promise.all(promises);
      leaderboard.push(...results.filter(r => r !== null && r.directs > 0));
      
      // Progress indicator
      if (userId % 50 === 1) {
        console.log(`  ✓ Processed ${Math.min(userId + batchSize - 1, totalUsers)}/${totalUsers} users`);
      }
      
      // Delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Sort by directs (descending)
    leaderboard.sort((a, b) => b.directs - a.directs);
    
    console.log(`\n🏆 TOP 20 BY DIRECT REFERRALS:\n`);
    
    for (let i = 0; i < Math.min(20, leaderboard.length); i++) {
      const user = leaderboard[i];
      const position = i + 1;
      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;
      
      console.log(`${emoji} User ID ${user.userId}`);
      console.log(`   Address: ${user.address}`);
      console.log(`   ⭐ Direct Referrals: ${user.directs}`);
      console.log(`   👥 Total Team: ${user.totalTeam}`);
      console.log('');
    }
    
    console.log(`✅ Total users with referrals: ${leaderboard.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

getDirectLeaderboard();

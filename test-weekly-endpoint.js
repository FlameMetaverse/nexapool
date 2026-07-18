import { ethers } from 'ethers';

const config = {
  bscRpcUrl: 'https://bsc-dataseed1.defibit.io/',
  contractAddress: '0x695E28B8d61F7211d16537B5055A180eaDEbad3E',
  deploymentBlock: 107849898
};

async function test() {
  try {
    console.log('Testing weekly leaderboard endpoint logic...\n');
    
    const CONTRACT_ABI = [
      "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)",
      "function userList(uint) view returns (address)"
    ];
    
    console.log('1. Connecting to BSC...');
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(config.contractAddress, CONTRACT_ABI, provider);
    
    console.log('2. Calculating Monday 00:00 UTC...');
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const weekStartTimestamp = Math.floor(monday.getTime() / 1000);
    
    const nextMonday = new Date(monday);
    nextMonday.setUTCDate(monday.getUTCDate() + 7);
    const weekEndTimestamp = Math.floor(nextMonday.getTime() / 1000);
    
    console.log(`   Week: ${new Date(weekStartTimestamp * 1000).toISOString()} to ${new Date(weekEndTimestamp * 1000).toISOString()}`);
    
    console.log('3. Getting current block...');
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    const currentTimestamp = currentBlockData.timestamp;
    
    console.log(`   Current block: ${currentBlock}, timestamp: ${new Date(currentTimestamp * 1000).toISOString()}`);
    
    console.log('4. Estimating start block...');
    const secondsSinceMonday = currentTimestamp - weekStartTimestamp;
    const blocksToGoBack = Math.floor(secondsSinceMonday / 3);
    const startBlock = Math.max(config.deploymentBlock, currentBlock - blocksToGoBack);
    
    console.log(`   Start block: ${startBlock} (going back ${blocksToGoBack} blocks)`);
    
    console.log('5. Fetching events (first batch only for testing)...');
    const filter = contract.filters.UserRegistered();
    const toBlock = Math.min(startBlock + 5000, currentBlock);
    
    const events = await contract.queryFilter(filter, startBlock, toBlock);
    console.log(`   Fetched ${events.length} events from blocks ${startBlock}-${toBlock}`);
    
    if (events.length > 0) {
      const event = events[0];
      console.log(`   First event: user=${event.args.user}, userId=${event.args.userId}, timestamp=${new Date(Number(event.args.timestamp) * 1000).toISOString()}`);
    }
    
    console.log('\n✅ Test completed successfully!');
    console.log('\nIf this works locally, the issue might be:');
    console.log('- Render environment missing ethers.js dependency');
    console.log('- RPC endpoint blocked/rate limited on Render');
    console.log('- Timeout (fetching takes too long)');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
  }
}

test();

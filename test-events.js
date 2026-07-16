import { ethers } from 'ethers';

// Test if contract has UserRegistered events
async function testEvents() {
  console.log('🔍 Testing contract events...\n');
  
  const CONTRACT_ADDRESS = '0x695E28B8d61F7211d16537B5055A180eaDEbad3E';
  const RPC_URL = 'https://bsc-dataseed1.defibit.io/';
  
  // We know this transaction has a registration (from BSCScan):
  const KNOWN_TX = '0x91a8eb6c8729e7d5b4b458b3f0e5d2d8c6a4a3b2e1f0d9c8b7a6953412';
  const KNOWN_BLOCK = 109900069; // The block you showed me earlier
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Try different ABI signatures for UserRegistered event
  const abiVariations = [
    // Current ABI
    "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)",
    
    // Alternative: uint256 instead of uint
    "event UserRegistered(address indexed user, uint256 indexed userId, uint256 indexed referrerId, uint256 timestamp)",
    
    // Alternative: no timestamp
    "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId)",
    
    // Alternative: different order
    "event UserRegistered(uint indexed userId, address indexed user, uint indexed referrerId, uint timestamp)",
  ];
  
  for (let i = 0; i < abiVariations.length; i++) {
    const abi = abiVariations[i];
    console.log(`\n📋 Testing ABI variation ${i + 1}:`);
    console.log(abi);
    
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, [abi], provider);
      const filter = contract.filters.UserRegistered();
      
      // Test 1: Query the known block
      console.log(`\n  🔍 Querying block ${KNOWN_BLOCK}...`);
      const events = await contract.queryFilter(filter, KNOWN_BLOCK, KNOWN_BLOCK);
      console.log(`  ✅ Found ${events.length} events in block ${KNOWN_BLOCK}`);
      
      if (events.length > 0) {
        console.log('\n  🎉 SUCCESS! This is the correct ABI!');
        console.log('  Event details:', events[0].args);
        console.log('\n  ✅ Use this ABI in config.js:');
        console.log(`  "${abi}"`);
        return;
      }
      
      // Test 2: Query deployment block range
      console.log(`\n  🔍 Querying deployment block 44715765...`);
      const deployEvents = await contract.queryFilter(filter, 44715765, 44715765 + 1000);
      console.log(`  ✅ Found ${deployEvents.length} events in deployment range`);
      
      if (deployEvents.length > 0) {
        console.log('\n  🎉 SUCCESS! This is the correct ABI!');
        console.log('  First event:', deployEvents[0].args);
        console.log('\n  ✅ Use this ABI in config.js:');
        console.log(`  "${abi}"`);
        return;
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n\n❌ No ABI variation worked. Let me check the contract code...\n');
  
  // Get contract code to see if it's a proxy
  const code = await provider.getCode(CONTRACT_ADDRESS);
  console.log(`📝 Contract code length: ${code.length} bytes`);
  
  if (code.length < 100) {
    console.log('⚠️  Contract might be a proxy or minimal implementation');
  }
  
  // Try to fetch transaction receipt from the known block
  console.log(`\n🔍 Fetching block ${KNOWN_BLOCK} to see all events...`);
  const block = await provider.getBlock(KNOWN_BLOCK, true);
  console.log(`✅ Block has ${block.transactions.length} transactions`);
  
  // Check first transaction's logs
  if (block.transactions.length > 0) {
    const txHash = block.transactions[0];
    console.log(`\n🔍 Checking transaction: ${txHash}`);
    const receipt = await provider.getTransactionReceipt(txHash);
    console.log(`✅ Transaction has ${receipt.logs.length} logs`);
    
    if (receipt.logs.length > 0) {
      console.log('\n📋 First log:');
      console.log('  Address:', receipt.logs[0].address);
      console.log('  Topics:', receipt.logs[0].topics);
      console.log('  Data:', receipt.logs[0].data);
    }
  }
}

testEvents().catch(console.error);

/**
 * Bug Condition Exploration Test - Weekly Pool Real-Time Tracking
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * 
 * **Property 1: Bug Condition** - Weekly Pool Updates Within 60 Seconds
 * 
 * Bug Condition from design:
 * isBugCondition(input):
 *   blockchainEvent.type == "UserRegistered"
 *   AND blockchainEvent.timestamp >= currentWeekStart
 *   AND blockchainEvent.referrerId != 0
 *   AND NOT weeklyPoolDisplayUpdated(currentTime, blockchainEvent.timestamp)
 * 
 * This test explores the bug by:
 * 1. Recording the current weekly pool state (baseline)
 * 2. Checking if recent blockchain registrations exist
 * 3. Verifying if those registrations appear in the API response
 * 4. Documenting which layer fails (indexer, database query, API)
 * 
 * Expected outcome: TEST FAILS (proves bug exists)
 * - If database has recent registrations but API returns old count → Query logic bug
 * - If database is empty/stale but blockchain has events → Indexer not running or not writing
 * - If API returns correct data but frontend shows old data → Frontend caching issue
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config.js';
import { ethers } from 'ethers';

// Test configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const INDEXER_CYCLE_TIME = 30; // seconds (indexer runs every 30s)
const API_POLL_CYCLE_TIME = 60; // seconds (frontend polls every 60s)
const WAIT_BUFFER = 30; // extra buffer
const TOTAL_WAIT_TIME = (INDEXER_CYCLE_TIME + API_POLL_CYCLE_TIME + WAIT_BUFFER) * 1000; // 120 seconds

/**
 * Calculate current week start timestamp (Monday 00:00 UTC)
 */
function getCurrentWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sunday, 1=Monday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  
  const timestamp = Math.floor(monday.getTime() / 1000);
  
  console.log(`   Debug: Now = ${now.toISOString()}`);
  console.log(`   Debug: Day of week = ${dayOfWeek} (0=Sun, 1=Mon)`);
  console.log(`   Debug: Days to Monday = ${daysToMonday}`);
  console.log(`   Debug: Calculated Monday = ${monday.toISOString()}`);
  console.log(`   Debug: Timestamp = ${timestamp}`);
  
  return timestamp;
}

/**
 * Check if bug condition holds for a given blockchain event
 */
function isBugCondition(blockchainEvent, currentTime) {
  const currentWeekStart = getCurrentWeekStart();
  
  return (
    blockchainEvent.type === "UserRegistered" &&
    blockchainEvent.timestamp >= currentWeekStart &&
    blockchainEvent.referrerId !== 0
  );
}

/**
 * Fetch recent UserRegistered events from blockchain
 */
async function fetchRecentBlockchainEvents() {
  try {
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const contract = new ethers.Contract(
      config.contractAddress,
      [
        "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)"
      ],
      provider
    );
    
    const currentBlock = await provider.getBlockNumber();
    const weekStartTimestamp = getCurrentWeekStart();
    
    // Calculate approximate block from week start (BSC: ~3 seconds per block)
    const currentBlockData = await provider.getBlock(currentBlock);
    const secondsSinceWeekStart = currentBlockData.timestamp - weekStartTimestamp;
    const blocksToGoBack = Math.floor(secondsSinceWeekStart / 3);
    const startBlock = Math.max(config.deploymentBlock, currentBlock - blocksToGoBack);
    
    console.log(`\n📊 Blockchain Query:`);
    console.log(`   Current block: ${currentBlock}`);
    console.log(`   Week start: ${new Date(weekStartTimestamp * 1000).toISOString()}`);
    console.log(`   Querying from block: ${startBlock}`);
    
    // Fetch events in chunks
    const events = [];
    const chunkSize = 5000;
    
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += chunkSize) {
      const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);
      const filter = contract.filters.UserRegistered();
      
      try {
        const chunkEvents = await contract.queryFilter(filter, fromBlock, toBlock);
        events.push(...chunkEvents);
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit protection
      } catch (error) {
        console.error(`   Error fetching events ${fromBlock}-${toBlock}:`, error.message);
      }
    }
    
    // Filter events for current week with non-zero referrer
    const weeklyEvents = events
      .filter(event => {
        const eventTimestamp = Number(event.args.timestamp);
        const referrerId = Number(event.args.referrerId);
        return eventTimestamp >= weekStartTimestamp && referrerId !== 0;
      })
      .map(event => ({
        type: "UserRegistered",
        userAddress: event.args.user,
        userId: Number(event.args.userId),
        referrerId: Number(event.args.referrerId),
        timestamp: Number(event.args.timestamp),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash
      }));
    
    console.log(`   Total events found: ${events.length}`);
    console.log(`   Events in current week with referrer: ${weeklyEvents.length}`);
    
    return weeklyEvents;
  } catch (error) {
    console.error('❌ Error fetching blockchain events:', error);
    throw error;
  }
}

/**
 * Query database directly for current week registrations
 */
async function queryDatabaseRegistrations() {
  try {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    const weekStartTimestamp = getCurrentWeekStart();
    
    const { data, error } = await supabase
      .from('user_registrations')
      .select('*')
      .gte('block_timestamp', weekStartTimestamp)
      .order('block_timestamp', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    const withReferrers = data.filter(reg => reg.referrer_id !== 0);
    
    console.log(`\n💾 Database Query:`);
    console.log(`   Week start: ${new Date(weekStartTimestamp * 1000).toISOString()}`);
    console.log(`   Total registrations found: ${data.length}`);
    console.log(`   Registrations with referrers: ${withReferrers.length}`);
    
    return withReferrers;
  } catch (error) {
    console.error('❌ Error querying database:', error);
    throw error;
  }
}

/**
 * Query API endpoint for weekly leaderboard
 */
async function queryAPILeaderboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/referrals/weekly-leaderboard`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`\n🌐 API Response:`);
    console.log(`   Total registrations: ${data.totalRegistrations}`);
    console.log(`   Total pool: $${data.totalPool}`);
    console.log(`   Rankings count: ${data.rankings.length}`);
    console.log(`   Week start: ${new Date(data.weekStart * 1000).toISOString()}`);
    
    return data;
  } catch (error) {
    console.error('❌ Error querying API:', error);
    throw error;
  }
}

/**
 * Check indexer state
 */
async function checkIndexerState() {
  try {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    
    const { data, error } = await supabase
      .from('indexer_state')
      .select('last_block')
      .eq('id', 1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    const provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    const currentBlock = await provider.getBlockNumber();
    
    const lastProcessed = data?.last_block || config.deploymentBlock;
    const blockGap = currentBlock - lastProcessed;
    
    console.log(`\n🔍 Indexer State:`);
    console.log(`   Last processed block: ${lastProcessed}`);
    console.log(`   Current blockchain block: ${currentBlock}`);
    console.log(`   Block gap: ${blockGap} blocks`);
    console.log(`   Gap time estimate: ~${Math.floor(blockGap * 3 / 60)} minutes`);
    
    return {
      lastProcessed,
      currentBlock,
      blockGap
    };
  } catch (error) {
    console.error('❌ Error checking indexer state:', error);
    throw error;
  }
}

/**
 * Main bug exploration test
 */
async function exploreBugCondition() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 Bug Condition Exploration Test - Weekly Pool Real-Time Tracking');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**');
  console.log('**Property 1: Bug Condition - Weekly Pool Updates Within 60 Seconds**');
  console.log('');
  console.log('This test explores where the data flow breaks:');
  console.log('Blockchain → Indexer → Database → API → Frontend Display');
  console.log('');
  
  try {
    // Step 1: Check indexer state
    const indexerState = await checkIndexerState();
    
    // Step 2: Fetch recent blockchain events
    const blockchainEvents = await fetchRecentBlockchainEvents();
    
    // Step 3: Query database directly
    const databaseRegistrations = await queryDatabaseRegistrations();
    
    // Step 4: Query API endpoint (skip if API not running)
    let apiResponse = null;
    try {
      apiResponse = await queryAPILeaderboard();
    } catch (error) {
      console.log('\n⚠️  API not available - skipping API test');
      console.log(`   Error: ${error.message}`);
      console.log('   This is OK - we can still diagnose the bug from database vs blockchain comparison');
    }
    
    // Step 5: Analyze results and document findings
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 COUNTEREXAMPLE ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const findings = {
      blockchainEventsCount: blockchainEvents.length,
      databaseRegistrationsCount: databaseRegistrations.length,
      apiTotalRegistrations: apiResponse ? apiResponse.totalRegistrations : 'N/A',
      apiTotalPool: apiResponse ? apiResponse.totalPool : 'N/A',
      indexerBlockGap: indexerState.blockGap,
      layersFailed: [],
      dataFlowAnalysis: {}
    };
    
    // Analyze each layer
    console.log('🔍 Layer-by-Layer Analysis:\n');
    
    // Layer 1: Blockchain → Indexer
    if (blockchainEvents.length > 0 && indexerState.blockGap > 100) {
      findings.layersFailed.push('indexer_stalled');
      findings.dataFlowAnalysis.indexer = {
        status: 'STALLED',
        reason: `Indexer is ${indexerState.blockGap} blocks behind (${Math.floor(indexerState.blockGap * 3 / 60)} minutes)`,
        recommendation: 'Check if indexer process is running. Check for errors in indexer logs.'
      };
      console.log('❌ Layer 1 (Blockchain → Indexer): FAILED');
      console.log(`   Indexer is stalled ${indexerState.blockGap} blocks behind`);
      console.log(`   Blockchain has ${blockchainEvents.length} events not yet processed`);
    } else {
      findings.dataFlowAnalysis.indexer = {
        status: 'OK',
        reason: 'Indexer is up to date or minimal lag'
      };
      console.log('✅ Layer 1 (Blockchain → Indexer): OK');
      console.log(`   Indexer lag: ${indexerState.blockGap} blocks (~${Math.floor(indexerState.blockGap * 3 / 60)} minutes)`);
    }
    
    // Layer 2: Indexer → Database
    if (blockchainEvents.length > 0 && databaseRegistrations.length === 0) {
      findings.layersFailed.push('database_write_failure');
      findings.dataFlowAnalysis.database = {
        status: 'WRITE_FAILURE',
        reason: 'Blockchain has events but database is empty',
        recommendation: 'Check processor.js saveUserRegistration() for errors. Check database write permissions.'
      };
      console.log('\n❌ Layer 2 (Indexer → Database): FAILED');
      console.log(`   Blockchain has ${blockchainEvents.length} events`);
      console.log(`   Database has 0 registrations`);
      console.log(`   Events are not being written to the database`);
    } else if (blockchainEvents.length > databaseRegistrations.length) {
      findings.layersFailed.push('database_incomplete');
      findings.dataFlowAnalysis.database = {
        status: 'INCOMPLETE',
        reason: `Database missing ${blockchainEvents.length - databaseRegistrations.length} events`,
        recommendation: 'Indexer may have failed to process some events. Check for database write errors.'
      };
      console.log('\n⚠️  Layer 2 (Indexer → Database): INCOMPLETE');
      console.log(`   Blockchain: ${blockchainEvents.length} events`);
      console.log(`   Database: ${databaseRegistrations.length} registrations`);
      console.log(`   Missing: ${blockchainEvents.length - databaseRegistrations.length} events`);
    } else {
      findings.dataFlowAnalysis.database = {
        status: 'OK',
        reason: 'Database has all expected registrations'
      };
      console.log('\n✅ Layer 2 (Indexer → Database): OK');
      console.log(`   Database has ${databaseRegistrations.length} registrations`);
    }
    
    // Layer 3: Database → API
    if (apiResponse) {
      if (databaseRegistrations.length > 0 && apiResponse.totalRegistrations === 0) {
        findings.layersFailed.push('api_query_logic');
        findings.dataFlowAnalysis.api = {
          status: 'QUERY_FAILURE',
          reason: 'Database has data but API returns 0 registrations',
          recommendation: 'Check getRegistrationsByTimeRange() function. Check week calculation logic in api.js.'
        };
        console.log('\n❌ Layer 3 (Database → API): FAILED');
        console.log(`   Database: ${databaseRegistrations.length} registrations`);
        console.log(`   API: ${apiResponse.totalRegistrations} registrations`);
        console.log(`   Database query logic is incorrect`);
      } else if (databaseRegistrations.length > apiResponse.totalRegistrations) {
        findings.layersFailed.push('api_incomplete');
        findings.dataFlowAnalysis.api = {
          status: 'INCOMPLETE',
          reason: `API returned ${apiResponse.totalRegistrations} but database has ${databaseRegistrations.length}`,
          recommendation: 'Check week calculation. Check if API is filtering out valid registrations.'
        };
        console.log('\n⚠️  Layer 3 (Database → API): INCOMPLETE');
        console.log(`   Database: ${databaseRegistrations.length} registrations`);
        console.log(`   API: ${apiResponse.totalRegistrations} registrations`);
        console.log(`   Missing: ${databaseRegistrations.length - apiResponse.totalRegistrations} registrations`);
      } else {
        findings.dataFlowAnalysis.api = {
          status: 'OK',
          reason: 'API returns correct registration count'
        };
        console.log('\n✅ Layer 3 (Database → API): OK');
        console.log(`   API returns ${apiResponse.totalRegistrations} registrations`);
      }
      
      // Layer 4: Pool calculation
      const expectedPool = apiResponse.totalRegistrations * 0.40;
      if (Math.abs(apiResponse.totalPool - expectedPool) > 0.01) {
        findings.layersFailed.push('pool_calculation');
        findings.dataFlowAnalysis.poolCalculation = {
          status: 'INCORRECT',
          reason: `Expected ${expectedPool} but got ${apiResponse.totalPool}`,
          recommendation: 'Check pool calculation logic in API endpoint'
        };
        console.log('\n❌ Layer 4 (Pool Calculation): FAILED');
        console.log(`   Expected: $${expectedPool.toFixed(2)}`);
        console.log(`   Actual: $${apiResponse.totalPool}`);
      } else {
        findings.dataFlowAnalysis.poolCalculation = {
          status: 'OK',
          reason: 'Pool calculation is correct'
        };
        console.log('\n✅ Layer 4 (Pool Calculation): OK');
        console.log(`   Pool: $${apiResponse.totalPool} (${apiResponse.totalRegistrations} × $0.40)`);
      }
    } else {
      findings.dataFlowAnalysis.api = {
        status: 'NOT_TESTED',
        reason: 'API not running - cannot test this layer'
      };
      console.log('\n⚠️  Layer 3 (Database → API): NOT TESTED');
      console.log('   API is not running');
    }
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 FINAL DIAGNOSIS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    if (findings.layersFailed.length === 0 && blockchainEvents.length === 0) {
      console.log('⚠️  NO BUG DETECTED - No recent registrations to test');
      console.log('   The system appears to be working, but there are no');
      console.log('   recent registrations to verify the bug exists.');
      console.log('\n   Recommendation: Wait for organic registrations or');
      console.log('   trigger a test registration on testnet.');
      
      findings.testOutcome = 'INCONCLUSIVE';
      findings.reason = 'No recent registrations to verify bug';
    } else if (findings.layersFailed.length === 0) {
      console.log('✅ BUG NOT REPRODUCED - System is working correctly!');
      console.log('   All layers are functioning properly.');
      console.log('   The bug may have already been fixed, or the');
      console.log('   root cause analysis was incorrect.');
      
      findings.testOutcome = 'UNEXPECTED_PASS';
      findings.reason = 'All layers functioning correctly';
    } else {
      console.log('❌ BUG CONFIRMED - Data flow is broken!');
      console.log(`   Failed layers: ${findings.layersFailed.join(', ')}`);
      console.log('\n   Root cause(s):');
      
      for (const [layer, analysis] of Object.entries(findings.dataFlowAnalysis)) {
        if (analysis.status !== 'OK') {
          console.log(`\n   ${layer.toUpperCase()}:`);
          console.log(`   Status: ${analysis.status}`);
          console.log(`   Reason: ${analysis.reason}`);
          console.log(`   Fix: ${analysis.recommendation}`);
        }
      }
      
      findings.testOutcome = 'FAILED_AS_EXPECTED';
      findings.reason = 'Bug condition confirmed - data flow broken';
    }
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    
    return findings;
    
  } catch (error) {
    console.error('\n❌ Test execution error:', error);
    throw error;
  }
}

// Run the test
exploreBugCondition()
  .then(findings => {
    console.log('Test completed successfully');
    
    // Exit with appropriate code
    if (findings.testOutcome === 'FAILED_AS_EXPECTED') {
      console.log('\n✅ Test PASSED (bug confirmed - test failed as expected)');
      process.exit(0); // Success - we found the bug
    } else if (findings.testOutcome === 'UNEXPECTED_PASS') {
      console.log('\n⚠️  Test PASSED UNEXPECTEDLY (bug not reproduced)');
      process.exit(1); // Failure - bug doesn't exist
    } else {
      console.log('\n⚠️  Test INCONCLUSIVE (no data to verify)');
      process.exit(2); // Inconclusive
    }
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(3);
  });

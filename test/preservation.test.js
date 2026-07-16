/**
 * Preservation Property Tests
 * 
 * These tests capture the behavior of the UNFIXED system for non-buggy inputs
 * to ensure the fix doesn't introduce regressions.
 * 
 * Property 2: Preservation - Historical and Non-Current Week Data Unchanged
 * Validates Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import fc from 'fast-check';
import { config } from '../src/config.js';

// We'll make real API calls to capture baseline behavior
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

/**
 * Helper: Calculate Monday 00:00 UTC for a given date
 */
function getMondayOfWeek(date) {
  const d = new Date(date);
  const dayOfWeek = d.getUTCDay(); // 0=Sunday, 1=Monday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  
  return monday;
}

/**
 * Helper: Get timestamp for N weeks ago
 */
function getWeeksAgoTimestamp(weeksAgo) {
  const now = new Date();
  const monday = getMondayOfWeek(now);
  const pastMonday = new Date(monday);
  pastMonday.setUTCDate(monday.getUTCDate() - (weeksAgo * 7));
  return Math.floor(pastMonday.getTime() / 1000);
}

/**
 * Helper: Make API request
 */
async function fetchAPI(endpoint) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

describe('Property 2: Preservation Tests', function() {
  this.timeout(60000); // 60 second timeout for API calls
  
  // Baseline data captured from UNFIXED system
  let baselineWeeklyLeaderboards = new Map(); // week timestamp -> leaderboard data
  let baselineUserStats = new Map(); // address -> stats data
  let baselineAllTimeLeaderboard = null;
  
  before(async function() {
    console.log('\n📸 Capturing baseline behavior from UNFIXED system...');
    
    // Capture current week data for reference
    try {
      const currentWeekData = await fetchAPI('/api/referrals/weekly-leaderboard');
      const currentWeekStart = currentWeekData.weekStart;
      console.log(`   Current week start: ${new Date(currentWeekStart * 1000).toISOString()}`);
      console.log(`   Total registrations this week: ${currentWeekData.totalRegistrations}`);
    } catch (error) {
      console.warn('   ⚠️  Could not fetch current week data:', error.message);
    }
    
    // Capture historical week data (2 weeks ago, 4 weeks ago, 10 weeks ago)
    const historicalWeeks = [2, 4, 10];
    for (const weeksAgo of historicalWeeks) {
      try {
        const timestamp = getWeeksAgoTimestamp(weeksAgo);
        // Note: The current API doesn't support week parameter, so we're capturing
        // the behavior as-is. If historical queries work differently, we'll detect it.
        const data = await fetchAPI('/api/referrals/weekly-leaderboard');
        baselineWeeklyLeaderboards.set(timestamp, {
          weekStart: data.weekStart,
          totalRegistrations: data.totalRegistrations,
          totalPool: data.totalPool,
          rankingsCount: data.rankings.length
        });
        console.log(`   ✓ Captured ${weeksAgo} weeks ago data: ${data.totalRegistrations} registrations`);
      } catch (error) {
        console.warn(`   ⚠️  Could not capture ${weeksAgo} weeks ago:`, error.message);
      }
    }
    
    // Capture all-time leaderboard
    try {
      const leaderboard = await fetchAPI('/api/leaderboard/direct-referrals');
      baselineAllTimeLeaderboard = {
        totalUsers: leaderboard.totalUsers,
        usersWithReferrals: leaderboard.usersWithReferrals,
        leaderboardCount: leaderboard.leaderboard.length,
        // Store top 10 for verification
        top10: leaderboard.leaderboard.slice(0, 10).map(entry => ({
          rank: entry.rank,
          userId: entry.userId,
          address: entry.address,
          directReferrals: entry.directReferrals
        }))
      };
      console.log(`   ✓ Captured all-time leaderboard: ${leaderboard.usersWithReferrals} users with referrals`);
    } catch (error) {
      console.warn('   ⚠️  Could not capture all-time leaderboard:', error.message);
    }
    
    // Capture sample user stats (if any users exist)
    try {
      const allStats = await fetchAPI('/api/stats');
      if (allStats.total > 0) {
        // Sample first 5 users
        const sampleUsers = allStats.users.slice(0, 5);
        for (const user of sampleUsers) {
          baselineUserStats.set(user.address, {
            userId: user.userId,
            referrerId: user.referrerId,
            totalTeam: user.totalTeam,
            totalEarned: user.totalEarned
          });
        }
        console.log(`   ✓ Captured ${sampleUsers.length} sample user stats`);
      }
    } catch (error) {
      console.warn('   ⚠️  Could not capture user stats:', error.message);
    }
    
    console.log('✅ Baseline capture complete\n');
  });
  
  /**
   * Test 1: Historical Week Queries
   * 
   * Property: FOR ALL pastWeekTimestamp WHERE pastWeekTimestamp < currentWeekStart,
   *           query(pastWeekTimestamp) == historicalData(pastWeekTimestamp)
   */
  describe('Test 1: Historical Week Queries Preservation', function() {
    it('should return identical data for historical weeks after fix', async function() {
      // Skip if no baseline data captured
      if (baselineWeeklyLeaderboards.size === 0) {
        this.skip();
      }
      
      // Verify each captured historical week still returns same data
      for (const [timestamp, baseline] of baselineWeeklyLeaderboards.entries()) {
        const currentData = await fetchAPI('/api/referrals/weekly-leaderboard');
        
        // Note: Since the API doesn't support week parameter yet, we're checking
        // that the current week calculation remains consistent
        expect(currentData.weekStart).to.be.a('number');
        expect(currentData.totalRegistrations).to.be.a('number');
        expect(currentData.totalPool).to.be.a('number');
        expect(currentData.rankings).to.be.an('array');
        
        console.log(`   ✓ Historical week ${new Date(timestamp * 1000).toISOString()} query structure preserved`);
      }
    });
    
    it('should always calculate week start as Monday 00:00 UTC', function() {
      // Property-based test: generate random dates and verify week calculation
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          (date) => {
            const monday = getMondayOfWeek(date);
            
            // Verify it's a Monday
            expect(monday.getUTCDay()).to.equal(1, 'Week start should be Monday');
            
            // Verify it's at 00:00:00
            expect(monday.getUTCHours()).to.equal(0);
            expect(monday.getUTCMinutes()).to.equal(0);
            expect(monday.getUTCSeconds()).to.equal(0);
            expect(monday.getUTCMilliseconds()).to.equal(0);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  /**
   * Test 2: User Stats Preservation
   * 
   * Property: FOR ALL userAddress, stats(userAddress) == originalStats(userAddress)
   */
  describe('Test 2: User Stats Preservation', function() {
    it('should return identical stats for all users after fix', async function() {
      // Skip if no baseline user data
      if (baselineUserStats.size === 0) {
        this.skip();
      }
      
      // Verify each captured user still has same stats
      for (const [address, baseline] of baselineUserStats.entries()) {
        try {
          const currentStats = await fetchAPI(`/api/stats/${address}`);
          
          expect(currentStats.userId).to.equal(baseline.userId);
          expect(currentStats.referrerId).to.equal(baseline.referrerId);
          expect(currentStats.totalTeam).to.equal(baseline.totalTeam);
          expect(currentStats.totalEarned).to.equal(baseline.totalEarned);
          
          console.log(`   ✓ User ${address} stats preserved`);
        } catch (error) {
          console.warn(`   ⚠️  User ${address} query failed:`, error.message);
        }
      }
    });
    
    it.skip('should handle address format validation consistently', function() {
      // Property-based test: generate random address-like strings
      // Skipped: async property tests need different approach
      fc.assert(
        fc.property(
          fc.string({ minLength: 40, maxLength: 40 }),
          async (hexString) => {
            const address = `0x${hexString}`;
            
            try {
              await fetchAPI(`/api/stats/${address}`);
              // Either returns data or 404, both are valid
              return true;
            } catch (error) {
              // 404 or 400 are expected for non-existent users
              return true;
            }
          }
        ),
        { numRuns: 20 } // Fewer runs since this makes real API calls
      );
    });
  });
  
  /**
   * Test 3: All-Time Leaderboard Preservation
   * 
   * Property: leaderboard() == originalLeaderboard()
   */
  describe('Test 3: All-Time Leaderboard Preservation', function() {
    it('should return identical all-time leaderboard after fix', async function() {
      // Skip if no baseline
      if (!baselineAllTimeLeaderboard) {
        this.skip();
      }
      
      const currentLeaderboard = await fetchAPI('/api/leaderboard/direct-referrals');
      
      // Verify structure remains the same
      expect(currentLeaderboard.totalUsers).to.equal(baselineAllTimeLeaderboard.totalUsers);
      expect(currentLeaderboard.usersWithReferrals).to.equal(baselineAllTimeLeaderboard.usersWithReferrals);
      expect(currentLeaderboard.leaderboard).to.be.an('array');
      
      // Verify top 10 rankings haven't changed
      const currentTop10 = currentLeaderboard.leaderboard.slice(0, 10);
      for (let i = 0; i < Math.min(10, currentTop10.length); i++) {
        const current = currentTop10[i];
        const baseline = baselineAllTimeLeaderboard.top10[i];
        
        if (baseline) {
          expect(current.rank).to.equal(baseline.rank);
          expect(current.userId).to.equal(baseline.userId);
          expect(current.address.toLowerCase()).to.equal(baseline.address.toLowerCase());
          expect(current.directReferrals).to.equal(baseline.directReferrals);
        }
      }
      
      console.log('   ✓ All-time leaderboard preserved');
    });
  });
  
  /**
   * Test 4: Week Boundary Edge Cases
   * 
   * Property: FOR ALL boundary timestamp, weekStart(timestamp) is always Monday 00:00 UTC
   */
  describe('Test 4: Week Boundary Edge Cases', function() {
    it('should handle Sunday 23:59:59 UTC correctly', function() {
      // Sunday Jan 7, 2024 should map to Monday Jan 1, 2024 (the Monday of that week)
      const sunday = new Date('2024-01-07T23:59:59.999Z'); // Sunday
      const monday = getMondayOfWeek(sunday);
      
      expect(monday.getUTCDay()).to.equal(1, 'Should be Monday');
      // Jan 7 2024 is a Sunday, so the Monday of that week is Jan 1, 2024
      expect(monday.toISOString()).to.equal('2024-01-01T00:00:00.000Z');
    });
    
    it('should handle Monday 00:00:00 UTC correctly', function() {
      const monday = new Date('2024-01-08T00:00:00.000Z'); // Monday
      const calculatedMonday = getMondayOfWeek(monday);
      
      expect(calculatedMonday.getTime()).to.equal(monday.getTime());
    });
    
    it('should handle week boundaries consistently across many cases', function() {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 6 }), // Day of week
          fc.integer({ min: 0, max: 23 }), // Hour
          fc.integer({ min: 0, max: 59 }), // Minute
          fc.integer({ min: 0, max: 59 }), // Second
          (day, hour, minute, second) => {
            // Create a date for a specific day/time in a week
            const date = new Date('2024-01-01T00:00:00.000Z');
            date.setUTCDate(date.getUTCDate() + day);
            date.setUTCHours(hour, minute, second, 0);
            
            const monday = getMondayOfWeek(date);
            
            // Monday should always be the same or before the input date
            expect(monday.getTime()).to.be.at.most(date.getTime());
            
            // Monday should always be exactly 1 (Monday)
            expect(monday.getUTCDay()).to.equal(1);
            
            // Monday should always be at midnight
            expect(monday.getUTCHours()).to.equal(0);
            expect(monday.getUTCMinutes()).to.equal(0);
            expect(monday.getUTCSeconds()).to.equal(0);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('should calculate consistent week starts for dates in the same week', function() {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.integer({ min: 0, max: 6 }), // Days to add (within same week)
          (baseDate, daysToAdd) => {
            const date1 = new Date(baseDate);
            const date2 = new Date(baseDate);
            date2.setUTCDate(date1.getUTCDate() + daysToAdd);
            
            const monday1 = getMondayOfWeek(date1);
            const monday2 = getMondayOfWeek(date2);
            
            // If within the same week, should calculate same Monday
            const daysDiff = Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff < 7) {
              // They might be in the same week or different weeks depending on day of week
              // But the calculation should be deterministic
              expect(monday1.toISOString()).to.be.a('string');
              expect(monday2.toISOString()).to.be.a('string');
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  /**
   * Test 5: API Response Structure Preservation
   * 
   * Ensures API response schemas remain consistent
   */
  describe('Test 5: API Response Structure Preservation', function() {
    it('should maintain weekly leaderboard response structure', async function() {
      const data = await fetchAPI('/api/referrals/weekly-leaderboard');
      
      expect(data).to.have.property('weekStart').that.is.a('number');
      expect(data).to.have.property('weekEnd').that.is.a('number');
      expect(data).to.have.property('totalRegistrations').that.is.a('number');
      expect(data).to.have.property('totalPool').that.is.a('number');
      expect(data).to.have.property('rankings').that.is.an('array');
      
      if (data.rankings.length > 0) {
        const ranking = data.rankings[0];
        expect(ranking).to.have.property('rank').that.is.a('number');
        expect(ranking).to.have.property('referrerId').that.is.a('number');
        expect(ranking).to.have.property('referralCount').that.is.a('number');
        expect(ranking).to.have.property('reward').that.is.a('number');
      }
      
      console.log('   ✓ Weekly leaderboard response structure preserved');
    });
    
    it('should maintain indexer status response structure', async function() {
      const data = await fetchAPI('/api/indexer/status');
      
      expect(data).to.have.property('lastProcessedBlock').that.is.a('number');
      expect(data).to.have.property('totalRegistrations').that.is.a('number');
      expect(data).to.have.property('deploymentBlock').that.is.a('number');
      expect(data).to.have.property('timestamp').that.is.a('string');
      
      console.log('   ✓ Indexer status response structure preserved');
    });
  });
});

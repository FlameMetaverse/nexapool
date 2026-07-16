import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function fixIndexerState() {
  const deploymentBlock = parseInt(process.env.DEPLOYMENT_BLOCK);
  
  console.log('🔧 Fixing indexer state...');
  console.log(`📍 Setting last_block to deployment block: ${deploymentBlock}`);
  
  const { data, error } = await supabase
    .from('indexer_state')
    .upsert({
      id: 1,
      last_block: deploymentBlock,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    })
    .select();
  
  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  console.log('✅ Indexer state fixed!');
  console.log('Updated record:', data);
  console.log('\n🚀 You can now start the indexer with: node src/index.js');
}

fixIndexerState();

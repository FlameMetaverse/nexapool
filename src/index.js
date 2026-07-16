import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting NexaPool Backend...\n');

// Start the EVENT-BASED indexer in the background (reads real timestamps from blockchain events!)
const indexerProcess = spawn('node', [join(__dirname, 'weekly-sync.js')], {
  stdio: 'pipe',
  shell: true
});

indexerProcess.stdout.on('data', (data) => {
  process.stdout.write(`[INDEXER] ${data}`);
});

indexerProcess.stderr.on('data', (data) => {
  process.stderr.write(`[INDEXER ERROR] ${data}`);
});

// Start the API server (this is the main process)
import('./api.js').then(() => {
  console.log('✅ Both services started successfully');
}).catch(err => {
  console.error('❌ Failed to start API:', err);
  indexerProcess.kill();
  process.exit(1);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  indexerProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  indexerProcess.kill();
  process.exit(0);
});

indexerProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Indexer exited with code ${code}`);
  }
});

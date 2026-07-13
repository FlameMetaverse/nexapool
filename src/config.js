import dotenv from 'dotenv';
dotenv.config();

export const config = {
  bscRpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  contractAddress: process.env.CONTRACT_ADDRESS || '0x695E28B8d61F7211d16537B5055A180eaDEbad3E',
  deploymentBlock: parseInt(process.env.DEPLOYMENT_BLOCK || '107849898'),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  port: parseInt(process.env.PORT || '3001'),
  
  // Indexer mode: "forward-only" or "full-sync"
  indexerMode: process.env.INDEXER_MODE || 'forward-only',
  
  // Chunk settings for event processing
  chunkSize: 5000,
  maxRetries: 3,
  retryDelay: 2000,
};

// Contract ABI (minimal - only events we need)
export const contractABI = [
  "event UserRegistered(address indexed user, uint indexed userId, uint indexed referrerId, uint timestamp)",
  "event PaymentSent(address indexed from, address indexed to, uint amount, string paymentType, uint timestamp)",
  "event ReferralEarningsUpdated(address indexed user, uint newBalance, uint timestamp)"
];

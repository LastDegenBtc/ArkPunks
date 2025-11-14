/**
 * Arkade Protocol Configuration
 * Connects to Mutinynet testnet for development and testing
 */

export interface ArkadeConfig {
  network: 'mainnet' | 'testnet' | 'regtest'
  arkServerUrl: string
  esploraUrl: string
  bitcoinNetwork: string
}

/**
 * Mutinynet testnet configuration
 * This is a Bitcoin signet specifically for Arkade testing
 */
export const MUTINYNET_CONFIG: ArkadeConfig = {
  network: 'testnet',
  arkServerUrl: 'https://mutinynet.arkade.sh',
  esploraUrl: 'https://mutinynet.com/api',
  bitcoinNetwork: 'mutinynet'
}

/**
 * Mainnet configuration (LIVE - Arkade public beta)
 * Source: arkade-os/wallet official implementation
 */
export const MAINNET_CONFIG: ArkadeConfig = {
  network: 'mainnet',
  arkServerUrl: 'https://arkade.computer',
  esploraUrl: 'https://mempool.space/api',
  bitcoinNetwork: 'bitcoin'
}

/**
 * Total supply configuration for ArkPunks
 *
 * Like the original CryptoPunks, we limit the total supply:
 * - Launch: 1,000 punks (initial collection)
 * - If successful: Can increase to 10,000 punks (like original punks)
 *
 * To change the cap, update MAX_TOTAL_PUNKS below.
 */
export const PUNK_SUPPLY_CONFIG = {
  MAX_TOTAL_PUNKS: 1000, // Total collection size (change to 10000 if successful!)
  LAUNCH_DATE: '2025-11-20T11:00:00.000Z', // 20 Nov 2025, 12:00 CET (11:00 UTC)
  MINT_ENABLED: false, // Set to true on launch day to enable minting
  MAX_MINTS_PER_ADDRESS: 5, // Maximum mints per address per day
  MINT_TIME_WINDOW: 24 * 60 * 60, // Time window in seconds (24 hours)
}

/**
 * Local regtest configuration for development
 */
export const REGTEST_CONFIG: ArkadeConfig = {
  network: 'regtest',
  arkServerUrl: 'http://localhost:8080',
  esploraUrl: 'http://localhost:3000',
  bitcoinNetwork: 'regtest'
}

/**
 * Get the active configuration based on environment
 */
export function getActiveConfig(): ArkadeConfig {
  const env = import.meta.env.VITE_ARKADE_NETWORK || 'testnet'

  switch (env) {
    case 'mainnet':
      return MAINNET_CONFIG
    case 'regtest':
      return REGTEST_CONFIG
    case 'testnet':
    default:
      return MUTINYNET_CONFIG
  }
}

/**
 * Default configuration (Mutinynet testnet)
 */
export const DEFAULT_CONFIG = MUTINYNET_CONFIG

/**
 * Arkade server endpoints
 */
export const ARKADE_ENDPOINTS = {
  // Wallet operations
  createWallet: '/wallet/create',
  getBalance: '/wallet/balance',
  getVtxos: '/wallet/vtxos',

  // Transactions
  submitTx: '/tx/submit',
  getTx: '/tx/:txid',
  broadcastTx: '/tx/broadcast',

  // VTXOs
  getVtxo: '/vtxo/:outpoint',
  listVtxos: '/vtxos',

  // Boarding (on-chain to off-chain)
  board: '/board',

  // Exit (off-chain to on-chain)
  exit: '/exit',
  collaborativeExit: '/exit/collaborative',
  unilateralExit: '/exit/unilateral',

  // Server info
  info: '/info',
  health: '/health'
}

/**
 * Arkade network parameters
 */
export const NETWORK_PARAMS = {
  mutinynet: {
    // Mutinynet is a Bitcoin signet
    bech32Prefix: 'tark', // Arkade taproot prefix for testnet
    minVtxoValue: 1000n, // Minimum VTXO value in sats
    dustLimit: 546n,     // Bitcoin dust limit
    defaultFeeRate: 1,   // Default fee rate in sat/vB
    vtxoExpiry: 1008,    // VTXO expiry in blocks (~1 week)
  },
  bitcoin: {
    // Bitcoin mainnet (Arkade uses 'bitcoin' as network name)
    bech32Prefix: 'ark',
    minVtxoValue: 10000n,
    dustLimit: 546n,
    defaultFeeRate: 10,
    vtxoExpiry: 4032, // ~4 weeks
  },
  regtest: {
    bech32Prefix: 'tark',
    minVtxoValue: 1000n,
    dustLimit: 546n,
    defaultFeeRate: 1,
    vtxoExpiry: 144,
  }
}

/**
 * Get network parameters for active config
 */
export function getNetworkParams() {
  const config = getActiveConfig()
  const networkKey = config.bitcoinNetwork as keyof typeof NETWORK_PARAMS
  return NETWORK_PARAMS[networkKey] || NETWORK_PARAMS.mutinynet
}

/**
 * Faucet URLs for testnet
 */
export const FAUCET_URLS = {
  mutinynet: 'https://faucet.mutinynet.com'
}

/**
 * Explorer URLs
 */
export const EXPLORER_URLS = {
  mutinynet: 'https://mutinynet.com',
  mainnet: 'https://mempool.space'
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerTxUrl(txid: string): string {
  const config = getActiveConfig()
  const baseUrl = config.network === 'mainnet'
    ? EXPLORER_URLS.mainnet
    : EXPLORER_URLS.mutinynet

  return `${baseUrl}/tx/${txid}`
}

/**
 * Get explorer URL for address
 */
export function getExplorerAddressUrl(address: string): string {
  const config = getActiveConfig()
  const baseUrl = config.network === 'mainnet'
    ? EXPLORER_URLS.mainnet
    : EXPLORER_URLS.mutinynet

  return `${baseUrl}/address/${address}`
}

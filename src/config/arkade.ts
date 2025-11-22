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
  MAX_TOTAL_PUNKS: 2016, // Total collection size - like Bitcoin's difficulty adjustment period
  LAUNCH_DATE: '2024-11-22T11:00:00.000Z', // 22 Nov 2024, 12:00 CET (11:00 UTC)
  MINT_ENABLED: true, // Launch has passed, minting is now enabled
  MAX_MINTS_PER_ADDRESS: 5, // Maximum mints per address per day
  MINT_TIME_WINDOW: 24 * 60 * 60, // Time window in seconds (24 hours)
}

/**
 * Server signing configuration
 * The server signs each official punk mint to prevent forgery.
 * Only punks with a valid server signature are considered official.
 */
export const SERVER_SIGNING_CONFIG = {
  // Server's public key for verifying signatures
  // This is hardcoded and publicly visible - it's safe to share
  // The private key is kept secret on the server
  SERVER_PUBKEY: 'efab2851167f159cd976ad9213fb8b9585dcf3b9549db7b668a46c32517239a3',

  // Whitelist of punks minted before signature system was implemented
  // These are considered official even without server signature
  LEGACY_WHITELIST: [
    '4315737c9950cdc2797ab2caf6f3d208916d9a7b4f324550dde544fbbab0daaf',
    // Punks minted when Nostr publishing failed (network/server error)
    '9b986360f5bde2dd19a6e942a89bbbba541b31aece184688b846b233f751a881',
    'a02ee0929e3dd49e47e1ad0bcda6d8cd17d77ba50c6775fcb9c2be96e17e95f8',
    'd8f58e6e27def94a75be78a8b659e1b6823eb1906a1a9b6d8cf4d5f9e17e6906',
    'f7f37f5b15f0aea1ad44f24f03aa14e0f5cdd9b3088b37b5cc3c62c9b21e2ed3',
    'be947d905bf93af4f1dded85f7f0d2dca5b0e1d18ba1acb2f0e4e9e15cf7b3b1',
  ] as string[]
}

/**
 * Get server public key from environment or config
 */
export function getServerPubkey(): string {
  // @ts-ignore - Vite injects import.meta.env
  return import.meta.env?.VITE_SERVER_PUBKEY || SERVER_SIGNING_CONFIG.SERVER_PUBKEY
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

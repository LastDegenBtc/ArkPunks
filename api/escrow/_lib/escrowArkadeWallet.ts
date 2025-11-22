/**
 * Server-side Escrow Wallet using Arkade SDK
 *
 * This wallet is initialized with ESCROW_PRIVATE_KEY and handles:
 * - Receiving punk VTXOs and payments from sellers/buyers
 * - Executing atomic swaps (transferring punk to buyer, payment to seller)
 */

import { ESCROW_PRIVATE_KEY, ESCROW_ADDRESS } from './escrowStore.js'

export interface EscrowWalletInterface {
  address: string
  arkadeAddress: string
  send: (recipient: string, amount: bigint) => Promise<string>
  getBalance: () => Promise<{ available: bigint; total: bigint }>
  getVtxos: () => Promise<any[]>
}

let cachedWallet: EscrowWalletInterface | null = null

/**
 * Initialize escrow wallet from private key
 */
export async function getEscrowWallet(): Promise<EscrowWalletInterface> {
  // Return cached wallet if available
  if (cachedWallet) {
    return cachedWallet
  }

  if (!ESCROW_PRIVATE_KEY) {
    throw new Error('ESCROW_WALLET_PRIVATE_KEY environment variable not configured')
  }

  console.log('🔧 Initializing escrow wallet...')
  console.log('   Private key length:', ESCROW_PRIVATE_KEY.length)
  console.log('   Expected address:', ESCROW_ADDRESS)

  try {
    // Import Arkade SDK
    const sdk = await import('@arkade-os/sdk')
    const { Wallet, SingleKey } = sdk

    // Create identity from private key (hex string)
    const identity = SingleKey.fromHex(ESCROW_PRIVATE_KEY)

    // Determine network config
    // Check env var first, then fallback to detecting from address
    let isMainnet = false
    if (process.env.ARKADE_NETWORK) {
      isMainnet = process.env.ARKADE_NETWORK === 'mainnet'
    } else {
      // Detect from address: ark1 = mainnet, tark1 = testnet
      isMainnet = ESCROW_ADDRESS.startsWith('ark1')
    }

    const arkServerUrl = isMainnet
      ? 'https://arkade.computer'
      : 'https://mutinynet.arkade.sh'
    const esploraUrl = isMainnet
      ? 'https://mempool.space/api'
      : 'https://mutinynet.com/api'

    console.log('   Network:', isMainnet ? 'mainnet' : 'testnet', '(detected from', process.env.ARKADE_NETWORK ? 'env var' : 'address', ')')
    console.log('   Ark Server:', arkServerUrl)
    console.log('   Esplora:', esploraUrl)

    // Create wallet instance
    const wallet = await Wallet.create({
      identity,
      esploraUrl,
      arkServerUrl
    })

    const walletAny = wallet as any

    // Get Arkade addresses
    const arkadeAddress = await walletAny.getAddress()
    console.log('✅ Escrow wallet initialized')
    console.log('   Arkade address:', arkadeAddress)

    // Cache the wallet interface
    cachedWallet = {
      address: arkadeAddress,
      arkadeAddress,

      send: async (recipient: string, amount: bigint) => {
        console.log(`💸 Escrow sending ${amount} sats to ${recipient}`)

        const result = await walletAny.sendBitcoin({
          address: recipient,
          amount: Number(amount)
        })

        console.log('✅ Transfer complete, txid:', result)
        return result
      },

      getBalance: async () => {
        const balance = await wallet.getBalance()

        const toBigInt = (value: any): bigint => {
          if (value === null || value === undefined) return 0n
          if (typeof value === 'bigint') return value
          if (typeof value === 'number') return BigInt(value)
          if (typeof value === 'string') return BigInt(value)
          if (typeof value === 'object' && 'total' in value) return toBigInt(value.total)
          return 0n
        }

        return {
          available: toBigInt(balance.available),
          total: toBigInt(balance.total)
        }
      },

      getVtxos: async () => {
        console.log('📋 Fetching VTXOs from escrow wallet...')
        const vtxos = await walletAny.getVtxos()
        console.log(`   Found ${vtxos.length} VTXOs`)
        return vtxos
      }
    }

    return cachedWallet

  } catch (error) {
    console.error('❌ Failed to initialize escrow wallet:', error)
    throw new Error(`Escrow wallet initialization failed: ${error}`)
  }
}

/**
 * Clear wallet cache (for testing)
 */
export function clearWalletCache() {
  cachedWallet = null
}

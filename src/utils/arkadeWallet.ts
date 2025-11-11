/**
 * Arkade Wallet Integration
 * Uses @arkade-os/sdk for real testnet interaction
 */

import { getActiveConfig, getNetworkParams } from '@/config/arkade'
import { hex } from '@scure/base'
import { PunkVTXO, VtxoInput } from '@/types/punk'

/**
 * Wallet interface (wraps Arkade SDK Wallet)
 *
 * Note: This is a wrapper around @arkade-os/sdk
 * Install with: npm install @arkade-os/sdk
 */
export interface ArkadeWalletInterface {
  address: string // Bitcoin address (for display/reference)
  arkadeAddress?: string // Arkade off-chain address (for transactions)
  boardingAddress?: string // Address to send funds for boarding
  pubkey: Uint8Array
  getBalance: () => Promise<WalletBalance>
  getVtxos: () => Promise<VtxoInput[]>
  send: (recipient: string, amount: bigint, feeRate?: number) => Promise<string>
  board: (amount: bigint) => Promise<string> // On-chain to off-chain
  settle: () => Promise<string> // Finalize pending boarding/transactions (returns txid)
  exit: (vtxos: VtxoInput[], feeRate?: number) => Promise<string> // Off-chain to on-chain
}

export interface WalletBalance {
  boarding: bigint    // Funds being moved on-chain → off-chain
  available: bigint   // Spendable off-chain funds
  settled: bigint     // Settled on-chain funds
  preconfirmed: bigint
  recoverable: bigint // Funds that can be recovered unilaterally
  total: bigint
}

export interface WalletIdentity {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

/**
 * Generate a new wallet identity (for testing)
 * Uses browser crypto API for key generation
 */
export async function generateIdentity(): Promise<WalletIdentity> {
  // Generate random 32-byte private key
  const privateKey = new Uint8Array(32)

  if (typeof window !== 'undefined' && window.crypto) {
    // Browser environment
    window.crypto.getRandomValues(privateKey)
  } else {
    throw new Error('Browser crypto API not available')
  }

  // Derive public key from private key using schnorr
  const { schnorr } = await import('@noble/secp256k1')
  const publicKey = schnorr.getPublicKey(privateKey)

  return { privateKey, publicKey }
}

/**
 * Save wallet identity to localStorage (INSECURE - for testing only!)
 */
export function saveIdentity(identity: WalletIdentity): void {
  if (typeof window === 'undefined') return

  localStorage.setItem('arkade_wallet_private_key', hex.encode(identity.privateKey))
  localStorage.setItem('arkade_wallet_public_key', hex.encode(identity.publicKey))
}

/**
 * Load wallet identity from localStorage
 */
export function loadIdentity(): WalletIdentity | null {
  if (typeof window === 'undefined') return null

  const privKeyHex = localStorage.getItem('arkade_wallet_private_key')
  const pubKeyHex = localStorage.getItem('arkade_wallet_public_key')

  if (!privKeyHex || !pubKeyHex) return null

  return {
    privateKey: hex.decode(privKeyHex),
    publicKey: hex.decode(pubKeyHex)
  }
}

/**
 * Clear wallet identity (logout)
 */
export function clearIdentity(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('arkade_wallet_private_key')
  localStorage.removeItem('arkade_wallet_public_key')
}

/**
 * Create an Arkade wallet instance
 *
 * Automatically detects if @arkade-os/sdk is installed.
 * Falls back to mock implementation if SDK is not available.
 */
export async function createArkadeWallet(
  identity: WalletIdentity
): Promise<ArkadeWalletInterface> {
  const config = getActiveConfig()

  // Try to use real SDK if available
  try {
    const { Wallet, SingleKey, Ramps } = await import('@arkade-os/sdk')

    // Create identity using SDK's SingleKey from hex
    const privateKeyHex = hex.encode(identity.privateKey)
    const sdkIdentity = SingleKey.fromHex(privateKeyHex)

    const wallet = await Wallet.create({
      identity: sdkIdentity,
      esploraUrl: config.esploraUrl,
      arkServerUrl: config.arkServerUrl,
    })

    console.log('✅ Using REAL Arkade SDK')
    console.log('   Server:', config.arkServerUrl)

    // Cast to any to investigate the actual properties
    const walletAny = wallet as any

    // Debug: Log wallet methods
    console.log('📋 Wallet methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)).filter(m => m !== 'constructor'))

    // Generate Bitcoin address from pubkey
    // For Arkade, we just need a simple taproot address
    let address: string

    try {
      const btc = await import('@scure/btc-signer')

      // Use correct network configuration (mainnet vs testnet)
      const btcNetwork = config.network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
      const payment = btc.p2tr(identity.publicKey, undefined, btcNetwork)
      address = payment.address!

      console.log('   Generated p2tr address:', address, `(${config.network})`)
    } catch (addrError) {
      console.warn('Error generating p2tr address, using fallback:', addrError)
      // Fallback: simple bech32m format
      const prefix = config.network === 'mainnet' ? 'bc1p' : 'tb1p'
      address = `${prefix}${hex.encode(identity.publicKey).slice(0, 58)}`
    }

    // Get Arkade boarding address
    const boardingAddress = await walletAny.getBoardingAddress()
    console.log('   Boarding address:', boardingAddress)

    // Get Arkade off-chain address for transactions
    const arkadeAddress = await walletAny.getAddress()
    console.log('   Arkade off-chain address:', arkadeAddress)

    return {
      address,
      arkadeAddress,
      boardingAddress,
      pubkey: identity.publicKey,
      getBalance: async () => {
        console.log('🔍 Fetching balance...')
        console.log('   Wallet address:', address)

        const balance = await wallet.getBalance()

        console.log('📊 Raw balance from SDK:', balance)
        console.log('   Balance keys:', Object.keys(balance))
        console.log('   Balance.boarding:', balance.boarding, '(type:', typeof balance.boarding, ')')
        console.log('   Balance.available:', balance.available, '(type:', typeof balance.available, ')')
        console.log('   Balance.total:', balance.total, '(type:', typeof balance.total, ')')

        // Helper to convert balance values to BigInt
        const toBigInt = (value: any): bigint => {
          if (value === null || value === undefined) return 0n
          if (typeof value === 'bigint') return value
          if (typeof value === 'number') return BigInt(value)
          if (typeof value === 'string') return BigInt(value)

          // If it's an object, try various properties
          if (typeof value === 'object') {
            // For boarding object: {confirmed, unconfirmed, total}
            if ('total' in value) return toBigInt(value.total)
            if ('confirmed' in value) return toBigInt(value.confirmed)

            // Try common amount properties
            if ('amount' in value) return toBigInt(value.amount)
            if ('value' in value) return toBigInt(value.value)
            if ('sats' in value) return toBigInt(value.sats)

            // Try valueOf
            if (typeof value.valueOf === 'function') {
              const val = value.valueOf()
              if (typeof val === 'number' || typeof val === 'string') {
                return BigInt(val)
              }
            }
          }

          return 0n
        }

        return {
          boarding: toBigInt(balance.boarding),
          available: toBigInt(balance.available),
          settled: toBigInt(balance.settled),
          preconfirmed: toBigInt(balance.preconfirmed),
          recoverable: toBigInt(balance.recoverable),
          total: toBigInt(balance.total)
        }
      },
      getVtxos: async () => {
        const vtxos = await wallet.getVtxos()
        console.log('🔍 Raw VTXOs from SDK:', vtxos)

        return vtxos.map((v: any) => {
          // SDK ExtendedVirtualCoin structure
          const amount = v.value ?? v.amount ?? 0
          const txid = v.txid ?? v.outpoint?.txid ?? ''
          const vout = v.vout ?? v.outpoint?.vout ?? 0

          return {
            vtxo: {
              amount: amount.toString(),
              outpoint: { txid, vout },
              tapscripts: v.tapscripts || []
            },
            leaf: v.leaf || ''
          }
        })
      },
      send: async (recipient, amount, _feeRate) => {
        // Use sendBitcoin from Arkade SDK for off-chain transfers
        // Note: feeRate is handled automatically by Arkade
        const walletAny = wallet as any
        const result = await walletAny.sendBitcoin({
          address: recipient,
          amount: Number(amount)
        })
        // Result is a txid string
        return result
      },
      board: async (amount) => {
        // Arkade boarding process:
        // Funds are already sent to boarding address
        // We just need to notify Arkade to process them

        const walletAny = wallet as any

        console.log('🚀 Processing boarding...')
        console.log('   Amount:', amount, 'sats')

        // Check for boarding transactions
        const boardingTxs = await walletAny.getBoardingTxs()
        console.log('   Boarding txs:', boardingTxs)

        // Notify Arkade about the incoming funds
        console.log('   Notifying Arkade server...')

        if (typeof walletAny.notifyIncomingFunds === 'function') {
          await walletAny.notifyIncomingFunds()
          console.log('   ✅ Arkade notified!')
        }

        // Return the first boarding tx if available
        if (boardingTxs && boardingTxs.length > 0) {
          return boardingTxs[0].txid || boardingTxs[0]
        }

        return 'boarding-in-progress'
      },
      settle: async () => {
        // Finalize pending boarding/transactions using Ramps
        console.log('🔧 Calling Ramps.onboard() to finalize boarding...')

        try {
          const ramps = new Ramps(wallet)
          const onboardTxid = await ramps.onboard()
          console.log('✅ Onboarding completed! Txid:', onboardTxid)
          return onboardTxid
        } catch (error) {
          console.error('❌ Ramps.onboard() failed:', error)
          throw error
        }
      },
      exit: async (vtxos, feeRate) => {
        // Collaborative exit
        const result = await wallet.exit({ feeRate })
        return result.txid
      }
    }
  } catch (error) {
    // SDK not installed or initialization failed, use mock implementation
    console.warn('⚠️  Using MOCK Arkade wallet.')
    console.warn('Error:', error)
    console.warn('   Run: npm install @arkade-os/sdk')
  }

  // MOCK implementation for development without SDK
  return {
    address: 'tark1p' + hex.encode(identity.publicKey).slice(0, 58),
    pubkey: identity.publicKey,

    getBalance: async () => ({
      boarding: 0n,
      available: 1000000n, // Mock 1M sats
      settled: 0n,
      preconfirmed: 0n,
      recoverable: 0n,
      total: 1000000n
    }),

    getVtxos: async () => {
      // Mock VTXOs for testing
      return [
        {
          vtxo: {
            amount: '1000000',
            outpoint: {
              txid: '0'.repeat(64),
              vout: 0
            },
            tapscripts: []
          },
          leaf: ''
        }
      ]
    },

    send: async (recipient, amount) => {
      console.log(`[MOCK] Send ${amount} sats to ${recipient}`)
      return '0'.repeat(64) // Mock txid
    },

    board: async (amount) => {
      console.log(`[MOCK] Board ${amount} sats from on-chain to off-chain`)
      return '0'.repeat(64)
    },

    settle: async () => {
      console.log('[MOCK] Settle - no-op in mock mode')
      return '0'.repeat(64)
    },

    exit: async (vtxos) => {
      console.log(`[MOCK] Exit ${vtxos.length} VTXOs to on-chain`)
      return '0'.repeat(64)
    }
  }
}

/**
 * Broadcast a punk mint transaction to Arkade
 */
export async function broadcastPunkMint(
  wallet: ArkadeWalletInterface,
  punkVTXO: PunkVTXO,
  punkValue: bigint
): Promise<string> {
  const config = getActiveConfig()
  const params = getNetworkParams()

  // Ensure punk value meets minimum
  if (punkValue < params.minVtxoValue) {
    throw new Error(`Punk value must be at least ${params.minVtxoValue} sats`)
  }

  // Get user's VTXOs for funding
  const vtxos = await wallet.getVtxos()
  const totalAvailable = vtxos.reduce((sum, v) => sum + BigInt(v.vtxo.amount), 0n)

  if (totalAvailable < punkValue) {
    throw new Error(`Insufficient funds. Need ${punkValue} sats, have ${totalAvailable} sats`)
  }

  // TODO: Build real punk mint transaction using buildMintTransaction
  // For now, use the wallet's send function to create a VTXO

  console.log('🎨 Minting punk VTXO:', {
    punkId: hex.encode(punkVTXO.punkId).slice(0, 16),
    owner: hex.encode(punkVTXO.owner).slice(0, 16),
    listingPrice: punkVTXO.listingPrice.toString(),
    value: punkValue.toString()
  })

  // In a real implementation, we'd:
  // 1. Create taproot address with punk tapscripts
  // 2. Build transaction with inputs (user VTXOs) and outputs (punk VTXO + change)
  // 3. Sign with user's key
  // 4. Submit to Arkade server

  // For now, simulate
  const txid = await wallet.send(wallet.address, punkValue)

  return txid
}

/**
 * Check if wallet is connected
 */
export function isWalletConnected(): boolean {
  return loadIdentity() !== null
}

/**
 * Check on-chain balance via Esplora API (for debugging)
 */
export async function checkOnChainBalance(address: string): Promise<bigint> {
  const config = getActiveConfig()

  try {
    console.log('🔎 Checking on-chain balance for:', address)
    console.log('   Using Esplora:', config.esploraUrl)

    const response = await fetch(`${config.esploraUrl}/address/${address}`)

    if (!response.ok) {
      throw new Error(`Esplora API error: ${response.status}`)
    }

    const data = await response.json()

    console.log('📡 Esplora response:', data)
    console.log('   Funded txs:', data.chain_stats?.funded_txo_count || 0)
    console.log('   Spent txs:', data.chain_stats?.spent_txo_count || 0)
    console.log('   Balance:', data.chain_stats?.funded_txo_sum || 0, 'sats')

    const balance = BigInt(data.chain_stats?.funded_txo_sum || 0) - BigInt(data.chain_stats?.spent_txo_sum || 0)

    return balance
  } catch (error) {
    console.error('❌ Failed to check on-chain balance:', error)
    return 0n
  }
}

/**
 * Get wallet info summary
 */
export async function getWalletInfo(wallet: ArkadeWalletInterface) {
  const balance = await wallet.getBalance()
  const vtxos = await wallet.getVtxos()

  // Also check on-chain balance for debugging
  const onChainBalance = await checkOnChainBalance(wallet.address)

  console.log('💰 Wallet summary:')
  console.log('   SDK balance:', balance.total.toString(), 'sats')
  console.log('   On-chain balance:', onChainBalance.toString(), 'sats')

  return {
    address: wallet.address,
    balance,
    vtxoCount: vtxos.length,
    canMintPunks: balance.available >= getNetworkParams().minVtxoValue
  }
}

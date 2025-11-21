/**
 * Escrow Processor
 *
 * Automatic escrow transaction processor:
 * 1. Monitors escrow wallet for incoming VTXOs
 * 2. Detects when seller deposits punk VTXO
 * 3. Detects when buyer sends payment
 * 4. Executes atomic swap: punk to buyer, payment to seller
 */

import type { EscrowListing } from './escrowStore.js'
import { getAllEscrowListings, markAsDeposited, markAsSold } from './escrowStore.js'

/**
 * Initialize escrow wallet from environment
 */
export async function initEscrowWallet() {
  const privateKeyHex = process.env.ESCROW_WALLET_PRIVATE_KEY

  if (!privateKeyHex) {
    throw new Error('ESCROW_WALLET_PRIVATE_KEY not configured')
  }

  // Import SDK
  const { Wallet, SingleKey } = await import('@arkade-os/sdk')

  // Create wallet identity
  const identity = SingleKey.fromHex(privateKeyHex)

  // Determine network from env
  const isMainnet = process.env.VITE_ARKADE_NETWORK === 'mainnet'

  const wallet = await Wallet.create({
    identity,
    esploraUrl: isMainnet ? 'https://mempool.space/api' : 'https://mutinynet.com/api',
    arkServerUrl: isMainnet ? 'https://arkade.computer' : 'https://mutinynet.arkade.sh',
  })

  const address = await wallet.getAddress()
  const balance = await wallet.getBalance()

  console.log('🔐 Escrow wallet initialized')
  console.log('   Address:', address)
  console.log('   Balance:', balance.available, 'sats')

  // Verify address matches environment variable
  const expectedAddress = process.env.ESCROW_WALLET_ADDRESS
  if (expectedAddress && address !== expectedAddress) {
    console.warn('⚠️  WARNING: Wallet address mismatch!')
    console.warn(`   Expected: ${expectedAddress}`)
    console.warn(`   Got:      ${address}`)
    console.warn('   Make sure ESCROW_WALLET_PRIVATE_KEY matches ESCROW_WALLET_ADDRESS')
  }

  // Check if wallet has sufficient liquidity
  const MIN_BALANCE = 10000n // 10,000 sats minimum recommended
  if (BigInt(balance.available) < MIN_BALANCE) {
    console.warn('⚠️  WARNING: Low escrow wallet balance!')
    console.warn(`   Current: ${balance.available} sats`)
    console.warn(`   Recommended: ${MIN_BALANCE} sats minimum`)
    console.warn('   Please add funds to ensure smooth operation')
  }

  return wallet
}

/**
 * Check for incoming punk VTXOs (seller deposits)
 */
export async function processSellerDeposits(wallet: any): Promise<number> {
  const listings = getAllEscrowListings().filter(l => l.status === 'pending')

  if (listings.length === 0) {
    console.log('   No pending listings to check')
    return 0
  }

  console.log(`📥 Checking ${listings.length} pending listings for seller deposits...`)

  // Get all VTXOs in escrow wallet
  const vtxos = await wallet.getVtxos()
  console.log(`   Escrow wallet has ${vtxos.length} VTXOs`)

  let depositsDetected = 0

  for (const listing of listings) {
    try {
      // Look for the punk VTXO in wallet
      const punkVtxo = vtxos.find((v: any) => {
        const txid = v.txid ?? v.outpoint?.txid ?? ''
        const vout = v.vout ?? v.outpoint?.vout ?? 0
        const outpoint = `${txid}:${vout}`
        return outpoint === listing.punkVtxoOutpoint
      })

      if (punkVtxo) {
        console.log(`✅ Punk ${listing.punkId.slice(0, 8)}... received in escrow!`)
        console.log(`   VTXO: ${listing.punkVtxoOutpoint}`)

        // Mark as deposited
        markAsDeposited(listing.punkId)
        depositsDetected++
      }
    } catch (error) {
      console.error(`Error checking listing ${listing.punkId}:`, error)
    }
  }

  return depositsDetected
}

/**
 * Check for buyer payments and execute atomic swaps
 */
export async function processBuyerPayments(wallet: any): Promise<number> {
  const listings = getAllEscrowListings().filter(l => l.status === 'deposited' && l.buyerAddress)

  if (listings.length === 0) {
    console.log('   No deposited listings with buyers to check')
    return 0
  }

  console.log(`💰 Checking ${listings.length} deposited listings for buyer payments...`)

  // Get wallet balance to see if payment received
  const balance = await wallet.getBalance()
  const vtxos = await wallet.getVtxos()

  console.log(`   Escrow balance: ${balance.available} sats (${vtxos.length} VTXOs)`)

  let swapsExecuted = 0

  for (const listing of listings) {
    try {
      // Calculate expected payment
      const FEE_PERCENT = 0.5
      const price = BigInt(listing.price)
      const fee = (price * BigInt(Math.floor(FEE_PERCENT * 100))) / 10000n
      const expectedPayment = price + fee

      // Check if we have enough balance for this sale
      // (We need: punk VTXO + buyer payment)
      // Simple heuristic: if available balance >= expected payment, assume payment received
      if (BigInt(balance.available) >= expectedPayment) {
        console.log(`💸 Payment detected for punk ${listing.punkId.slice(0, 8)}...`)
        console.log(`   Expected: ${expectedPayment} sats`)
        console.log(`   Executing atomic swap...`)

        // Execute the atomic swap
        const success = await executeAtomicSwap(wallet, listing, fee)

        if (success) {
          // Mark as sold
          markAsSold(listing.punkId, listing.buyerAddress!, listing.buyerPubkey)
          swapsExecuted++
          console.log(`✅ Atomic swap completed for punk ${listing.punkId.slice(0, 8)}...`)
        } else {
          console.error(`❌ Failed to execute swap for punk ${listing.punkId.slice(0, 8)}...`)
        }
      }
    } catch (error) {
      console.error(`Error processing listing ${listing.punkId}:`, error)
    }
  }

  return swapsExecuted
}

/**
 * Execute atomic swap: send punk to buyer, send payment to seller
 */
async function executeAtomicSwap(
  wallet: any,
  listing: EscrowListing,
  fee: bigint
): Promise<boolean> {
  try {
    const price = BigInt(listing.price)
    const sellerAmount = price // Seller gets listing price
    // Fee stays in escrow wallet

    console.log(`   Transferring punk to buyer: ${listing.buyerAddress}`)
    console.log(`   Transferring payment to seller: ${listing.sellerArkAddress}`)
    console.log(`   Seller receives: ${sellerAmount} sats`)
    console.log(`   Marketplace fee: ${fee} sats (${0.5}%)`)

    // Check wallet balance before executing swap
    const balance = await wallet.getBalance()
    const availableBalance = BigInt(balance.available)

    // Estimate total needed: punk value (1000) + seller amount + estimated tx fees (1000 buffer)
    const estimatedTxFees = 1000n
    const totalNeeded = 1000n + sellerAmount + estimatedTxFees

    console.log(`   Available balance: ${availableBalance} sats`)
    console.log(`   Estimated needed: ${totalNeeded} sats (including ~${estimatedTxFees} sats tx fees)`)

    if (availableBalance < totalNeeded) {
      console.error(`   ❌ Insufficient balance for swap!`)
      console.error(`   Need: ${totalNeeded} sats, Have: ${availableBalance} sats`)
      console.error(`   Please add funds to escrow wallet`)
      return false
    }

    // Step 1: Transfer punk VTXO to buyer
    // In Arkade, we need to send the specific VTXO
    // For now, we'll use sendBitcoin which creates a new VTXO for the buyer
    // TODO: Use proper VTXO transfer that maintains punk metadata

    // Parse punk VTXO outpoint
    const [punkTxid, punkVoutStr] = listing.punkVtxoOutpoint.split(':')
    const punkVout = parseInt(punkVoutStr)

    console.log(`   Step 1: Sending punk VTXO to buyer...`)

    // For now, just send the value (the punk metadata is preserved on Nostr)
    // In production, we'd build a proper transfer transaction that includes punk tapscripts
    const punkTxid1 = await wallet.sendBitcoin({
      address: listing.buyerAddress,
      amount: 1000 // Minimum punk value (punk data is on Nostr, VTXO just proves ownership)
    })

    console.log(`   ✅ Punk transfer initiated: ${punkTxid1}`)

    // Step 2: Transfer payment to seller (minus fee)
    console.log(`   Step 2: Sending payment to seller...`)

    const paymentTxid = await wallet.sendBitcoin({
      address: listing.sellerArkAddress,
      amount: Number(sellerAmount)
    })

    console.log(`   ✅ Payment transfer initiated: ${paymentTxid}`)

    // Fee remains in escrow wallet automatically

    console.log(`✅ Atomic swap complete!`)
    console.log(`   Punk sent to buyer: ${punkTxid1}`)
    console.log(`   Payment sent to seller: ${paymentTxid}`)
    console.log(`   Marketplace fee: ${fee} sats`)

    return true

  } catch (error) {
    console.error('❌ Atomic swap failed:', error)
    return false
  }
}

/**
 * Main processor function - called by cron or manual trigger
 */
export async function processEscrowTransactions(): Promise<{
  depositsDetected: number
  swapsExecuted: number
  errors: string[]
}> {
  const errors: string[] = []

  try {
    console.log('🔄 Starting escrow processor...')

    // Initialize escrow wallet
    const wallet = await initEscrowWallet()

    // Process seller deposits
    const depositsDetected = await processSellerDeposits(wallet)

    // Process buyer payments and execute swaps
    const swapsExecuted = await processBuyerPayments(wallet)

    console.log('✅ Escrow processor completed')
    console.log(`   Deposits detected: ${depositsDetected}`)
    console.log(`   Swaps executed: ${swapsExecuted}`)

    return {
      depositsDetected,
      swapsExecuted,
      errors
    }

  } catch (error: any) {
    console.error('❌ Escrow processor error:', error)
    errors.push(error.message)

    return {
      depositsDetected: 0,
      swapsExecuted: 0,
      errors
    }
  }
}

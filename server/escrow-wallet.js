/**
 * Escrow Wallet Operations
 * Handles punk VTXO returns from escrow
 */

import { Wallet, SingleKey } from '@arkade-os/sdk'

const ARK_URL = process.env.ARK_URL || 'https://arkade.computer'

/**
 * Initialize the escrow wallet
 */
async function initEscrowWallet() {
  // Read key at runtime (not at import time)
  const escrowPrivateKey = process.env.ESCROW_WALLET_PRIVATE_KEY || ''

  if (!escrowPrivateKey) {
    throw new Error('ESCROW_WALLET_PRIVATE_KEY not configured')
  }

  try {
    // Create wallet identity from hex private key
    const identity = SingleKey.fromHex(escrowPrivateKey)

    // Create wallet using the correct async API
    const wallet = await Wallet.create({
      identity,
      esploraUrl: 'https://mempool.space/api',
      arkServerUrl: ARK_URL
    })

    console.log('✅ Escrow wallet initialized')
    return wallet
  } catch (error) {
    console.error('❌ Failed to initialize escrow wallet:', error)
    throw new Error(`Failed to initialize escrow wallet: ${error.message}`)
  }
}

/**
 * Return punk amount to the seller (amount-based, not VTXO-based)
 * VTXOs change with each Ark round, so we just send the amount back
 *
 * @param sellerArkAddress Seller's Ark address
 * @param punkAmount Amount to return (default 10000 sats - matches deposit)
 * @returns Transaction ID of the return
 */
export async function returnPunkToSeller(sellerArkAddress, punkAmount = 10000) {
  console.log(`🔄 Returning ${punkAmount} sats to ${sellerArkAddress.slice(0, 20)}...`)

  const wallet = await initEscrowWallet()

  // Check escrow has enough balance
  const balance = await wallet.getBalance()
  console.log(`💰 Escrow balance: ${balance.available} sats available`)

  if (balance.available < punkAmount) {
    throw new Error(`Insufficient escrow balance: ${balance.available} < ${punkAmount}`)
  }

  // Send the amount back to seller - let wallet handle VTXO selection
  try {
    const txid = await wallet.sendBitcoin({
      address: sellerArkAddress,
      amount: punkAmount
    })

    console.log(`✅ Returned ${punkAmount} sats to seller: ${txid}`)
    return { txid, amount: punkAmount }
  } catch (error) {
    console.error('❌ Failed to return punk:', error)
    throw new Error(`Failed to return punk to seller: ${error.message}`)
  }
}

/**
 * Get escrow wallet balance
 */
export async function getEscrowBalance() {
  const wallet = await initEscrowWallet()

  try {
    const balance = await wallet.getBalance()
    console.log(`💰 Escrow balance: ${balance.total} sats`)
    return balance
  } catch (error) {
    console.error('❌ Failed to get escrow balance:', error)
    throw new Error(`Failed to get escrow balance: ${error.message}`)
  }
}

/**
 * Verify that a VTXO exists in the escrow wallet
 * CRITICAL: Must verify before marking a listing as deposited
 *
 * @param vtxoOutpoint The VTXO outpoint to verify (format: "txid:vout")
 * @param expectedAmount Expected amount in sats (default 10000)
 * @returns { exists: boolean, vtxo?: object, error?: string }
 */
export async function verifyVtxoInEscrow(vtxoOutpoint, expectedAmount = 10000) {
  console.log(`🔍 Verifying VTXO in escrow: ${vtxoOutpoint}`)

  try {
    const wallet = await initEscrowWallet()
    const vtxos = await wallet.getVtxos()

    // Parse outpoint
    const [txid, voutStr] = vtxoOutpoint.split(':')
    const vout = parseInt(voutStr, 10)

    if (!txid || isNaN(vout)) {
      return { exists: false, error: 'Invalid outpoint format' }
    }

    // Find matching VTXO
    const found = vtxos.find(v => v.txid === txid && v.vout === vout)

    if (!found) {
      console.log(`❌ VTXO not found in escrow wallet: ${vtxoOutpoint}`)
      return { exists: false, error: 'VTXO not found in escrow wallet' }
    }

    // Verify amount
    if (found.value !== expectedAmount) {
      console.log(`❌ VTXO amount mismatch: expected ${expectedAmount}, got ${found.value}`)
      return { exists: false, error: `Amount mismatch: expected ${expectedAmount}, got ${found.value}` }
    }

    console.log(`✅ VTXO verified in escrow: ${vtxoOutpoint} (${found.value} sats)`)
    return { exists: true, vtxo: found }

  } catch (error) {
    console.error('❌ Failed to verify VTXO:', error)
    return { exists: false, error: error.message }
  }
}

/**
 * Get all VTXOs in escrow wallet
 * Used to check for unreported deposits during cancel
 */
export async function getEscrowVtxos() {
  const wallet = await initEscrowWallet()
  return await wallet.getVtxos()
}

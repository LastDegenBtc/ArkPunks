/**
 * Escrow Wallet Operations
 * Handles punk VTXO returns from escrow
 */

import dotenv from 'dotenv'
dotenv.config()

import { Wallet, SingleKey } from '@arkade-os/sdk'

const ESCROW_PRIVATE_KEY = process.env.ESCROW_WALLET_PRIVATE_KEY || ''
const ARK_URL = process.env.ARK_URL || 'https://arkade.computer'

/**
 * Initialize the escrow wallet
 */
async function initEscrowWallet() {
  if (!ESCROW_PRIVATE_KEY) {
    throw new Error('ESCROW_WALLET_PRIVATE_KEY not configured')
  }

  try {
    // Create wallet identity from hex private key
    const identity = SingleKey.fromHex(ESCROW_PRIVATE_KEY)

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

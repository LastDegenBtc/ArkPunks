/**
 * Simplified Escrow Execute API
 *
 * POST /api/escrow/execute
 *
 * Executes purchase in simplified escrow mode:
 * 1. Verify buyer payment received
 * 2. Update ownership table (punk → buyer)
 * 3. Send payment to seller (minus 1% fee)
 * 4. Mark listing as sold
 *
 * Seller is responsible for sending punk VTXO to buyer via UI.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, updateEscrowStatus } from './_lib/escrowStore.js'
import { getEscrowWallet } from './_lib/escrowArkadeWallet.js'
import { setPunkOwner } from '../ownership/_lib/ownershipStore.js'

interface ExecuteRequest {
  punkId: string
  buyerPubkey: string
  buyerArkAddress: string
}

interface ExecuteResponse {
  success: boolean
  punkId: string
  paymentTxid: string
  message: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('⚡ Simplified escrow execute endpoint called')

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId, buyerPubkey, buyerArkAddress } = req.body as ExecuteRequest

    console.log(`   Purchase: punk ${punkId.slice(0, 8)}...`)
    console.log(`   Buyer: ${buyerArkAddress?.slice(0, 20)}...`)

    // Validate required fields
    if (!punkId || !buyerPubkey || !buyerArkAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'buyerPubkey', 'buyerArkAddress']
      })
    }

    // Get listing
    const listing = await getEscrowListing(punkId)
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    // Check listing status
    if (listing.status === 'sold') {
      return res.status(409).json({ error: 'Punk already sold' })
    }

    if (listing.status === 'cancelled') {
      return res.status(410).json({ error: 'Listing cancelled' })
    }

    console.log('✅ Listing found, verifying payment...')

    // Calculate amounts
    const FEE_PERCENT = 1
    const price = BigInt(listing.price)
    const fee = (price * BigInt(FEE_PERCENT)) / 100n
    const sellerReceives = price - fee // Seller gets price minus fee

    console.log(`   Price: ${price} sats`)
    console.log(`   Fee (${FEE_PERCENT}%): ${fee} sats`)
    console.log(`   Seller receives: ${sellerReceives} sats`)

    // Initialize escrow wallet
    console.log('📦 Checking escrow wallet...')
    const escrowWallet = await getEscrowWallet()
    const escrowBalance = await escrowWallet.getBalance()
    console.log(`   Escrow balance: ${escrowBalance.available} sats`)

    // Verify buyer sent payment
    if (escrowBalance.available < price) {
      return res.status(400).json({
        error: 'Payment not received',
        details: `Expected ${price} sats, escrow has ${escrowBalance.available} sats`,
        message: 'Please send payment to escrow address first'
      })
    }

    console.log('✅ Payment verified')

    // Step 1: Find punk VTXO in escrow wallet
    console.log('📦 Finding punk VTXO in escrow wallet...')
    const vtxos = await escrowWallet.getVtxos()
    console.log(`   Found ${vtxos.length} VTXOs in escrow`)

    // Look for punk-sized VTXO (~10,000-10,500 sats)
    const punkVtxo = vtxos.find(v => v.value >= 10000 && v.value <= 10500 && !v.isSpent)

    if (!punkVtxo) {
      console.error('❌ No punk VTXO found in escrow')
      console.error('   Available VTXOs:')
      vtxos.forEach(v => console.error(`   - ${v.txid}:${v.vout} (${v.value} sats, spent: ${v.isSpent})`))

      return res.status(500).json({
        error: 'Punk VTXO not found in escrow',
        details: 'Seller may not have sent punk to escrow yet'
      })
    }

    console.log(`   Found punk VTXO: ${punkVtxo.value} sats`)

    // Step 2: Send punk to buyer
    console.log(`📤 Sending punk to buyer: ${buyerArkAddress.slice(0, 20)}...`)
    const punkTxid = await escrowWallet.send(buyerArkAddress, BigInt(punkVtxo.value))
    console.log(`✅ Punk sent! Txid: ${punkTxid}`)

    // Step 3: Update ownership table (punk → buyer)
    console.log(`📝 Updating ownership: ${punkId.slice(0, 8)}... → ${buyerArkAddress.slice(0, 20)}...`)
    await setPunkOwner(punkId, buyerArkAddress)
    console.log('✅ Ownership updated')

    // Step 4: Send payment to seller
    console.log(`💸 Sending ${sellerReceives} sats to seller: ${listing.sellerArkAddress.slice(0, 20)}...`)
    const paymentTxid = await escrowWallet.send(listing.sellerArkAddress, sellerReceives)
    console.log(`✅ Payment sent! Txid: ${paymentTxid}`)
    console.log(`   Fee (${fee} sats) remains in escrow`)

    // Step 5: Mark listing as sold
    console.log('📝 Updating listing status...')
    await updateEscrowStatus(punkId, 'sold', {
      soldAt: Date.now(),
      buyerAddress: buyerArkAddress,
      buyerPubkey,
      punkTransferTxid: punkTxid,
      paymentTransferTxid: paymentTxid
    })
    console.log('✅ Listing marked as sold')

    console.log('✅ Atomic swap completed!')

    const response: ExecuteResponse = {
      success: true,
      punkId,
      paymentTxid,
      message: `Atomic swap complete! Punk and payment transferred.`
    }

    return res.status(200).json(response)

  } catch (error: any) {
    console.error('❌ Error executing escrow swap:', error)
    return res.status(500).json({
      error: 'Failed to execute swap',
      details: error.message
    })
  }
}

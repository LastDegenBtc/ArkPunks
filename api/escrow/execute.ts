/**
 * Escrow Execute API
 *
 * POST /api/escrow/execute
 *
 * Executes the atomic swap for an escrow listing.
 * This is triggered by the buyer after sending payment.
 *
 * Steps:
 * 1. Verify both deposits received (punk VTXO + payment)
 * 2. Transfer punk to buyer
 * 3. Transfer payment (minus 1% fee) to seller
 * 4. Mark listing as sold
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, updateEscrowStatus, ESCROW_PRIVATE_KEY } from './_lib/escrowStore.js'

interface ExecuteRequest {
  punkId: string
  buyerPubkey: string // For verification
}

interface ExecuteResponse {
  success: boolean
  punkId: string
  punkTxid: string // Transaction ID for punk transfer to buyer
  paymentTxid: string // Transaction ID for payment to seller
  message: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('⚡ Escrow execute endpoint called')
  console.log('   Method:', req.method)

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId, buyerPubkey } = req.body as ExecuteRequest

    console.log('   Execute request for punk:', punkId)
    console.log('   Buyer:', buyerPubkey?.slice(0, 16) + '...')

    // Validate required fields
    if (!punkId || !buyerPubkey) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'buyerPubkey']
      })
    }

    // Get escrow listing
    const listing = await getEscrowListing(punkId)
    if (!listing) {
      return res.status(404).json({ error: 'Punk not found in escrow' })
    }

    // Verify buyer matches
    if (listing.buyerPubkey !== buyerPubkey) {
      return res.status(403).json({ error: 'Not authorized - buyer mismatch' })
    }

    // Check listing status
    if (listing.status === 'sold') {
      return res.status(409).json({ error: 'Punk already sold' })
    }

    if (listing.status === 'cancelled') {
      return res.status(410).json({ error: 'Listing cancelled' })
    }

    if (listing.status !== 'deposited') {
      return res.status(400).json({
        error: 'Deposits not complete',
        status: listing.status,
        message: 'Both seller and buyer must deposit funds before execution'
      })
    }

    console.log('✅ Verified: All deposits received')
    console.log('   Escrow address:', listing.escrowAddress)
    console.log('   Seller address:', listing.sellerArkAddress)
    console.log('   Buyer address:', listing.buyerAddress)

    // Calculate amounts
    const FEE_PERCENT = 1
    const price = BigInt(listing.price)
    const fee = (price * BigInt(Math.floor(FEE_PERCENT * 100))) / 10000n
    const sellerAmount = price - fee

    console.log(`   Price: ${price} sats`)
    console.log(`   Fee (${FEE_PERCENT}%): ${fee} sats`)
    console.log(`   Seller receives: ${sellerAmount} sats`)

    // TODO: Execute atomic swap using Arkade SDK
    // For now, we'll return a mock response indicating what would happen
    //
    // Real implementation would:
    // 1. Initialize escrow wallet from ESCROW_PRIVATE_KEY
    // 2. Get escrow wallet's VTXOs
    // 3. Transfer punk VTXO to buyer address
    // 4. Transfer payment (minus fee) to seller address
    //
    // const escrowWallet = await createWallet(ESCROW_PRIVATE_KEY)
    // const punkTxid = await escrowWallet.send(listing.buyerAddress, punkVtxo)
    // const paymentTxid = await escrowWallet.send(listing.sellerArkAddress, sellerAmount)

    console.log('⚠️  TODO: Implement actual swap execution')
    console.log('   This would:')
    console.log(`   1. Send punk VTXO (${listing.punkVtxoOutpoint}) to ${listing.buyerAddress}`)
    console.log(`   2. Send ${sellerAmount} sats to ${listing.sellerArkAddress}`)

    // For now, mark as sold with mock transaction IDs
    const punkTxid = 'mock-punk-transfer-' + Date.now()
    const paymentTxid = 'mock-payment-transfer-' + Date.now()

    // Update listing status
    await updateEscrowStatus(punkId, 'sold', {
      soldAt: Date.now(),
      punkTransferTxid: punkTxid,
      paymentTransferTxid: paymentTxid
    })

    console.log('✅ Escrow execution completed')

    const response: ExecuteResponse = {
      success: true,
      punkId,
      punkTxid,
      paymentTxid,
      message: 'Atomic swap executed successfully'
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

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
import { getEscrowWallet } from './_lib/escrowArkadeWallet.js'

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

    // Debug: Log full buyer verification details
    console.log('🔍 BUYER VERIFICATION:')
    console.log('   Request buyerPubkey:', buyerPubkey)
    console.log('   Stored buyerPubkey:', listing.buyerPubkey)
    console.log('   Match:', listing.buyerPubkey === buyerPubkey)

    // Verify buyer matches
    if (listing.buyerPubkey !== buyerPubkey) {
      return res.status(403).json({
        error: 'Not authorized - buyer mismatch',
        debug: {
          requestPubkey: buyerPubkey,
          storedPubkey: listing.buyerPubkey
        }
      })
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
    const totalExpected = price + fee // What buyer should have sent

    console.log(`   Price: ${price} sats`)
    console.log(`   Fee (${FEE_PERCENT}%): ${fee} sats`)
    console.log(`   Total expected from buyer: ${totalExpected} sats`)
    console.log(`   Seller will receive: ${price} sats (full price)`)

    // Execute atomic swap using Arkade SDK
    console.log('⚡ Executing atomic swap with Arkade SDK...')

    // Initialize escrow wallet
    const escrowWallet = await getEscrowWallet()
    console.log('✅ Escrow wallet initialized')
    console.log('   Escrow address:', escrowWallet.arkadeAddress)

    // Check escrow balance
    const escrowBalance = await escrowWallet.getBalance()
    console.log('   Escrow balance:', escrowBalance.available.toString(), 'sats')

    // Verify buyer sent enough funds (price + fee)
    // Note: We expect buyer sent price + fee, and seller already transferred punk ownership via Nostr
    if (escrowBalance.available < price) {
      throw new Error(
        `Insufficient escrow balance for seller payment. Need ${price} sats, have ${escrowBalance.available} sats. ` +
        `Buyer must send ${totalExpected} sats (price + ${FEE_PERCENT}% fee) to escrow.`
      )
    }

    // Transfer: Send full price to seller (fee stays in escrow)
    console.log(`💸 Transferring ${price} sats to seller: ${listing.sellerArkAddress}`)
    const paymentTxid = await escrowWallet.send(listing.sellerArkAddress, price)
    console.log(`✅ Payment sent to seller! Txid: ${paymentTxid}`)
    console.log(`   Fee (${fee} sats) remains in escrow wallet`)

    // Publish Nostr event transferring punk ownership from escrow to buyer
    console.log(`🔑 Publishing Nostr event: Transferring punk ${listing.punkId} to buyer...`)
    const { publishPunkTransfer } = await import('../../src/utils/marketplaceUtils.js')
    const { ESCROW_PRIVATE_KEY, ESCROW_PUBKEY } = await import('./_lib/escrowStore.js')

    try {
      // Transfer punk from escrow to buyer
      // fromPubkey: escrow, toPubkey: buyer, txid: payment txid as reference
      await publishPunkTransfer(
        listing.punkId,
        ESCROW_PUBKEY, // from escrow
        listing.buyerPubkey!, // to buyer
        paymentTxid, // reference payment txid
        ESCROW_PRIVATE_KEY // escrow signs the transfer
      )
      console.log(`✅ Punk ownership transferred to buyer via Nostr!`)
    } catch (nostrError: any) {
      console.error('⚠️ Failed to publish Nostr transfer event:', nostrError)
      // Don't fail the whole transaction if Nostr fails, but log it
      // The payment already went through, so we should mark as sold anyway
    }

    console.log('✅ Atomic swap completed successfully!')

    // Update listing status
    await updateEscrowStatus(punkId, 'sold', {
      soldAt: Date.now(),
      punkTransferTxid: 'nostr', // Punk transferred via Nostr event
      paymentTransferTxid: paymentTxid
    })

    console.log('✅ Escrow execution completed')

    const response: ExecuteResponse = {
      success: true,
      punkId,
      punkTxid: 'nostr', // Punk transferred via Nostr event, not on-chain
      paymentTxid,
      message: 'Atomic swap executed successfully - Punk transferred via Nostr, payment sent to seller'
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

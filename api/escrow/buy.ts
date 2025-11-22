/**
 * Escrow Buy API
 *
 * POST /api/escrow/buy
 *
 * Allows a buyer to purchase a punk that is held in escrow.
 * This endpoint registers the purchase intent and returns instructions.
 *
 * The actual transfer is handled by the monitoring service which:
 * 1. Detects when buyer sends payment to escrow address
 * 2. Transfers punk VTXO to buyer
 * 3. Transfers payment (minus 1% fee) to seller
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, updateEscrowStatus } from './_lib/escrowStore.js'

interface BuyRequest {
  punkId: string
  buyerPubkey: string
  buyerArkAddress: string
}

interface BuyResponse {
  success: boolean
  punkId: string
  price: string
  totalWithFee: string
  fee: string
  feePercent: number
  escrowAddress: string
  instructions: string[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🛒 Escrow buy endpoint called')
  console.log('   Method:', req.method)

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId, buyerPubkey, buyerArkAddress } = req.body as BuyRequest

    console.log('   Buy request for punk:', punkId)
    console.log('   Buyer:', buyerPubkey.slice(0, 16) + '...')

    // Validate required fields
    if (!punkId || !buyerPubkey || !buyerArkAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'buyerPubkey', 'buyerArkAddress']
      })
    }

    // Get escrow listing
    const listing = await getEscrowListing(punkId)
    if (!listing) {
      return res.status(404).json({ error: 'Punk not found in escrow' })
    }

    // Check listing status
    if (listing.status === 'sold') {
      return res.status(409).json({ error: 'Punk already sold' })
    }

    if (listing.status === 'cancelled') {
      return res.status(410).json({ error: 'Listing cancelled' })
    }

    // Calculate fee (1% for escrow mode)
    const FEE_PERCENT = 1
    const price = BigInt(listing.price)
    const fee = (price * BigInt(Math.floor(FEE_PERCENT * 100))) / 10000n
    const totalWithFee = price + fee

    console.log(`   Price: ${price} sats`)
    console.log(`   Fee (${FEE_PERCENT}%): ${fee} sats`)
    console.log(`   Total: ${totalWithFee} sats`)

    // Update listing with buyer info (status stays 'pending' until payment received)
    await updateEscrowStatus(punkId, listing.status, {
      buyerPubkey,
      buyerAddress: buyerArkAddress
    })

    console.log('✅ Buy intent registered')

    // Return payment instructions to buyer
    const response: BuyResponse = {
      success: true,
      punkId,
      price: price.toString(),
      totalWithFee: totalWithFee.toString(),
      fee: fee.toString(),
      feePercent: FEE_PERCENT,
      escrowAddress: listing.escrowAddress,
      instructions: [
        `Send exactly ${totalWithFee} sats to escrow address: ${listing.escrowAddress}`,
        'Once payment is received, the punk will be automatically transferred to you',
        `The seller will receive ${price} sats (${totalWithFee} - 1% fee)`,
        'The process is fully automatic and should complete within 2-3 minutes'
      ]
    }

    return res.status(200).json(response)

  } catch (error: any) {
    console.error('❌ Error processing buy request:', error)
    return res.status(500).json({
      error: 'Failed to process buy request',
      details: error.message
    })
  }
}

/**
 * Simplified Escrow Cancel API
 *
 * POST /api/escrow/cancel
 *
 * Cancels a listing immediately. Since seller keeps their punk,
 * no VTXO returns are needed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, updateEscrowStatus } from './_lib/escrowStore.js'
import { getPunkOwner } from '../ownership/_lib/ownershipStore.js'

interface CancelRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔴 Simplified escrow cancel endpoint called')

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      punkId,
      sellerPubkey,
      sellerArkAddress
    } = req.body as CancelRequest

    console.log(`   Cancel request: punk ${punkId.slice(0, 8)}...`)
    console.log(`   Seller: ${sellerArkAddress.slice(0, 20)}...`)

    // Validate required fields
    if (!punkId || !sellerPubkey || !sellerArkAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'sellerPubkey', 'sellerArkAddress']
      })
    }

    // Get the listing
    const listing = await getEscrowListing(punkId)

    if (!listing) {
      return res.status(404).json({
        error: 'Listing not found',
        punkId
      })
    }

    // Verify ownership
    if (listing.sellerArkAddress !== sellerArkAddress) {
      console.error(`   ❌ Seller mismatch: expected ${listing.sellerArkAddress}, got ${sellerArkAddress}`)
      return res.status(403).json({
        error: 'Unauthorized: You are not the seller'
      })
    }

    // Additional check against ownership table
    const currentOwner = await getPunkOwner(punkId)
    if (currentOwner && currentOwner !== sellerArkAddress) {
      console.error(`   ❌ Ownership table mismatch: owner is ${currentOwner}`)
      return res.status(403).json({
        error: 'Unauthorized: You do not own this punk',
        actualOwner: currentOwner
      })
    }

    // Check listing status
    if (listing.status === 'sold') {
      return res.status(400).json({
        error: 'Cannot cancel: Punk already sold'
      })
    }

    if (listing.status === 'cancelled') {
      return res.status(400).json({
        error: 'Listing already cancelled'
      })
    }

    // Mark as cancelled
    await updateEscrowStatus(punkId, 'cancelled')

    console.log(`✅ Listing cancelled for punk ${punkId.slice(0, 8)}...`)

    return res.status(200).json({
      success: true,
      punkId,
      status: 'cancelled',
      message: 'Listing cancelled successfully'
    })
  } catch (error: any) {
    console.error('❌ Error cancelling listing:', error)
    return res.status(500).json({
      error: 'Failed to cancel listing',
      details: error.message
    })
  }
}

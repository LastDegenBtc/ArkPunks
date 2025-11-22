/**
 * Escrow Status API
 *
 * GET /api/escrow/status?punkId=xxx
 *
 * Check the status of a punk in escrow
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, getAllEscrowListings } from './_lib/escrowStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId } = req.query

    // If punkId provided, return specific listing
    if (punkId && typeof punkId === 'string') {
      const listing = await getEscrowListing(punkId)

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' })
      }

      return res.status(200).json({
        success: true,
        listing
      })
    }

    // Otherwise, return all active listings
    const listings = await getAllEscrowListings()

    return res.status(200).json({
      success: true,
      count: listings.length,
      listings
    })

  } catch (error: any) {
    console.error('❌ Error getting escrow status:', error)
    return res.status(500).json({
      error: 'Failed to get escrow status',
      details: error.message
    })
  }
}

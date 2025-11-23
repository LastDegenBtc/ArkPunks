/**
 * Update Escrow Outpoint API
 *
 * POST /api/escrow/update-outpoint
 *
 * Updates the VTXO outpoint for an escrow listing after collateral has been sent.
 *
 * DESIGN NOTE: VTXOs are fungible - any ~10k sat VTXO can be used as punk collateral.
 * The seller sends ANY available punk-sized VTXO to escrow, and this endpoint records
 * which VTXO was actually received so escrow can return it later.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { updateEscrowStatus } from './_lib/escrowStore.js'

interface UpdateOutpointRequest {
  punkId: string
  newVtxoOutpoint: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔵 Escrow update-outpoint endpoint called')
  console.log('   Method:', req.method)

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId, newVtxoOutpoint } = req.body as UpdateOutpointRequest

    console.log('   Updating outpoint for punk:', punkId)
    console.log('   New outpoint:', newVtxoOutpoint)

    // Validate required fields
    if (!punkId || !newVtxoOutpoint) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'newVtxoOutpoint']
      })
    }

    // Debug: Check if we can read the listing first
    console.log('   📋 Checking if listing exists...')
    const { getEscrowListing } = await import('./_lib/escrowStore.js')
    const existingListing = await getEscrowListing(punkId)

    if (!existingListing) {
      console.error(`   ❌ Listing not found for punkId: ${punkId}`)
      console.error(`   This means the /api/escrow/list call may have failed silently`)
      return res.status(404).json({
        error: 'Listing not found',
        details: `No escrow listing found for punk ${punkId}. Please create a listing first.`,
        punkId
      })
    }

    console.log(`   ✅ Found existing listing with status: ${existingListing.status}`)

    // Update the outpoint in the escrow listing
    await updateEscrowStatus(punkId, 'deposited', {
      punkVtxoOutpoint: newVtxoOutpoint,
      depositedAt: Date.now()
    })

    console.log(`✅ Updated outpoint for punk ${punkId}`)

    return res.status(200).json({
      success: true,
      punkId,
      newVtxoOutpoint,
      message: 'Escrow outpoint updated successfully'
    })

  } catch (error: any) {
    console.error('❌ Error updating escrow outpoint:', error)
    return res.status(500).json({
      error: 'Failed to update escrow outpoint',
      details: error.message
    })
  }
}

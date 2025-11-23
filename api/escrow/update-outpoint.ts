/**
 * Update Escrow Outpoint API
 *
 * POST /api/escrow/update-outpoint
 *
 * Updates the VTXO outpoint for an escrow listing after the punk has been sent to escrow.
 * This is necessary because wallet.send() creates a new VTXO with a new outpoint.
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

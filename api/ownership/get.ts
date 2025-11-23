/**
 * Get Punk Ownership API
 *
 * GET /api/ownership/get?punkId=...
 *
 * Returns the current owner (Arkade address) for a punk.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPunkOwner } from './_lib/ownershipStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔍 Ownership get endpoint called')

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId } = req.query

    if (!punkId || typeof punkId !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid punkId parameter'
      })
    }

    const owner = await getPunkOwner(punkId)

    if (!owner) {
      return res.status(404).json({
        error: 'Punk not found in ownership table',
        punkId
      })
    }

    return res.status(200).json({
      punkId,
      owner
    })

  } catch (error: any) {
    console.error('❌ Error getting punk owner:', error)
    return res.status(500).json({
      error: 'Failed to get punk owner',
      details: error.message
    })
  }
}

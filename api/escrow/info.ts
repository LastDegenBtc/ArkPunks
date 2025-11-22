/**
 * Escrow Info API
 *
 * GET /api/escrow/info
 *
 * Returns escrow wallet information (address and pubkey)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ESCROW_ADDRESS, ESCROW_PUBKEY } from './_lib/escrowStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    return res.status(200).json({
      escrowAddress: ESCROW_ADDRESS,
      escrowPubkey: ESCROW_PUBKEY,
      network: ESCROW_ADDRESS.startsWith('arkm') ? 'mainnet' : 'testnet'
    })
  } catch (error: any) {
    console.error('❌ Error getting escrow info:', error)
    return res.status(500).json({
      error: 'Failed to get escrow info',
      details: error.message
    })
  }
}

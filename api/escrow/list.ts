/**
 * Escrow Listing API
 *
 * POST /api/escrow/list
 *
 * Allows a seller to list their punk in escrow mode.
 * Returns the escrow address where the seller must send their punk VTXO.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowAddress } from './_lib/escrowWallet'
import { createEscrowListing } from './_lib/escrowStore'

interface ListRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
  price: string // bigint as string
  punkVtxoOutpoint: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔵 Escrow list endpoint called')
  console.log('   Method:', req.method)
  console.log('   Env check:', process.env.ESCROW_WALLET_ADDRESS ? 'SET' : 'NOT SET')

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      punkId,
      sellerPubkey,
      sellerArkAddress,
      price,
      punkVtxoOutpoint
    } = req.body as ListRequest

    console.log('   Received listing request for punk:', punkId)

    // Validate required fields
    if (!punkId || !sellerPubkey || !sellerArkAddress || !price || !punkVtxoOutpoint) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'sellerPubkey', 'sellerArkAddress', 'price', 'punkVtxoOutpoint']
      })
    }

    // Get escrow wallet address
    const escrowAddress = getEscrowAddress()

    // Create escrow listing
    createEscrowListing({
      punkId,
      sellerPubkey,
      sellerArkAddress,
      price,
      punkVtxoOutpoint,
      escrowAddress,
      status: 'pending',
      createdAt: Date.now()
    })

    console.log(`✅ Created escrow listing for punk ${punkId}`)
    console.log(`   Price: ${price} sats`)
    console.log(`   Seller must send punk VTXO to: ${escrowAddress}`)

    // Return escrow address to seller
    return res.status(200).json({
      success: true,
      punkId,
      escrowAddress,
      price,
      message: 'Please send your punk VTXO to the escrow address',
      instructions: [
        `1. Send your punk VTXO (${punkVtxoOutpoint}) to ${escrowAddress}`,
        '2. Once received, your punk will appear on the marketplace',
        '3. When sold, you will receive payment automatically (minus 0.5% fee)'
      ]
    })

  } catch (error: any) {
    console.error('❌ Error creating escrow listing:', error)
    return res.status(500).json({
      error: 'Failed to create escrow listing',
      details: error.message
    })
  }
}

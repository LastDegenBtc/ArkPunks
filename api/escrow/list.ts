/**
 * Simplified Escrow Listing API
 *
 * POST /api/escrow/list
 *
 * Creates a marketplace listing immediately (no VTXO deposit needed).
 * Seller keeps their punk until a buyer purchases it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowAddress } from './_lib/escrowWallet.js'
import { createEscrowListing, getEscrowListing } from './_lib/escrowStore.js'
import { getPunkOwner, setPunkOwner } from '../ownership/_lib/ownershipStore.js'

interface ListRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
  price: string // bigint as string
  punkVtxoOutpoint: string
  compressedMetadata?: string // Punk metadata (compressed hex) - stored for buyer recovery
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔵 Simplified escrow list endpoint called')

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
      punkVtxoOutpoint,
      compressedMetadata
    } = req.body as ListRequest

    console.log(`   Listing punk ${punkId.slice(0, 8)}... for ${price} sats`)
    console.log(`   Seller: ${sellerArkAddress.slice(0, 20)}...`)

    // Validate required fields
    if (!punkId || !sellerPubkey || !sellerArkAddress || !price) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'sellerPubkey', 'sellerArkAddress', 'price']
      })
    }

    // Check if already listed
    const existingListing = await getEscrowListing(punkId)
    if (existingListing && existingListing.status === 'pending') {
      console.log('   ⚠️ Punk already listed')
      return res.status(400).json({
        error: 'Punk already listed',
        listing: existingListing
      })
    }

    // Verify ownership (if ownership table has data)
    const currentOwner = await getPunkOwner(punkId)
    if (currentOwner && currentOwner !== sellerArkAddress) {
      console.error(`   ❌ Ownership mismatch: expected ${currentOwner}, got ${sellerArkAddress}`)
      return res.status(403).json({
        error: 'You do not own this punk',
        actualOwner: currentOwner
      })
    }

    // If ownership table is empty for this punk, initialize it
    if (!currentOwner) {
      console.log(`   📝 Initializing ownership: ${punkId.slice(0, 8)}... → ${sellerArkAddress.slice(0, 20)}...`)
      await setPunkOwner(punkId, sellerArkAddress)
    }

    const escrowAddress = getEscrowAddress()

    // Create listing immediately (no deposit needed)
    await createEscrowListing({
      punkId,
      sellerPubkey,
      sellerArkAddress,
      price,
      punkVtxoOutpoint: punkVtxoOutpoint || 'unknown',
      escrowAddress,
      compressedMetadata,
      status: 'pending', // Active immediately
      createdAt: Date.now()
    })

    console.log(`✅ Listing created and active immediately`)

    return res.status(200).json({
      success: true,
      punkId,
      escrowAddress,
      price,
      message: 'Punk listed successfully'
    })

  } catch (error: any) {
    console.error('❌ Error creating listing:', error)
    return res.status(500).json({
      error: 'Failed to create listing',
      details: error.message
    })
  }
}

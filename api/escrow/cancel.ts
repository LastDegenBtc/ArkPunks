/**
 * Escrow Cancel API
 *
 * POST /api/escrow/cancel
 *
 * Allows a seller to cancel their listing and get their punk back from escrow.
 * Verifies ownership and returns the punk VTXO to the seller.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowListing, updateEscrowStatus } from './_lib/escrowStore.js'
import { getEscrowWallet } from './_lib/escrowArkadeWallet.js'

interface CancelRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔴 Escrow cancel endpoint called')
  console.log('   Method:', req.method)

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

    console.log('   Received cancel request for punk:', punkId)
    console.log('   From seller:', sellerArkAddress.slice(0, 20) + '...')

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

    // Verify ownership - seller must match
    if (listing.sellerPubkey !== sellerPubkey || listing.sellerArkAddress !== sellerArkAddress) {
      console.error('❌ Ownership verification failed')
      console.error(`   Expected seller: ${listing.sellerArkAddress}`)
      console.error(`   Actual seller: ${sellerArkAddress}`)
      return res.status(403).json({
        error: 'Unauthorized: You are not the seller of this punk'
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

    // If pending (punk not yet sent to escrow), just mark as cancelled
    if (listing.status === 'pending') {
      await updateEscrowStatus(punkId, 'cancelled')

      console.log(`✅ Cancelled pending listing for punk ${punkId}`)

      return res.status(200).json({
        success: true,
        punkId,
        status: 'cancelled',
        message: 'Listing cancelled (punk was never sent to escrow)'
      })
    }

    // If deposited, we need to return the punk to the seller
    if (listing.status === 'deposited') {
      console.log(`📦 Returning punk ${punkId} from escrow to seller`)
      console.log(`   Seller address: ${sellerArkAddress}`)

      try {
        // Get escrow wallet
        const escrowWallet = await getEscrowWallet()

        // Find the punk VTXO in escrow wallet
        const vtxos = await escrowWallet.getVtxos()
        const punkVtxo = vtxos.find(v =>
          `${v.vtxo.outpoint.txid}:${v.vtxo.outpoint.vout}` === listing.punkVtxoOutpoint
        )

        if (!punkVtxo) {
          console.error('❌ Punk VTXO not found in escrow wallet')
          console.error(`   Expected outpoint: ${listing.punkVtxoOutpoint}`)
          console.error(`   Available VTXOs: ${vtxos.length}`)
          vtxos.forEach(v => {
            console.error(`   - ${v.vtxo.outpoint.txid}:${v.vtxo.outpoint.vout}`)
          })

          return res.status(500).json({
            error: 'Punk VTXO not found in escrow wallet',
            details: 'The punk may have already been returned or sold'
          })
        }

        console.log(`   Found punk VTXO: ${punkVtxo.vtxo.amount} sats`)

        // Send punk back to seller
        const txid = await escrowWallet.send(
          sellerArkAddress,
          BigInt(punkVtxo.vtxo.amount),
          undefined
        )

        console.log(`✅ Punk returned to seller: ${txid}`)

        // Update listing status
        await updateEscrowStatus(punkId, 'cancelled', {
          punkTransferTxid: txid
        })

        return res.status(200).json({
          success: true,
          punkId,
          status: 'cancelled',
          txid,
          message: 'Punk returned to your wallet',
          details: {
            returnAddress: sellerArkAddress,
            amount: punkVtxo.vtxo.amount
          }
        })

      } catch (error: any) {
        console.error('❌ Error returning punk to seller:', error)
        return res.status(500).json({
          error: 'Failed to return punk to seller',
          details: error.message
        })
      }
    }

    // Should never reach here
    return res.status(400).json({
      error: 'Invalid listing status',
      status: listing.status
    })

  } catch (error: any) {
    console.error('❌ Error cancelling escrow listing:', error)
    return res.status(500).json({
      error: 'Failed to cancel listing',
      details: error.message
    })
  }
}

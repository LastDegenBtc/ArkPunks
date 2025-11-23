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
import { SimplePool, finalizeEvent, type EventTemplate } from 'nostr-tools'
import { hex } from '@scure/base'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

const KIND_PUNK_LISTING = 1401

interface CancelRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔴 Escrow cancel endpoint called')
  console.log('   Method:', req.method)
  console.log('   Body:', req.body)

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
      console.warn(`⚠️ No escrow listing found for punk ${punkId}`)
      console.warn('   This punk may have been listed before escrow blob storage was implemented')
      console.warn('   Or the listing was never properly created in blob storage')

      return res.status(404).json({
        error: 'Listing not found in escrow system',
        punkId,
        suggestion: 'This punk may need to be delisted from Nostr directly. Please contact support or relist the punk.'
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
        console.log('   Step 1: Initializing escrow wallet...')
        const escrowWallet = await getEscrowWallet()
        console.log(`   ✅ Escrow wallet initialized: ${escrowWallet.arkadeAddress}`)

        // Find the punk VTXO in escrow wallet
        // SDK returns flat structure: { txid, vout, value }
        console.log('   Step 2: Fetching VTXOs from escrow wallet...')
        const vtxos = await escrowWallet.getVtxos()
        console.log(`   ✅ Found ${vtxos.length} VTXOs in escrow wallet`)

        console.log(`   Step 3: Searching for VTXO outpoint: ${listing.punkVtxoOutpoint}`)

        // Log all VTXOs for debugging
        vtxos.forEach((v, i) => {
          console.log(`   VTXO[${i}]: ${v.txid}:${v.vout} (${v.value} sats)`)
        })

        // Try to find by exact outpoint first
        let punkVtxo = vtxos.find(v =>
          `${v.txid}:${v.vout}` === listing.punkVtxoOutpoint
        )

        // If not found by outpoint (may have changed due to Arkade round),
        // try to find by value (punk VTXOs are typically ~10,100 sats)
        if (!punkVtxo && listing.punkVtxoOutpoint !== 'unknown') {
          console.warn('   ⚠️ Exact VTXO not found, searching by value...')
          punkVtxo = vtxos.find(v => v.value >= 10000 && v.value <= 10500)

          if (punkVtxo) {
            console.log(`   📍 Found punk-sized VTXO: ${punkVtxo.txid}:${punkVtxo.vout}`)
          }
        }

        if (!punkVtxo) {
          console.error('❌ Punk VTXO not found in escrow wallet')
          console.error(`   Expected outpoint: ${listing.punkVtxoOutpoint}`)
          console.error(`   Available VTXOs:`)
          vtxos.forEach(v => {
            console.error(`   - ${v.txid}:${v.vout} (${v.value} sats)`)
          })

          return res.status(500).json({
            error: 'Punk VTXO not found in escrow wallet',
            details: 'The punk may have been affected by an Arkade round. Please contact support for manual return.'
          })
        }

        console.log(`   Found punk VTXO: ${punkVtxo.value} sats at ${punkVtxo.txid}:${punkVtxo.vout}`)

        // Send punk back to seller
        const txid = await escrowWallet.send(
          sellerArkAddress,
          BigInt(punkVtxo.value)
        )

        console.log(`✅ Punk returned to seller: ${txid}`)

        // Publish delist event to Nostr (using seller's key)
        // NOTE: Client should also publish this event for redundancy
        console.log('   Publishing delist event to Nostr...')

        try {
          const pool = new SimplePool()
          const currentNetwork = 'mainnet'

          const delistEvent: EventTemplate = {
            kind: KIND_PUNK_LISTING,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ['t', 'arkade-punk-delist'],
              ['punk_id', punkId],
              ['price', '0'],
              ['network', currentNetwork],
              ['sale_mode', 'escrow']
            ],
            content: `Listing cancelled by seller`
          }

          // Sign with seller's key (this requires seller to provide signature)
          // For now, we rely on client-side delist + blob storage removal
          // TODO: Implement server-side delist event signing

          console.log('   ⚠️ Server-side Nostr delist not implemented - relying on client-side delist')

          pool.close(RELAYS)
        } catch (error: any) {
          console.warn('   ⚠️ Failed to publish delist event:', error.message)
          // Don't fail the whole operation if delist publishing fails
        }

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
            amount: punkVtxo.value
          }
        })

      } catch (error: any) {
        console.error('❌ Error returning punk to seller:', error)
        console.error('   Error name:', error.name)
        console.error('   Error message:', error.message)
        console.error('   Error stack:', error.stack)

        return res.status(500).json({
          error: 'Failed to return punk to seller',
          details: error.message,
          errorType: error.name,
          listing: {
            punkId: listing.punkId,
            status: listing.status,
            punkVtxoOutpoint: listing.punkVtxoOutpoint,
            sellerAddress: listing.sellerArkAddress
          }
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

/**
 * Check Escrow Deposits
 *
 * Read-only endpoint to see what VTXOs are in escrow wallet
 * and who they would be returned to.
 * Does NOT send any transactions.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowWallet } from './_lib/escrowArkadeWallet.js'
import { getAllEscrowListings } from './_lib/escrowStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔍 Checking escrow deposits...')

  try {
    // Get escrow wallet
    const escrowWallet = await getEscrowWallet()
    const vtxos = await escrowWallet.getVtxos()

    console.log(`   Found ${vtxos.length} VTXOs in escrow wallet`)

    if (vtxos.length === 0) {
      return res.status(200).json({
        success: true,
        totalVtxos: 0,
        totalSats: 0,
        vtxos: [],
        message: 'No VTXOs in escrow wallet'
      })
    }

    // Debug: Log first VTXO structure
    if (vtxos.length > 0) {
      console.log('   VTXO structure sample:', JSON.stringify(vtxos[0], null, 2))
    }

    // Calculate total sats - SDK returns "value" field directly
    const totalSats = vtxos.reduce((sum, v) => sum + Number(v.value || 0), 0)
    console.log(`   Total: ${totalSats} sats`)

    // Get all listings to match VTXOs to sellers
    const allListings = await getAllEscrowListings()
    console.log(`   Found ${allListings.length} listings in blob storage`)

    // Build lookup map: vtxoOutpoint -> listing
    const vtxoToListing = new Map()
    for (const listing of allListings) {
      if (listing.punkVtxoOutpoint && listing.punkVtxoOutpoint !== 'unknown') {
        vtxoToListing.set(listing.punkVtxoOutpoint, listing)
      }
    }

    console.log(`   Matched ${vtxoToListing.size} VTXOs to listings`)

    // Analyze each VTXO
    const vtxoDetails = []
    let matched = 0
    let unmatched = 0

    for (let i = 0; i < vtxos.length; i++) {
      const vtxo = vtxos[i]

      try {
        // SDK returns flat structure: { txid, vout, value }
        if (!vtxo.txid || vtxo.vout === undefined) {
          console.error(`   ❌ VTXO ${i}: Missing txid or vout`)
          console.error(`      VTXO structure:`, JSON.stringify(vtxo, null, 2))
          continue
        }

        const outpoint = `${vtxo.txid}:${vtxo.vout}`
        const amount = vtxo.value || 0

        const listing = vtxoToListing.get(outpoint)

        if (listing) {
          matched++
          vtxoDetails.push({
            outpoint,
            amount,
            status: 'matched',
            punkId: listing.punkId,
            sellerPubkey: listing.sellerPubkey,
            sellerAddress: listing.sellerArkAddress,
            listingPrice: listing.price,
            listingStatus: listing.status,
            listedAt: new Date(listing.createdAt).toISOString()
          })

          console.log(`   ✅ ${outpoint.slice(0, 16)}... → ${listing.sellerArkAddress.slice(0, 20)}...`)
          console.log(`      Punk: ${listing.punkId.slice(0, 16)}... | Amount: ${amount} sats`)
        } else {
          unmatched++
          vtxoDetails.push({
            outpoint,
            amount,
            status: 'unmatched',
            warning: 'No matching listing found in blob storage'
          })

          console.warn(`   ⚠️ ${outpoint.slice(0, 16)}... → NO MATCH (${amount} sats)`)
        }
      } catch (error) {
        console.error(`   ❌ Error processing VTXO ${i}:`, error)
        console.error(`      VTXO data:`, JSON.stringify(vtxo, null, 2))
      }
    }

    console.log('✅ Check complete!')
    console.log(`   Total VTXOs: ${vtxos.length}`)
    console.log(`   Total sats: ${totalSats}`)
    console.log(`   Matched: ${matched}`)
    console.log(`   Unmatched: ${unmatched}`)

    return res.status(200).json({
      success: true,
      totalVtxos: vtxos.length,
      totalSats,
      matched,
      unmatched,
      vtxos: vtxoDetails,
      summary: {
        message: `Found ${vtxos.length} VTXOs (${totalSats} sats total)`,
        matchedCount: matched,
        unmatchedCount: unmatched,
        unmatchedWarning: unmatched > 0 ?
          `${unmatched} VTXO(s) have no matching listing - these would need manual handling` :
          null
      }
    })

  } catch (error: any) {
    console.error('❌ Check failed:', error)
    return res.status(500).json({
      error: 'Check failed',
      details: error.message
    })
  }
}

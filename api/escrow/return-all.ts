/**
 * Return All VTXOs from Escrow
 *
 * Returns all VTXOs in the escrow wallet back to their owners.
 * Uses blob storage to match VTXOs to seller addresses.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowWallet } from './_lib/escrowArkadeWallet.js'
import { getAllEscrowListings } from './_lib/escrowStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('💸 Return all VTXOs from escrow started...')

  try {
    // Get escrow wallet
    const escrowWallet = await getEscrowWallet()
    const vtxos = await escrowWallet.getVtxos()

    console.log(`   Found ${vtxos.length} VTXOs in escrow wallet`)

    if (vtxos.length === 0) {
      return res.status(200).json({
        success: true,
        returned: 0,
        message: 'No VTXOs in escrow wallet'
      })
    }

    // Get all listings to match VTXOs to sellers
    const allListings = await getAllEscrowListings()
    console.log(`   Found ${allListings.length} listings in blob storage`)

    // Build lookup map: vtxoOutpoint -> sellerAddress
    const vtxoToSeller = new Map<string, { address: string, pubkey: string, punkId: string }>()

    for (const listing of allListings) {
      if (listing.punkVtxoOutpoint && listing.punkVtxoOutpoint !== 'unknown') {
        vtxoToSeller.set(listing.punkVtxoOutpoint, {
          address: listing.sellerArkAddress,
          pubkey: listing.sellerPubkey,
          punkId: listing.punkId
        })
      }
    }

    console.log(`   Matched ${vtxoToSeller.size} VTXOs to sellers`)

    // Return each VTXO
    const results = []
    let returned = 0
    let errors = 0

    for (const vtxo of vtxos) {
      const outpoint = `${vtxo.vtxo.outpoint.txid}:${vtxo.vtxo.outpoint.vout}`
      const seller = vtxoToSeller.get(outpoint)

      if (!seller) {
        console.warn(`   ⚠️ No seller found for VTXO ${outpoint.slice(0, 16)}... (${vtxo.vtxo.amount} sats)`)
        console.warn(`      This VTXO will be returned to escrow address owner manually`)
        errors++
        results.push({
          outpoint,
          amount: vtxo.vtxo.amount,
          status: 'no_seller_found',
          error: 'No matching listing found'
        })
        continue
      }

      try {
        console.log(`   📤 Returning ${vtxo.vtxo.amount} sats to ${seller.address.slice(0, 20)}...`)
        console.log(`      Punk ID: ${seller.punkId.slice(0, 16)}...`)

        const txid = await escrowWallet.send(
          seller.address,
          BigInt(vtxo.vtxo.amount),
          undefined
        )

        console.log(`      ✅ Sent! TXID: ${txid}`)
        returned++

        results.push({
          outpoint,
          amount: vtxo.vtxo.amount,
          punkId: seller.punkId,
          sellerAddress: seller.address,
          txid,
          status: 'returned'
        })

      } catch (error: any) {
        console.error(`      ❌ Failed to return VTXO: ${error.message}`)
        errors++

        results.push({
          outpoint,
          amount: vtxo.vtxo.amount,
          punkId: seller.punkId,
          sellerAddress: seller.address,
          status: 'error',
          error: error.message
        })
      }
    }

    console.log('✅ Return all complete!')
    console.log(`   Total VTXOs: ${vtxos.length}`)
    console.log(`   Returned: ${returned}`)
    console.log(`   Errors: ${errors}`)

    return res.status(200).json({
      success: true,
      totalVtxos: vtxos.length,
      returned,
      errors,
      results,
      message: `Returned ${returned} VTXOs to their owners`
    })

  } catch (error: any) {
    console.error('❌ Return all failed:', error)
    return res.status(500).json({
      error: 'Return all failed',
      details: error.message
    })
  }
}

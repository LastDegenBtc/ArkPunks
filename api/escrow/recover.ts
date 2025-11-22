/**
 * Escrow Recovery Script
 *
 * Recovers escrow listings from Nostr events and rebuilds blob storage.
 * Run this to recover lost escrow data.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SimplePool } from 'nostr-tools'
import { createEscrowListing, getAllEscrowListings } from './_lib/escrowStore.js'
import { getEscrowAddress } from './_lib/escrowWallet.js'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

const KIND_PUNK_LISTING = 1401

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔄 Escrow recovery started...')

  try {
    // Get current escrow address
    const escrowAddress = getEscrowAddress()
    console.log('   Escrow address:', escrowAddress)

    // Fetch all escrow-mode listings from Nostr
    const pool = new SimplePool()

    const currentNetwork = 'mainnet'
    console.log('   Fetching Nostr events for network:', currentNetwork)

    const allListingEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_LISTING],
      limit: 1000
    })

    console.log(`   Found ${allListingEvents.length} total listing events`)

    // Filter for escrow mode listings on current network
    const escrowListings = allListingEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      const saleModeTag = e.tags.find(t => t[0] === 'sale_mode')
      const priceTag = e.tags.find(t => t[0] === 'price')

      return networkTag?.[1] === currentNetwork &&
             saleModeTag?.[1] === 'escrow' &&
             priceTag?.[1] !== '0' // Not delisted
    })

    console.log(`   Found ${escrowListings.length} escrow listings`)

    // Get existing blob storage entries
    const existingListings = await getAllEscrowListings()
    const existingPunkIds = new Set(existingListings.map(l => l.punkId))
    console.log(`   Existing blob entries: ${existingListings.length}`)

    // Group by punk ID and keep most recent
    const latestByPunk = new Map()
    for (const event of escrowListings) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]
      const existing = latestByPunk.get(punkId)

      if (!existing || event.created_at > existing.created_at) {
        latestByPunk.set(punkId, event)
      }
    }

    console.log(`   Unique punks: ${latestByPunk.size}`)

    // Recreate missing blob entries
    let recovered = 0
    let skipped = 0

    for (const [punkId, event] of latestByPunk.entries()) {
      // Skip if already in blob
      if (existingPunkIds.has(punkId)) {
        skipped++
        continue
      }

      // Extract data from Nostr event
      const priceTag = event.tags.find(t => t[0] === 'price')
      const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
      const arkAddressTag = event.tags.find(t => t[0] === 'ark_address')
      const escrowAddressTag = event.tags.find(t => t[0] === 'escrow_address')

      if (!priceTag || !arkAddressTag) {
        console.warn(`   ⚠️ Missing required tags for punk ${punkId}`)
        continue
      }

      // Create blob entry
      await createEscrowListing({
        punkId,
        sellerPubkey: event.pubkey,
        sellerArkAddress: arkAddressTag[1],
        price: priceTag[1],
        punkVtxoOutpoint: vtxoTag?.[1] || 'unknown', // May be outdated/missing
        escrowAddress: escrowAddressTag?.[1] || escrowAddress,
        status: 'pending', // Will be updated when we detect deposits
        createdAt: event.created_at * 1000 // Convert to ms
      })

      recovered++
      console.log(`   ✅ Recovered: ${punkId.slice(0, 16)}... by ${event.pubkey.slice(0, 8)}...`)
    }

    pool.close(RELAYS)

    console.log('✅ Recovery complete!')
    console.log(`   Total escrow listings: ${latestByPunk.size}`)
    console.log(`   Already in blob: ${skipped}`)
    console.log(`   Recovered: ${recovered}`)

    return res.status(200).json({
      success: true,
      totalEscrowListings: latestByPunk.size,
      existingInBlob: skipped,
      recovered,
      message: `Successfully recovered ${recovered} escrow listings from Nostr`
    })

  } catch (error: any) {
    console.error('❌ Recovery failed:', error)
    return res.status(500).json({
      error: 'Recovery failed',
      details: error.message
    })
  }
}

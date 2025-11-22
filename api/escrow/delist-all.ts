/**
 * Delist All Escrow Listings
 *
 * Publishes delist events (price=0) to Nostr for all escrow listings.
 * Clears the blob storage afterward.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SimplePool, finalizeEvent, type EventTemplate } from 'nostr-tools'
import { hex } from '@scure/base'
import { put } from '@vercel/blob'
import { ESCROW_PRIVATE_KEY, ESCROW_PUBKEY, ESCROW_ADDRESS } from './_lib/escrowStore.js'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

const KIND_PUNK_LISTING = 1401
const BLOB_FILENAME = 'escrow-listings.json'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🗑️ Delist all escrow listings started...')

  // Verify escrow private key is configured
  if (!ESCROW_PRIVATE_KEY || ESCROW_PRIVATE_KEY.length === 0) {
    return res.status(500).json({
      error: 'ESCROW_PRIVATE_KEY not configured'
    })
  }

  try {
    // Fetch all existing escrow listings from Nostr
    // Query by escrow_address tag to find listings pointing to this escrow
    const pool = new SimplePool()
    const currentNetwork = 'mainnet'

    console.log('   Fetching escrow listings from Nostr...')
    console.log('   Target escrow_address:', ESCROW_ADDRESS)

    // Query ALL punk listings (relays don't index escrow_address tag)
    const allListingEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_LISTING],
      limit: 1000
    })

    console.log(`   Found ${allListingEvents.length} total listing events`)

    // Filter for active escrow listings pointing to this escrow
    const escrowListings = allListingEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      const saleModeTag = e.tags.find(t => t[0] === 'sale_mode')
      const priceTag = e.tags.find(t => t[0] === 'price')
      const escrowAddressTag = e.tags.find(t => t[0] === 'escrow_address')

      return networkTag?.[1] === currentNetwork &&
             saleModeTag?.[1] === 'escrow' &&
             escrowAddressTag?.[1] === ESCROW_ADDRESS &&
             priceTag?.[1] !== '0' // Not already delisted
    })

    console.log(`   ${escrowListings.length} active escrow listings to delist`)

    if (escrowListings.length === 0) {
      // Still clear blob storage
      await clearBlobStorage()

      return res.status(200).json({
        success: true,
        delisted: 0,
        message: 'No active escrow listings found. Blob storage cleared.'
      })
    }

    // Publish delist event for each listing
    let delisted = 0
    let errors = 0

    for (const event of escrowListings) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]

      try {
        // Create delist event (price = 0)
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
          content: `Escrow listing cancelled - marketplace maintenance`
        }

        const signedEvent = finalizeEvent(delistEvent, hex.decode(ESCROW_PRIVATE_KEY))
        await Promise.any(pool.publish(RELAYS, signedEvent))

        console.log(`   ✅ Delisted: ${punkId.slice(0, 16)}...`)
        delisted++

      } catch (error: any) {
        console.error(`   ❌ Failed to delist ${punkId.slice(0, 16)}...: ${error.message}`)
        errors++
      }
    }

    pool.close(RELAYS)

    // Clear blob storage
    await clearBlobStorage()

    console.log('✅ Delist all complete!')
    console.log(`   Delisted: ${delisted}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Blob storage cleared`)

    return res.status(200).json({
      success: true,
      totalListings: escrowListings.length,
      delisted,
      errors,
      message: `Delisted ${delisted} escrow listings and cleared blob storage`
    })

  } catch (error: any) {
    console.error('❌ Delist all failed:', error)
    return res.status(500).json({
      error: 'Delist all failed',
      details: error.message
    })
  }
}

/**
 * Clear blob storage
 */
async function clearBlobStorage(): Promise<void> {
  const emptyStore = {
    listings: {},
    lastUpdated: Date.now()
  }

  await put(BLOB_FILENAME, JSON.stringify(emptyStore, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  })

  console.log('   🗑️ Blob storage cleared')
}

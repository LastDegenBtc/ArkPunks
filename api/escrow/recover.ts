/**
 * Escrow Recovery Script
 *
 * Recovers escrow listings from Nostr events and rebuilds blob storage.
 * Run this to recover lost escrow data.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SimplePool } from 'nostr-tools'
import type { EscrowListing } from './_lib/escrowStore.js'
import { getEscrowAddress } from './_lib/escrowWallet.js'
import { put, list } from '@vercel/blob'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

const KIND_PUNK_LISTING = 1401
const BLOB_FILENAME = 'escrow-listings.json'

interface EscrowStore {
  listings: Record<string, EscrowListing>
  lastUpdated: number
}

/**
 * Read existing blob store (if it exists)
 */
async function readExistingStore(): Promise<EscrowStore> {
  try {
    const { blobs } = await list()
    const storeBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!storeBlob) {
      console.log('   No existing blob found, starting fresh')
      return { listings: {}, lastUpdated: Date.now() }
    }

    const response = await fetch(storeBlob.url)
    const text = await response.text()

    // Check if we got HTML error page instead of JSON
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      console.warn('   Blob returned HTML instead of JSON, starting fresh')
      return { listings: {}, lastUpdated: Date.now() }
    }

    const store: EscrowStore = JSON.parse(text)
    console.log(`   Loaded existing blob with ${Object.keys(store.listings).length} listings`)
    return store
  } catch (error) {
    console.warn('   Failed to read existing blob, starting fresh:', error)
    return { listings: {}, lastUpdated: Date.now() }
  }
}

/**
 * Write complete store to blob
 */
async function writeCompleteStore(store: EscrowStore): Promise<void> {
  store.lastUpdated = Date.now()
  await put(BLOB_FILENAME, JSON.stringify(store, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  })
  console.log(`   ✅ Wrote blob with ${Object.keys(store.listings).length} listings`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔄 Escrow recovery started...')

  try {
    // Get current escrow address
    const escrowAddress = getEscrowAddress()
    console.log('   Escrow address:', escrowAddress)

    // Read existing blob store
    const store = await readExistingStore()
    const existingPunkIds = new Set(Object.keys(store.listings))

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

    // Build listings in memory
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

      // Add to in-memory store
      store.listings[punkId] = {
        punkId,
        sellerPubkey: event.pubkey,
        sellerArkAddress: arkAddressTag[1],
        price: priceTag[1],
        punkVtxoOutpoint: vtxoTag?.[1] || 'unknown', // May be outdated/missing
        escrowAddress: escrowAddressTag?.[1] || escrowAddress,
        status: 'pending', // Will be updated when we detect deposits
        createdAt: event.created_at * 1000 // Convert to ms
      }

      recovered++
      if (recovered % 50 === 0) {
        console.log(`   📝 Processed ${recovered} listings...`)
      }
    }

    // Write complete store to blob once
    await writeCompleteStore(store)

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

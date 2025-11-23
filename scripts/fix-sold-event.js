/**
 * Fix Sold Event Migration
 *
 * Publishes a corrected sold event with:
 * - Correct KIND (1402 instead of 1404)
 * - Compressed metadata included
 *
 * Run this for punk a02ee092... to fix the buyer not receiving it
 */

import { SimplePool, finalizeEvent } from 'nostr-tools'
import { hex } from '@scure/base'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

const KIND_PUNK_LISTING = 1401
const KIND_PUNK_SOLD = 1402  // Correct kind

// From blob
const PUNK_ID = 'a02ee092d90840034b83c2e1e1bcbbcc388b7ce48475f1cfb829cf62932ae1ff'
const SELLER_PUBKEY = '149e41111b6148c38d83c6cae21ff6f4daa11c06d6d3486aa7c4869c572fec67'
const BUYER_PUBKEY = 'd7093faab55ca0b7650d1ce974e2006aafb4dea7211bd2aa052fb58b3b88064e'
const PRICE = '10200'
const TXID = '2f9714d25424314b484fb23b18f5ca6c39ed36ae93785837d92d80d23a4fa330'
const NETWORK = 'mainnet'

// Escrow private key - get from env
const ESCROW_PRIVATE_KEY = process.env.ESCROW_WALLET_PRIVATE_KEY

if (!ESCROW_PRIVATE_KEY) {
  console.error('❌ ESCROW_WALLET_PRIVATE_KEY not set')
  process.exit(1)
}

async function fixSoldEvent() {
  const pool = new SimplePool()

  try {
    // 1. Find original listing event to get compressed metadata
    console.log('🔍 Fetching original listing event...')
    const listingEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_LISTING],
      authors: [SELLER_PUBKEY],
      limit: 100
    })

    const listingEvent = listingEvents.find(e => {
      const punkIdTag = e.tags.find(t => t[0] === 'punk_id')
      return punkIdTag && punkIdTag[1] === PUNK_ID
    })

    if (!listingEvent) {
      console.error('❌ Could not find original listing event')
      process.exit(1)
    }

    const compressedTag = listingEvent.tags.find(t => t[0] === 'compressed')
    if (!compressedTag) {
      console.error('❌ Listing event has no compressed metadata')
      process.exit(1)
    }

    const compressedMetadata = compressedTag[1]
    console.log(`✅ Found compressed metadata (${compressedMetadata.length} chars)`)

    // 2. Publish corrected sold event
    console.log('📝 Publishing corrected sold event...')

    const soldEventTemplate = {
      kind: KIND_PUNK_SOLD,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-sold'],
        ['punk_id', PUNK_ID],
        ['seller', SELLER_PUBKEY],
        ['buyer', BUYER_PUBKEY],
        ['price', PRICE],
        ['txid', TXID],
        ['network', NETWORK],
        ['compressed', compressedMetadata]
      ],
      content: `Punk ${PUNK_ID} sold via escrow for ${PRICE} sats (CORRECTED EVENT)`
    }

    const signedEvent = finalizeEvent(soldEventTemplate, hex.decode(ESCROW_PRIVATE_KEY))

    await Promise.any(pool.publish(RELAYS, signedEvent))

    console.log('✅ Corrected sold event published!')
    console.log('   Event ID:', signedEvent.id)
    console.log('   Kind:', signedEvent.kind)
    console.log('   Buyer:', BUYER_PUBKEY.slice(0, 16) + '...')
    console.log('   Metadata included: YES')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    pool.close(RELAYS)
  }
}

fixSoldEvent()

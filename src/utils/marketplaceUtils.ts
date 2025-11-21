/**
 * Marketplace utilities for ArkPunks
 * Handles listing, buying, and fetching marketplace data from Nostr
 */

import { SimplePool, type Event as NostrEvent, finalizeEvent, type EventTemplate, getPublicKey } from 'nostr-tools'
import { hex } from '@scure/base'
import { decompressPunkMetadata } from './compression'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

// Event kinds (Mainnet Launch - Nov 21, 2025)
const KIND_PUNK_LISTING = 1401  // Marketplace listing (was 1338)
const KIND_PUNK_SOLD = 1402     // Punk sold event (was 1339)
const KIND_PUNK_TRANSFER = 1403 // Direct punk transfer (was 1340)

export type SaleMode = 'escrow' | 'p2p'

export interface MarketplaceListing {
  punkId: string
  owner: string // Nostr pubkey
  ownerArkAddress: string // Arkade address for payment
  listingPrice: bigint
  metadata: any
  vtxoOutpoint: string
  listedAt: number
  saleMode?: SaleMode // 'escrow' (server-managed) or 'p2p' (HTLC)
  escrowAddress?: string // Only for escrow mode
}

/**
 * Get all punks currently listed for sale
 */
export async function getMarketplaceListings(): Promise<MarketplaceListing[]> {
  const pool = new SimplePool()

  try {
    // Determine current network
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'testnet'
    console.log(`📊 Marketplace: Filtering for network: ${currentNetwork}`)

    // Query for ALL listing events (including delist events) AND sold events
    const [listingEvents, soldEvents] = await Promise.all([
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_LISTING],
        '#network': [currentNetwork], // Filter by network
        limit: 1000
      }),
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_SOLD],
        '#network': [currentNetwork], // Filter by network
        limit: 1000
      })
    ])

    // Create a map of sold punks with their sold timestamp
    const soldPunksMap = new Map<string, number>()
    for (const event of soldEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (punkIdTag) {
        const punkId = punkIdTag[1]
        const existingTimestamp = soldPunksMap.get(punkId)
        // Keep the most recent sold event
        if (!existingTimestamp || event.created_at > existingTimestamp) {
          soldPunksMap.set(punkId, event.created_at)
        }
      }
    }

    console.log(`📊 Marketplace: Found ${listingEvents.length} listing events, ${soldEvents.length} sold events`)

    // Group events by punkId and keep only the most recent per punk
    const latestEventsByPunk = new Map<string, NostrEvent>()

    for (const event of listingEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]
      const existing = latestEventsByPunk.get(punkId)

      // Keep the most recent event (highest created_at)
      if (!existing || event.created_at > existing.created_at) {
        latestEventsByPunk.set(punkId, event)
      }
    }

    console.log(`📊 Marketplace: ${latestEventsByPunk.size} unique punks with listings`)

    // Parse listings from latest events only
    const listings: MarketplaceListing[] = []

    for (const event of latestEventsByPunk.values()) {
      try {
        const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
        const priceTag = event.tags.find(t => t[0] === 'price')
        const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
        const compressedTag = event.tags.find(t => t[0] === 'compressed')
        const arkAddressTag = event.tags.find(t => t[0] === 'ark_address')
        const saleModeTag = event.tags.find(t => t[0] === 'sale_mode')
        const escrowAddressTag = event.tags.find(t => t[0] === 'escrow_address')

        if (!punkIdTag || !priceTag) {
          continue
        }

        const punkId = punkIdTag[1]
        const price = BigInt(priceTag[1])
        const saleMode = (saleModeTag?.[1] as SaleMode) || 'p2p' // Default to p2p for backward compatibility
        const escrowAddress = escrowAddressTag?.[1]

        // Skip delisted punks (price = 0)
        if (price === 0n) {
          console.log(`   ⏭️  Skipping delisted punk: ${punkId.slice(0, 8)}...`)
          continue
        }

        // Skip sold punks (has a sold event newer than listing)
        const soldTimestamp = soldPunksMap.get(punkId)
        if (soldTimestamp && soldTimestamp > event.created_at) {
          console.log(`   ⏭️  Skipping sold punk: ${punkId.slice(0, 8)}... (sold at ${soldTimestamp})`)
          continue
        }

        // Must have vtxo, compressed, and ark_address for active listings
        if (!vtxoTag || !compressedTag || !arkAddressTag) {
          continue
        }

        const vtxoOutpoint = vtxoTag[1]
        const compressedHex = compressedTag[1]
        const ownerArkAddress = arkAddressTag[1]

        // Validate compressed hex
        if (!compressedHex || compressedHex.length === 0) {
          console.warn('Empty compressed hex for punk:', punkId)
          continue
        }

        // Decompress metadata
        const hexMatch = compressedHex.match(/.{1,2}/g)
        if (!hexMatch) {
          console.warn('Invalid compressed hex format for punk:', punkId, compressedHex)
          continue
        }

        const compressedBytes = new Uint8Array(
          hexMatch.map(byte => parseInt(byte, 16))
        )
        const metadata = decompressPunkMetadata({ data: compressedBytes }, punkId)

        listings.push({
          punkId,
          owner: event.pubkey,
          ownerArkAddress,
          listingPrice: price,
          metadata,
          vtxoOutpoint,
          listedAt: event.created_at,
          saleMode,
          escrowAddress
        })

        console.log(`   ✅ Active listing: ${metadata.name} (${price.toLocaleString()} sats) by ${event.pubkey.slice(0, 8)}...`)
      } catch (err) {
        console.warn('Failed to parse listing event:', err)
      }
    }

    // Sort by most recent first
    listings.sort((a, b) => b.listedAt - a.listedAt)

    console.log(`📊 Marketplace: Returning ${listings.length} active listings`)

    return listings

  } catch (error) {
    console.error('❌ Failed to fetch marketplace listings:', error)
    return []
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * List a punk for sale
 */
export async function listPunkForSale(
  punkId: string,
  price: bigint,
  vtxoOutpoint: string,
  compressedHex: string,
  privateKey: string,
  arkAddress: string,
  saleMode: SaleMode = 'p2p',
  escrowAddress?: string
): Promise<boolean> {
  const pool = new SimplePool()

  try {
    const pubkey = getPublicKey(hex.decode(privateKey))

    const tags: string[][] = [
      ['t', 'arkade-punk-listing'],
      ['punk_id', punkId],
      ['price', price.toString()],
      ['vtxo', vtxoOutpoint],
      ['compressed', compressedHex],
      ['ark_address', arkAddress],
      ['sale_mode', saleMode]
    ]

    // Add escrow address if in escrow mode
    if (saleMode === 'escrow' && escrowAddress) {
      tags.push(['escrow_address', escrowAddress])
    }

    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_LISTING,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: `Punk ${punkId} listed for ${price} sats (${saleMode === 'escrow' ? 'Escrow Mode' : 'P2P Mode'})`
    }

    const signedEvent = finalizeEvent(eventTemplate, hex.decode(privateKey))

    // Publish to relays
    await Promise.any(pool.publish(RELAYS, signedEvent))

    return true

  } catch (error) {
    console.error('❌ Failed to publish listing:', error)
    return false
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * Delist a punk (remove from sale)
 */
export async function delistPunk(
  punkId: string,
  privateKey: string
): Promise<boolean> {
  const pool = new SimplePool()

  try {
    const pubkey = getPublicKey(hex.decode(privateKey))

    // Publish a "delist" event (price = 0)
    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_LISTING,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-delist'],
        ['punk_id', punkId],
        ['price', '0'],
      ],
      content: `Punk ${punkId} delisted`
    }

    const signedEvent = finalizeEvent(eventTemplate, hex.decode(privateKey))

    await Promise.any(pool.publish(RELAYS, signedEvent))

    return true

  } catch (error) {
    console.error('❌ Failed to delist punk:', error)
    return false
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * Publish a "punk sold" event after successful purchase
 */
export async function publishPunkSold(
  punkId: string,
  sellerPubkey: string,
  price: string,
  txid: string,
  privateKey: string
): Promise<boolean> {
  const pool = new SimplePool()

  try {
    const buyerPubkey = getPublicKey(hex.decode(privateKey))

    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_SOLD,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-sold'],
        ['punk_id', punkId],
        ['seller', sellerPubkey],
        ['buyer', buyerPubkey],
        ['price', price],
        ['txid', txid]
      ],
      content: `Punk ${punkId} sold to ${buyerPubkey.slice(0, 8)}... for ${price} sats`
    }

    const signedEvent = finalizeEvent(eventTemplate, hex.decode(privateKey))

    await Promise.any(pool.publish(RELAYS, signedEvent))

    return true

  } catch (error) {
    console.error('❌ Failed to publish sold event:', error)
    return false
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * Publish a "punk transfer" event for direct transfers (gifts/trades)
 */
export async function publishPunkTransfer(
  punkId: string,
  fromPubkey: string,
  toPubkey: string,
  txid: string,
  privateKey: string
): Promise<boolean> {
  const pool = new SimplePool()

  try {
    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_TRANSFER,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-transfer'],
        ['punk_id', punkId],
        ['from', fromPubkey],
        ['to', toPubkey],
        ['txid', txid]
      ],
      content: `Punk ${punkId} transferred from ${fromPubkey.slice(0, 8)}... to ${toPubkey.slice(0, 8)}...`
    }

    const signedEvent = finalizeEvent(eventTemplate, hex.decode(privateKey))

    await Promise.any(pool.publish(RELAYS, signedEvent))

    return true

  } catch (error) {
    console.error('❌ Failed to publish transfer event:', error)
    return false
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * Sync all punks owned by a user from Nostr (for recovery/import scenarios)
 * Recovers:
 * 1. Punks minted by the user (KIND 1400 events)
 * 2. Punks bought on marketplace (KIND 1402 buyer events)
 * Excludes:
 * - Punks sold and not bought back
 */
export async function syncPunksFromNostr(
  myPubkey: string,
  walletAddress: string
): Promise<Array<{
  punkId: string
  owner: string
  metadata: any
  vtxoOutpoint: string
}>> {
  const pool = new SimplePool()

  try {
    console.log('🔄 Syncing punks from Nostr...')
    console.log('   Nostr pubkey:', myPubkey.slice(0, 8) + '...')
    console.log('   Wallet address:', walletAddress)

    // Query for all mint events by this user
    // IMPORTANT: Query both by Nostr pubkey (authors) AND Bitcoin address (owner tag)
    // This handles cases where Nostr key changed but wallet address stayed the same
    const KIND_PUNK_MINT = 1400

    const [mintEventsByAuthor, mintEventsByOwner] = await Promise.all([
      // Query by Nostr event author (pubkey)
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_MINT],
        authors: [myPubkey],
        limit: 1000
      }),
      // Query by owner tag (Bitcoin address)
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_MINT],
        '#owner': [walletAddress],
        limit: 1000
      })
    ])

    // Combine and deduplicate by punkId
    const mintEventsMap = new Map<string, any>()
    for (const event of [...mintEventsByAuthor, ...mintEventsByOwner]) {
      const punkIdTag = event.tags.find((t: any) => t[0] === 'punk_id')
      if (punkIdTag) {
        const punkId = punkIdTag[1]
        // Keep earliest event if duplicate
        const existing = mintEventsMap.get(punkId)
        if (!existing || event.created_at < existing.created_at) {
          mintEventsMap.set(punkId, event)
        }
      }
    }
    const mintEvents = Array.from(mintEventsMap.values())

    console.log(`   Found ${mintEventsByAuthor.length} mint events by Nostr pubkey`)
    console.log(`   Found ${mintEventsByOwner.length} mint events by wallet address`)
    console.log(`   Total unique mint events: ${mintEvents.length}`)

    // Query for all sold events and transfer events
    // Determine current network
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'testnet'

    const [soldEvents, transferEvents] = await Promise.all([
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_SOLD],
        '#network': [currentNetwork], // Filter by network
        limit: 1000
      }),
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_TRANSFER],
        '#network': [currentNetwork], // Filter by network
        limit: 1000
      })
    ])

    console.log(`   Found ${soldEvents.length} sold events`)
    console.log(`   Found ${transferEvents.length} transfer events`)

    // Build ownership history from sold events and transfers
    const punkOwnership = new Map<string, {
      currentOwner: string | null // null if transferred away
      lastTransferTime: number
    }>()

    // Process sold events (marketplace sales)
    for (const event of soldEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const sellerTag = event.tags.find(t => t[0] === 'seller')
      const buyerTag = event.tags.find(t => t[0] === 'buyer')

      if (!punkIdTag || !sellerTag || !buyerTag) continue

      const punkId = punkIdTag[1]
      const seller = sellerTag[1]
      const buyer = buyerTag[1]
      const timestamp = event.created_at

      const existing = punkOwnership.get(punkId)

      // Update if this is a newer transfer
      if (!existing || timestamp > existing.lastTransferTime) {
        // If I was the seller, I no longer own it (unless I'm also the buyer)
        if (seller === myPubkey && buyer !== myPubkey) {
          punkOwnership.set(punkId, { currentOwner: buyer, lastTransferTime: timestamp })
        }
        // If I was the buyer, I now own it
        else if (buyer === myPubkey) {
          punkOwnership.set(punkId, { currentOwner: myPubkey, lastTransferTime: timestamp })
        }
      }
    }

    // Process transfer events (direct transfers/gifts)
    for (const event of transferEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const fromTag = event.tags.find(t => t[0] === 'from')
      const toTag = event.tags.find(t => t[0] === 'to')

      if (!punkIdTag || !fromTag || !toTag) continue

      const punkId = punkIdTag[1]
      const from = fromTag[1]
      const to = toTag[1]
      const timestamp = event.created_at

      const existing = punkOwnership.get(punkId)

      // Update if this is a newer transfer
      if (!existing || timestamp > existing.lastTransferTime) {
        // If I was the sender, I no longer own it (unless I sent it to myself)
        if (from === myPubkey && to !== myPubkey) {
          punkOwnership.set(punkId, { currentOwner: to, lastTransferTime: timestamp })
        }
        // If I was the receiver, I now own it
        else if (to === myPubkey) {
          punkOwnership.set(punkId, { currentOwner: myPubkey, lastTransferTime: timestamp })
        }
      }
    }

    // Process mint events to recover punk data
    const recoveredPunks: Array<{
      punkId: string
      owner: string
      metadata: any
      vtxoOutpoint: string
    }> = []

    for (const event of mintEvents) {
      try {
        const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
        // Mint events use 'data' tag, not 'compressed'
        const compressedTag = event.tags.find(t => t[0] === 'data')
        const vtxoTag = event.tags.find(t => t[0] === 'vtxo')

        if (!punkIdTag || !compressedTag) {
          console.warn('   Skipping event with missing tags')
          continue
        }

        const punkId = punkIdTag[1]
        const ownership = punkOwnership.get(punkId)

        // Skip if sold and not bought back
        if (ownership && ownership.currentOwner !== myPubkey) {
          console.log(`   Skipping ${punkId}: sold to ${ownership.currentOwner?.slice(0, 8)}...`)
          continue
        }

        // Decompress metadata
        const compressedHex = compressedTag[1]
        const hexMatch = compressedHex.match(/.{1,2}/g)
        if (!hexMatch) {
          console.warn(`   Invalid compressed hex for punk ${punkId}`)
          continue
        }

        const compressedBytes = new Uint8Array(
          hexMatch.map(byte => parseInt(byte, 16))
        )
        const metadata = decompressPunkMetadata({ data: compressedBytes }, punkId)

        const vtxoOutpoint = vtxoTag?.[1] || `${punkId}:0`

        recoveredPunks.push({
          punkId,
          owner: walletAddress,
          metadata,
          vtxoOutpoint
        })

        console.log(`   ✅ Recovered: ${metadata.name}`)
      } catch (err) {
        console.warn('   Failed to process mint event:', err)
      }
    }

    // Also check for punks bought on marketplace
    const boughtPunks: string[] = []
    for (const [punkId, ownership] of punkOwnership.entries()) {
      if (ownership.currentOwner === myPubkey) {
        // Check if we already have this punk from mint events
        if (!recoveredPunks.find(p => p.punkId === punkId)) {
          boughtPunks.push(punkId)
        }
      }
    }

    // For bought punks, fetch all mint events and recover metadata
    if (boughtPunks.length > 0) {
      console.log(`   Found ${boughtPunks.length} punks bought on marketplace`)

      // Fetch ALL mint events (can't filter by punk_id as it's not indexed)
      const allMintEvents = await pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_MINT],
        limit: 5000
      })

      // Try to find these punks in the mint events
      for (const punkId of boughtPunks) {
        // Find mint event for this punk ID (client-side filtering)
        const mintEvent = allMintEvents.find(event => {
          const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
          return punkIdTag && punkIdTag[1] === punkId
        })

        if (mintEvent) {
          try {
            // Mint events use 'data' tag, not 'compressed'
            const compressedTag = mintEvent.tags.find(t => t[0] === 'data')
            const vtxoTag = mintEvent.tags.find(t => t[0] === 'vtxo')

            if (compressedTag) {
              const compressedHex = compressedTag[1]
              const hexMatch = compressedHex.match(/.{1,2}/g)

              if (hexMatch) {
                const compressedBytes = new Uint8Array(
                  hexMatch.map(byte => parseInt(byte, 16))
                )
                const metadata = decompressPunkMetadata({ data: compressedBytes }, punkId)
                const vtxoOutpoint = vtxoTag?.[1] || `${punkId}:0`

                recoveredPunks.push({
                  punkId,
                  owner: walletAddress,
                  metadata,
                  vtxoOutpoint
                })

                console.log(`   ✅ Recovered bought punk: ${metadata.name}`)
              }
            }
          } catch (err) {
            console.warn(`   Failed to recover bought punk ${punkId}:`, err)
          }
        } else {
          console.warn(`   Could not find mint event for bought punk ${punkId}`)
        }
      }
    }

    console.log(`✅ Recovered ${recoveredPunks.length} total punks from Nostr`)
    return recoveredPunks

  } catch (error) {
    console.error('❌ Failed to sync punks from Nostr:', error)
    return []
  } finally {
    pool.close(RELAYS)
  }
}

/**
 * Get punk IDs that should be removed from seller's collection
 * A punk is removed only if:
 * 1. There's a sold event where user was the seller
 * 2. AND there's no more recent sold event where user was the buyer (bought it back)
 */
export async function getSoldPunkIds(myPubkey: string): Promise<Set<string>> {
  const pool = new SimplePool()

  try {
    // Query for ALL sold events
    const soldEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_SOLD],
      limit: 1000
    })

    // For each punk, track the most recent event where I was seller or buyer
    const punkSaleHistory = new Map<string, {
      lastSoldByMe: number | null,
      lastBoughtByMe: number | null
    }>()

    for (const event of soldEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const sellerTag = event.tags.find(t => t[0] === 'seller')
      const buyerTag = event.tags.find(t => t[0] === 'buyer')

      if (!punkIdTag) continue
      const punkId = punkIdTag[1]

      if (!punkSaleHistory.has(punkId)) {
        punkSaleHistory.set(punkId, { lastSoldByMe: null, lastBoughtByMe: null })
      }

      const history = punkSaleHistory.get(punkId)!

      // Track when I sold this punk
      if (sellerTag && sellerTag[1] === myPubkey) {
        if (!history.lastSoldByMe || event.created_at > history.lastSoldByMe) {
          history.lastSoldByMe = event.created_at
        }
      }

      // Track when I bought this punk
      if (buyerTag && buyerTag[1] === myPubkey) {
        if (!history.lastBoughtByMe || event.created_at > history.lastBoughtByMe) {
          history.lastBoughtByMe = event.created_at
        }
      }
    }

    // A punk should be removed from my collection if:
    // - I sold it AND haven't bought it back since
    const punksToRemove = new Set<string>()
    for (const [punkId, history] of punkSaleHistory.entries()) {
      const soldIt = history.lastSoldByMe !== null
      const boughtItBack = history.lastBoughtByMe !== null &&
                          history.lastSoldByMe !== null &&
                          history.lastBoughtByMe > history.lastSoldByMe

      if (soldIt && !boughtItBack) {
        punksToRemove.add(punkId)
      }
    }

    return punksToRemove

  } catch (error) {
    console.error('❌ Failed to fetch sold punks:', error)
    return new Set()
  } finally {
    pool.close(RELAYS)
  }
}

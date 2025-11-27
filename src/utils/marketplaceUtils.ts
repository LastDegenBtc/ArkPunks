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
    // Determine current network (default to mainnet if not set)
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'
    console.log(`📊 Marketplace: Filtering for network: ${currentNetwork}`)
    console.log(`   VITE_ARKADE_NETWORK env var: "${import.meta.env.VITE_ARKADE_NETWORK}"`)

    // DEBUG: First query ALL listings without network filter to see if events exist at all
    const allListingsDebug = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_LISTING],
      limit: 100
    })
    console.log(`   🔍 DEBUG: Found ${allListingsDebug.length} total listing events (no network filter)`)
    if (allListingsDebug.length > 0) {
      console.log(`   🔍 DEBUG: Sample events (first 5):`)
      allListingsDebug.slice(0, 5).forEach((e, i) => {
        const networkTag = e.tags.find(t => t[0] === 'network')
        const punkIdTag = e.tags.find(t => t[0] === 'punk_id')
        const priceTag = e.tags.find(t => t[0] === 'price')
        console.log(`      ${i + 1}. Punk ${punkIdTag?.[1]?.slice(0, 8)}... - ${priceTag?.[1]} sats - network: "${networkTag?.[1]}"`)
      })
    }

    // Query for ALL listing events (including delist events) AND sold events
    // NOTE: We fetch ALL events and filter client-side because relay tag filters are unreliable
    const [allListingEvents, allSoldEvents] = await Promise.all([
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_LISTING],
        limit: 1000
      }),
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_SOLD],
        limit: 1000
      })
    ])

    // Filter by network client-side (relay filters don't work reliably)
    const listingEvents = allListingEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      return networkTag?.[1] === currentNetwork
    })

    const soldEvents = allSoldEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      return networkTag?.[1] === currentNetwork
    })

    console.log(`   Found ${listingEvents.length} listing events (filtered from ${allListingEvents.length} total), ${soldEvents.length} sold events`)

    // Debug: Log first few listings
    if (listingEvents.length > 0) {
      console.log(`   📋 Sample listings (first 3):`)
      listingEvents.slice(0, 3).forEach((e, i) => {
        const networkTag = e.tags.find(t => t[0] === 'network')
        const punkIdTag = e.tags.find(t => t[0] === 'punk_id')
        const priceTag = e.tags.find(t => t[0] === 'price')
        console.log(`      ${i + 1}. Punk ${punkIdTag?.[1]} - ${priceTag?.[1]} sats - network: "${networkTag?.[1]}"`)
      })
    }

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
          continue
        }

        // Skip sold punks (has a sold event newer than listing)
        const soldTimestamp = soldPunksMap.get(punkId)
        if (soldTimestamp && soldTimestamp > event.created_at) {
          continue
        }

        // For escrow listings, verify against blob storage to exclude sold/cancelled
        if (saleMode === 'escrow') {
          try {
            const { getEscrowStatus } = await import('./escrowApi')
            const blobListing = await getEscrowStatus(punkId)

            if (blobListing && (blobListing.status === 'sold' || blobListing.status === 'cancelled')) {
              continue
            }

            if (!blobListing) {
              console.warn(`   ⚠️  Escrow listing in Nostr but not in blob: ${punkId.slice(0, 8)}... - skipping for safety`)
              continue
            }
          } catch (blobError) {
            console.warn(`   ⚠️  Failed to verify escrow listing against blob for ${punkId.slice(0, 8)}:`, blobError)
            // Continue showing the listing if blob check fails (don't break marketplace)
          }
        }

        // Must have compressed and ark_address for active listings
        if (!compressedTag || !arkAddressTag) {
          continue
        }

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
          vtxoOutpoint: `${punkId}:0`, // Placeholder - VTXO tracked via wallet, not Nostr
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
  compressedHex: string,
  privateKey: string,
  arkAddress: string,
  saleMode: SaleMode = 'p2p',
  escrowAddress?: string
): Promise<boolean> {
  const pool = new SimplePool()

  try {
    console.log('🔵 listPunkForSale: Starting...')
    console.log('   Punk ID:', punkId)
    console.log('   Price:', price.toString())
    console.log('   Sale mode:', saleMode)

    const pubkey = getPublicKey(hex.decode(privateKey))
    console.log('   Pubkey:', pubkey)

    // Determine current network for event tagging
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'
    console.log('   Network tag:', currentNetwork)

    const tags: string[][] = [
      ['t', 'arkade-punk-listing'],
      ['punk_id', punkId],
      ['price', price.toString()],
      ['compressed', compressedHex],
      ['ark_address', arkAddress],
      ['sale_mode', saleMode],
      ['network', currentNetwork]  // Add network tag for filtering
    ]

    // Add escrow address if in escrow mode
    if (saleMode === 'escrow' && escrowAddress) {
      tags.push(['escrow_address', escrowAddress])
      console.log('   Escrow address:', escrowAddress)
    }

    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_LISTING,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: `Punk ${punkId} listed for ${price} sats (${saleMode === 'escrow' ? 'Escrow Mode' : 'P2P Mode'})`
    }

    console.log('   Event template created:', eventTemplate)

    const signedEvent = finalizeEvent(eventTemplate, hex.decode(privateKey))
    console.log('   Event signed:', signedEvent.id)

    // Publish to relays
    console.log('   Publishing to', RELAYS.length, 'relays...')
    const publishPromises = pool.publish(RELAYS, signedEvent)
    console.log('   Publish promises:', publishPromises.length)

    await Promise.any(publishPromises)
    console.log('✅ Published to at least one relay')

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

    // Determine current network for event tagging
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'

    // Publish a "delist" event (price = 0)
    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_LISTING,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-delist'],
        ['punk_id', punkId],
        ['price', '0'],
        ['network', currentNetwork]  // Add network tag for filtering
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

    // Determine current network for event tagging
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'

    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_SOLD,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-sold'],
        ['punk_id', punkId],
        ['seller', sellerPubkey],
        ['buyer', buyerPubkey],
        ['price', price],
        ['txid', txid],
        ['network', currentNetwork]  // Add network tag for filtering
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
    // Determine current network for event tagging
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'

    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_TRANSFER,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-transfer'],
        ['punk_id', punkId],
        ['from', fromPubkey],
        ['to', toPubkey],
        ['txid', txid],
        ['network', currentNetwork]  // Add network tag for filtering
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
 * 3. Punks held in escrow (sold to escrow pubkey)
 * Excludes:
 * - Punks sold and not bought back (unless held in escrow)
 */
export async function syncPunksFromNostr(
  myPubkey: string,
  walletAddress: string
): Promise<Array<{
  punkId: string
  owner: string
  metadata: any
  vtxoOutpoint: string
  inEscrow?: boolean
}>> {
  const pool = new SimplePool()

  try {
    console.log('🔄 Syncing punks from Nostr...')
    console.log('   Nostr pubkey:', myPubkey.slice(0, 8) + '...')
    console.log('   Wallet address:', walletAddress)

    // Get escrow pubkey to identify escrow-held punks
    let escrowPubkey: string | null = null
    try {
      const { getEscrowInfo } = await import('./escrowApi')
      const escrowInfo = await getEscrowInfo()
      escrowPubkey = escrowInfo.escrowPubkey
      console.log('   Escrow pubkey:', escrowPubkey.slice(0, 8) + '...')
    } catch (err) {
      console.warn('   Could not fetch escrow info (escrow may not be configured):', err)
    }

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

    // Query for all sold events, transfer events, AND listing events
    // Determine current network (default to mainnet if not set)
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'mainnet'

    // NOTE: We fetch ALL and filter client-side because relay tag filters are unreliable
    const [allSoldEvents, allTransferEvents, allListingEvents] = await Promise.all([
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_SOLD],
        limit: 1000
      }),
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_TRANSFER],
        limit: 1000
      }),
      pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_LISTING],
        limit: 1000
      })
    ])

    // Filter by network client-side
    const soldEvents = allSoldEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      return networkTag?.[1] === currentNetwork
    })

    const transferEvents = allTransferEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      return networkTag?.[1] === currentNetwork
    })

    const listingEvents = allListingEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      return networkTag?.[1] === currentNetwork
    })

    console.log(`   Found ${soldEvents.length} sold events (filtered from ${allSoldEvents.length} total)`)
    console.log(`   Found ${transferEvents.length} transfer events (filtered from ${allTransferEvents.length} total)`)
    console.log(`   Found ${listingEvents.length} listing events`)

    // Check for active escrow listings by this user
    // These are punks currently held in escrow (listed but not sold)
    // Track latest listing event per punk to handle delist events properly
    const latestEscrowListings = new Map<string, { price: bigint; timestamp: number }>()

    for (const event of listingEvents) {
      // Only check listings by this user in escrow mode
      if (event.pubkey !== myPubkey) continue

      const saleModeTag = event.tags.find(t => t[0] === 'sale_mode')
      const priceTag = event.tags.find(t => t[0] === 'price')
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')

      // Must be escrow mode and have punk ID
      if (saleModeTag?.[1] === 'escrow' && priceTag && punkIdTag) {
        const punkId = punkIdTag[1]
        const price = BigInt(priceTag[1])
        const timestamp = event.created_at

        const existing = latestEscrowListings.get(punkId)
        // Keep only the latest listing event for each punk
        if (!existing || timestamp > existing.timestamp) {
          latestEscrowListings.set(punkId, { price, timestamp })
        }
      }
    }

    // Build set of actively listed punks (price > 0 in latest event)
    const myEscrowListings = new Set<string>()
    for (const [punkId, listing] of latestEscrowListings.entries()) {
      if (listing.price > 0n) {
        myEscrowListings.add(punkId)
        console.log(`   📦 Found escrow listing: ${punkId.slice(0, 8)}... (${listing.price} sats)`)
      } else {
        console.log(`   ✅ Punk ${punkId.slice(0, 8)}... delisted from escrow (price=0)`)
      }
    }

    console.log(`   Found ${myEscrowListings.size} active escrow listings by this user`)

    // Verify escrow listings against Vercel Blob storage
    // Nostr events can have stale data, so we cross-reference with the authoritative blob
    if (myEscrowListings.size > 0) {
      try {
        console.log('   🔍 Verifying escrow listings against blob storage...')
        const { getAllEscrowListings } = await import('./escrowApi')
        const blobListings = await getAllEscrowListings()

        // Build set of active blob listings (status = pending or deposited)
        const activeBlobPunkIds = new Set(
          blobListings
            .filter(l => l.status === 'pending' || l.status === 'deposited')
            .map(l => l.punkId)
        )

        console.log(`   📋 Found ${activeBlobPunkIds.size} active listings in blob storage`)

        // Remove any Nostr-detected listings that aren't in the blob or are inactive
        for (const punkId of myEscrowListings) {
          if (!activeBlobPunkIds.has(punkId)) {
            console.log(`   ⚠️  Removing stale escrow listing: ${punkId.slice(0, 8)}... (not found in blob or inactive)`)
            myEscrowListings.delete(punkId)
          } else {
            console.log(`   ✅ Verified escrow listing: ${punkId.slice(0, 8)}...`)
          }
        }

        console.log(`   Final verified escrow listings: ${myEscrowListings.size}`)
      } catch (error: any) {
        console.warn('   ⚠️  Failed to verify escrow listings against blob:', error.message)
        console.warn('   Continuing with Nostr-only detection (may include stale listings)')
      }
    }

    // Build ownership history from sold events and transfers
    const punkOwnership = new Map<string, {
      currentOwner: string | null // null if transferred away
      lastTransferTime: number
      inEscrow?: boolean // true if in escrow
    }>()

    // Store compressed metadata from sold events (for escrow purchases)
    // This allows buyers to recover punks without finding the original mint event
    const soldPunksMetadata = new Map<string, string>()

    // Process sold events (marketplace sales)
    for (const event of soldEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const sellerTag = event.tags.find(t => t[0] === 'seller')
      const buyerTag = event.tags.find(t => t[0] === 'buyer')
      const compressedTag = event.tags.find(t => t[0] === 'compressed')

      if (!punkIdTag || !sellerTag || !buyerTag) continue

      const punkId = punkIdTag[1]
      const seller = sellerTag[1]
      const buyer = buyerTag[1]
      const timestamp = event.created_at

      // Store compressed metadata if available (escrow sales include this)
      if (compressedTag && compressedTag[1]) {
        soldPunksMetadata.set(punkId, compressedTag[1])
      }

      const existing = punkOwnership.get(punkId)

      // Update if this is a newer transfer
      if (!existing || timestamp > existing.lastTransferTime) {
        // If I was the seller, check if it was sold to escrow or to another user
        if (seller === myPubkey && buyer !== myPubkey) {
          // If sold to escrow, I still own it (it's just held in escrow)
          if (escrowPubkey && buyer === escrowPubkey) {
            console.log(`   📦 Punk ${punkId.slice(0, 8)}... held in escrow`)
            punkOwnership.set(punkId, {
              currentOwner: myPubkey,
              lastTransferTime: timestamp,
              inEscrow: true
            })
          } else {
            // Sold to another user
            punkOwnership.set(punkId, {
              currentOwner: buyer,
              lastTransferTime: timestamp
            })
          }
        }
        // If I was the buyer, I now own it
        else if (buyer === myPubkey) {
          punkOwnership.set(punkId, {
            currentOwner: myPubkey,
            lastTransferTime: timestamp
          })
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
      inEscrow?: boolean
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

        // Check if this punk is in escrow (has active escrow listing)
        const isInEscrow = myEscrowListings.has(punkId)

        // Skip if sold and not bought back (but include escrow-held punks)
        if (ownership && ownership.currentOwner !== myPubkey && !isInEscrow) {
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
          vtxoOutpoint,
          inEscrow: isInEscrow || ownership?.inEscrow || false
        })

        if (isInEscrow) {
          console.log(`   ✅ Recovered (in escrow): ${metadata.name}`)
        } else {
          console.log(`   ✅ Recovered: ${metadata.name}`)
        }
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

    // For bought punks, recover metadata from sold events or mint events
    if (boughtPunks.length > 0) {
      console.log(`   Found ${boughtPunks.length} punks bought on marketplace`)

      // First, try to recover from sold events metadata (faster, works for escrow purchases)
      const punksNeedingMintEvents: string[] = []

      for (const punkId of boughtPunks) {
        const compressedHex = soldPunksMetadata.get(punkId)

        if (compressedHex) {
          try {
            // Recover from sold event metadata (escrow purchases)
            const hexMatch = compressedHex.match(/.{1,2}/g)

            if (hexMatch) {
              const compressedBytes = new Uint8Array(
                hexMatch.map(byte => parseInt(byte, 16))
              )
              const metadata = decompressPunkMetadata({ data: compressedBytes }, punkId)
              const vtxoOutpoint = `${punkId}:0`

              const ownership = punkOwnership.get(punkId)
              const isInEscrow = myEscrowListings.has(punkId)

              recoveredPunks.push({
                punkId,
                owner: walletAddress,
                metadata,
                vtxoOutpoint,
                inEscrow: isInEscrow || ownership?.inEscrow || false
              })

              if (isInEscrow) {
                console.log(`   ✅ Recovered bought punk (escrow, from sold event): ${metadata.name}`)
              } else {
                console.log(`   ✅ Recovered bought punk (from sold event): ${metadata.name}`)
              }
            }
          } catch (err) {
            console.warn(`   Failed to recover bought punk from sold event ${punkId}:`, err)
            punksNeedingMintEvents.push(punkId)
          }
        } else {
          // No metadata in sold event, need to find mint event
          punksNeedingMintEvents.push(punkId)
        }
      }

      // For punks without sold event metadata, fetch mint events
      if (punksNeedingMintEvents.length > 0) {
        console.log(`   Fetching mint events for ${punksNeedingMintEvents.length} punks...`)

        const allMintEvents = await pool.querySync(RELAYS, {
          kinds: [KIND_PUNK_MINT],
          limit: 5000
        })

        for (const punkId of punksNeedingMintEvents) {
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

                  const ownership = punkOwnership.get(punkId)
                  const isInEscrow = myEscrowListings.has(punkId)

                  recoveredPunks.push({
                    punkId,
                    owner: walletAddress,
                    metadata,
                    vtxoOutpoint,
                    inEscrow: isInEscrow || ownership?.inEscrow || false
                  })

                  if (isInEscrow) {
                    console.log(`   ✅ Recovered bought punk (in escrow, from mint): ${metadata.name}`)
                  } else {
                    console.log(`   ✅ Recovered bought punk (from mint): ${metadata.name}`)
                  }
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

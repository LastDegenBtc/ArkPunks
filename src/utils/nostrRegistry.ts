/**
 * Nostr Registry for ArkPunks Supply Tracking
 *
 * Uses Nostr relays to track global punk supply in a decentralized way.
 *
 * Event kinds (Mainnet Launch - Nov 21, 2025):
 * - Kind 1400: Individual punk mint event
 * - Kind 1404: L1 exit event (punk → Bitcoin address)
 * - Kind 30334: Global registry (replaceable event for current supply count)
 *
 * Official Relay: The first relay in the list is the "authority" for supply cap
 */

import {
  SimplePool,
  type Event as NostrEvent,
  getPublicKey,
  finalizeEvent,
  type EventTemplate
} from 'nostr-tools'
import { PUNK_SUPPLY_CONFIG } from '@/config/arkade'

// Nostr relays for ArkPunks
const RELAYS = [
  'wss://relay.damus.io',        // Official authority relay
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]

// Event kinds (Mainnet Launch)
const KIND_PUNK_MINT = 1400      // Individual punk mint
const KIND_PUNK_EXIT = 1404      // L1 exit event (punk → Bitcoin address)
const KIND_PUNK_REGISTRY = 30334 // Global supply registry (replaceable)

// Global pool
const pool = new SimplePool()

/**
 * Get the global supply from Nostr relays
 */
export async function getNostrSupply(): Promise<{
  totalMinted: number
  maxPunks: number
  punks: Array<{ punkId: string; owner: string; mintedAt: number }>
}> {
  try {
    console.log('📡 Fetching punk supply from Nostr relays...')

    // Determine current network
    const currentNetwork = import.meta.env.VITE_ARKADE_NETWORK || 'testnet'
    console.log(`   Filtering for network: ${currentNetwork}`)

    // Fetch all punk mint events (kind 1400) for current network only
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      '#t': ['arkade-punk'],
      '#network': [currentNetwork], // Filter by network tag
      limit: PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS + 100 // Fetch a bit more to be safe
    })

    console.log(`   Found ${events.length} punk mint events on Nostr`)

    // Deduplicate by punkId (keep earliest)
    const punkMap = new Map<string, NostrEvent>()

    for (const event of events) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]
      const existing = punkMap.get(punkId)

      // Keep the earliest event (lowest created_at)
      if (!existing || event.created_at < existing.created_at) {
        punkMap.set(punkId, event)
      }
    }

    const punks = Array.from(punkMap.values())
      .sort((a, b) => a.created_at - b.created_at) // Sort by mint time
      .slice(0, PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS) // Cap at max supply
      .map(event => {
        const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
        const ownerTag = event.tags.find(t => t[0] === 'owner')

        return {
          punkId: punkIdTag?.[1] || '',
          owner: ownerTag?.[1] || event.pubkey,
          mintedAt: event.created_at
        }
      })

    console.log(`✅ Loaded ${punks.length} unique punks from Nostr`)

    return {
      totalMinted: punks.length,
      maxPunks: PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS,
      punks
    }
  } catch (error) {
    console.error('❌ Failed to fetch supply from Nostr:', error)

    // Fallback to localStorage if Nostr fails
    return {
      totalMinted: 0,
      maxPunks: PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS,
      punks: []
    }
  }
}

/**
 * Publish a punk mint to Nostr
 * Returns true if published successfully to at least one relay
 */
export async function publishPunkMint(
  punkId: string,
  owner: string,
  vtxoOutpoint: string,
  compressedData: string,
  privateKey: Uint8Array
): Promise<boolean> {
  try {
    console.log('📡 Publishing punk mint to Nostr...')
    console.log('   Punk ID:', punkId)
    console.log('   Owner:', owner)
    console.log('   VTXO:', vtxoOutpoint)

    // Get current supply to validate cap
    const supply = await getNostrSupply()

    if (supply.totalMinted >= PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS) {
      console.error('❌ Supply cap reached on Nostr!')
      return false
    }

    // Check if this punk already exists
    if (supply.punks.some(p => p.punkId === punkId)) {
      console.warn('⚠️ Punk already minted on Nostr (duplicate punkId)')
      return false
    }

    // Create mint event
    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_MINT,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk'],           // Tag for filtering
        ['t', 'bitcoin'],               // Bitcoin tag
        ['punk_id', punkId],            // Unique punk identifier
        ['owner', owner],               // Owner address
        ['vtxo', vtxoOutpoint],         // VTXO outpoint
        ['data', compressedData],       // 6-byte compressed metadata
        ['index', supply.totalMinted.toString()], // Mint index (0-999)
        ['network', 'mainnet'],         // Network
      ],
      content: `Arkade Punk #${supply.totalMinted} minted on Arkade Protocol 🎨\n\nPunk ID: ${punkId}\nVTXO: ${vtxoOutpoint}\nSupply: ${supply.totalMinted + 1} / ${PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS}`
    }

    // Sign event
    const pubkey = getPublicKey(privateKey)
    const signedEvent = finalizeEvent(eventTemplate, privateKey)

    console.log('   Event signed, publishing to relays...')
    console.log('   Pubkey:', pubkey)

    // Publish to all relays
    const promises = pool.publish(RELAYS, signedEvent)
    const results = await Promise.allSettled(promises)

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`✅ Published to ${successful}/${RELAYS.length} relays`)
    if (failed > 0) {
      console.warn(`⚠️ Failed to publish to ${failed} relays`)
    }

    // Success if published to at least one relay (preferably the authority relay)
    return successful > 0
  } catch (error) {
    console.error('❌ Failed to publish to Nostr:', error)
    return false
  }
}

/**
 * Check if a punk ID already exists on Nostr
 */
export async function isPunkMintedOnNostr(punkId: string): Promise<boolean> {
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      '#punk_id': [punkId],
      limit: 1
    })

    return events.length > 0
  } catch (error) {
    console.error('Failed to check punk on Nostr:', error)
    return false
  }
}

/**
 * Get all punks minted by a specific owner
 */
export async function getPunksByOwner(owner: string): Promise<NostrEvent[]> {
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      '#owner': [owner],
      limit: 100
    })

    return events
  } catch (error) {
    console.error('Failed to fetch punks by owner:', error)
    return []
  }
}

/**
 * Get mint count for a specific pubkey within a time window
 * @param pubkey - Nostr public key (hex)
 * @param timeWindowSeconds - Time window in seconds (default: 24 hours)
 * @returns Number of mints in the time window
 */
export async function getMintCountByPubkey(
  pubkey: string,
  timeWindowSeconds: number = PUNK_SUPPLY_CONFIG.MINT_TIME_WINDOW
): Promise<number> {
  try {
    const now = Math.floor(Date.now() / 1000)
    const since = now - timeWindowSeconds

    console.log(`📊 Checking mint count for pubkey: ${pubkey.slice(0, 16)}...`)
    console.log(`   Time window: ${timeWindowSeconds}s (${timeWindowSeconds / 3600}h)`)

    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      authors: [pubkey],
      since: since,
      limit: PUNK_SUPPLY_CONFIG.MAX_MINTS_PER_ADDRESS + 10 // Fetch a bit more to be safe
    })

    console.log(`   Found ${events.length} mints in the last ${timeWindowSeconds / 3600}h`)

    return events.length
  } catch (error) {
    console.error('Failed to get mint count by pubkey:', error)
    // On error, return 0 to allow minting (fail open)
    return 0
  }
}

/**
 * Check if a user can mint based on their pubkey and rate limits
 * @param pubkey - Nostr public key (hex)
 * @returns Object with canMint flag and remaining mints count
 */
export async function canUserMint(pubkey: string): Promise<{
  canMint: boolean
  mintsUsed: number
  mintsRemaining: number
  maxMints: number
  timeWindow: string
  nextResetTime?: Date
}> {
  try {
    const mintsUsed = await getMintCountByPubkey(pubkey)
    const maxMints = PUNK_SUPPLY_CONFIG.MAX_MINTS_PER_ADDRESS
    const mintsRemaining = Math.max(0, maxMints - mintsUsed)
    const canMint = mintsRemaining > 0

    // Calculate next reset time (oldest mint + time window)
    let nextResetTime: Date | undefined

    if (!canMint) {
      // Fetch the oldest mint to calculate when the limit resets
      const now = Math.floor(Date.now() / 1000)
      const since = now - PUNK_SUPPLY_CONFIG.MINT_TIME_WINDOW

      const events = await pool.querySync(RELAYS, {
        kinds: [KIND_PUNK_MINT],
        authors: [pubkey],
        since: since,
        limit: maxMints + 1
      })

      if (events.length > 0) {
        // Sort by timestamp (oldest first)
        events.sort((a, b) => a.created_at - b.created_at)
        const oldestMint = events[0]
        const resetTimestamp = (oldestMint.created_at + PUNK_SUPPLY_CONFIG.MINT_TIME_WINDOW) * 1000
        nextResetTime = new Date(resetTimestamp)
      }
    }

    console.log(`✅ Mint check for pubkey ${pubkey.slice(0, 16)}:`)
    console.log(`   Can mint: ${canMint}`)
    console.log(`   Mints used: ${mintsUsed} / ${maxMints}`)
    console.log(`   Mints remaining: ${mintsRemaining}`)
    if (nextResetTime) {
      console.log(`   Next reset: ${nextResetTime.toLocaleString()}`)
    }

    return {
      canMint,
      mintsUsed,
      mintsRemaining,
      maxMints,
      timeWindow: `${PUNK_SUPPLY_CONFIG.MINT_TIME_WINDOW / 3600}h`,
      nextResetTime
    }
  } catch (error) {
    console.error('Failed to check if user can mint:', error)
    // On error, allow minting (fail open)
    return {
      canMint: true,
      mintsUsed: 0,
      mintsRemaining: PUNK_SUPPLY_CONFIG.MAX_MINTS_PER_ADDRESS,
      maxMints: PUNK_SUPPLY_CONFIG.MAX_MINTS_PER_ADDRESS,
      timeWindow: `${PUNK_SUPPLY_CONFIG.MINT_TIME_WINDOW / 3600}h`
    }
  }
}

/**
 * Publish L1 exit event to Nostr
 * Links a punk to a Bitcoin L1 address before exiting Arkade
 * This ensures the punk can be recovered even after converting VTXO → UTXO
 */
export async function publishPunkL1Exit(
  punkId: string,
  fromVtxo: string,
  toBitcoinAddress: string,
  compressedData: string,
  privateKey: Uint8Array,
  exitType: 'unilateral' | 'collaborative' = 'unilateral'
): Promise<boolean> {
  try {
    console.log('📡 Publishing L1 exit event to Nostr...')
    console.log('   Punk ID:', punkId)
    console.log('   From VTXO:', fromVtxo)
    console.log('   To L1 Address:', toBitcoinAddress)
    console.log('   Exit Type:', exitType)

    // Create exit event
    const eventTemplate: EventTemplate = {
      kind: KIND_PUNK_EXIT,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'arkade-punk-exit'],      // Tag for filtering
        ['t', 'bitcoin'],                // Bitcoin tag
        ['punk_id', punkId],             // Punk identifier
        ['from_vtxo', fromVtxo],         // Source VTXO
        ['to_address', toBitcoinAddress], // Destination L1 address
        ['data', compressedData],        // 6-byte compressed metadata
        ['exit_type', exitType],         // Exit type
        ['network', 'mainnet'],          // Network
      ],
      content: `ArkPunk exiting to Bitcoin L1 🟠\n\nPunk ID: ${punkId}\nVTXO: ${fromVtxo}\nL1 Address: ${toBitcoinAddress}\n\nThis punk is now linked to a Bitcoin UTXO and can be recovered using this Nostr key.`
    }

    // Sign event
    const pubkey = getPublicKey(privateKey)
    const signedEvent = finalizeEvent(eventTemplate, privateKey)

    console.log('   Event signed, publishing to relays...')
    console.log('   Pubkey:', pubkey)

    // Publish to all relays
    const promises = pool.publish(RELAYS, signedEvent)
    const results = await Promise.allSettled(promises)

    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`✅ Published L1 exit to ${successful}/${RELAYS.length} relays`)
    if (failed > 0) {
      console.warn(`⚠️ Failed to publish to ${failed} relays`)
    }

    return successful > 0
  } catch (error) {
    console.error('❌ Failed to publish L1 exit to Nostr:', error)
    return false
  }
}

/**
 * Get all L1 exit events for a specific punk
 */
export async function getPunkL1Exits(punkId: string): Promise<NostrEvent[]> {
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_EXIT],
      '#punk_id': [punkId],
      limit: 10
    })

    return events.sort((a, b) => b.created_at - a.created_at) // Latest first
  } catch (error) {
    console.error('Failed to fetch L1 exits:', error)
    return []
  }
}

/**
 * Get all punks exited to a specific Bitcoin L1 address
 */
export async function getPunksByL1Address(address: string): Promise<NostrEvent[]> {
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_EXIT],
      '#to_address': [address],
      limit: 100
    })

    return events
  } catch (error) {
    console.error('Failed to fetch punks by L1 address:', error)
    return []
  }
}

/**
 * Get sales history from Nostr
 * Fetches all punk sold events (kind 1339) and returns them sorted by timestamp (newest first)
 * Only includes sales for punks that have recoverable data (mint or listing events)
 */
export async function getSalesHistory(): Promise<Array<{
  id: string
  punkId: string
  punkIndex?: number
  price: bigint
  buyer: string
  seller: string
  timestamp: number
}>> {
  try {
    console.log('📊 Fetching sales history from Nostr...')

    const KIND_PUNK_SOLD = 1339

    // Blacklist of test/legacy punk IDs to exclude from sales history
    // These are old test punks without proper mint events
    const BLACKLISTED_PUNKS = new Set([
      'f6536903d53c0c0cfb753f59efadfacfb92da67c5b47a5150b1c1b9460730b92',
      '10c01753dd988e84e901b34a09477d7c30218c40ac8b57c5c3acd9099dbd44f0',
      '59c1cf86421f345a2d20d3caf0959edae947af6a30477b37bb8fc020b3f4a6c4',
      '36baf153b4b7fb3b37a2627e11b14bd0b82f2d26fc9d29084b1a56df8c89e58a',
      '852e944f57a64febd1a24a9e9815b8ba5e751e4dc6a1f8a7c72e88d90d90dd4a'
    ])

    // Fetch all sold events
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_SOLD],
      limit: 500 // Get last 500 sales
    })

    console.log(`   Found ${events.length} sold events`)

    // Get all unique punk IDs from sold events
    const punkIds = new Set<string>()
    for (const event of events) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (punkIdTag) {
        punkIds.add(punkIdTag[1])
      }
    }

    // Fetch all mint events to verify which punks have recoverable data
    console.log(`   Checking ${punkIds.size} unique punks for mint events...`)
    const mintEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      limit: 1000
    })

    // Create a set of punk IDs that have mint events
    const recoverablePunkIds = new Set<string>()
    for (const event of mintEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const dataTag = event.tags.find(t => t[0] === 'data')
      if (punkIdTag && dataTag) {
        recoverablePunkIds.add(punkIdTag[1])
      }
    }

    // NOTE: We don't check localStorage here for sales history
    // because other users won't have these punks in their local storage.
    // Only punks with proper Nostr mint events should appear in sales history.

    console.log(`   Found ${recoverablePunkIds.size} punks with recoverable data (Nostr only)`)

    const sales = events
      .map(event => {
        try {
          // Extract data from tags
          const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
          const sellerTag = event.tags.find(t => t[0] === 'seller')
          const buyerTag = event.tags.find(t => t[0] === 'buyer')
          const priceTag = event.tags.find(t => t[0] === 'price')

          if (!punkIdTag || !buyerTag) {
            return null
          }

          const punkId = punkIdTag[1]

          // Skip blacklisted test/legacy punks
          if (BLACKLISTED_PUNKS.has(punkId)) {
            console.log(`   ⏭️  Skipping blacklisted test punk: ${punkId.slice(0, 16)}...`)
            return null
          }

          // Skip sales for punks without recoverable data
          if (!recoverablePunkIds.has(punkId)) {
            console.log(`   ⏭️  Skipping sale for punk without data: ${punkId.slice(0, 16)}...`)
            return null
          }

          // Try to extract mint index if available
          const punkIndexMatch = punkId?.match(/#(\d+)/)
          const punkIndex = punkIndexMatch ? parseInt(punkIndexMatch[1]) : undefined

          return {
            id: event.id,
            punkId,
            punkIndex,
            price: priceTag ? BigInt(priceTag[1]) : 0n,
            buyer: buyerTag[1],
            seller: sellerTag ? sellerTag[1] : 'unknown',
            timestamp: event.created_at * 1000 // Convert to milliseconds
          }
        } catch (error) {
          console.warn('Failed to parse sold event:', error)
          return null
        }
      })
      .filter((sale): sale is NonNullable<typeof sale> => sale !== null)
      .sort((a, b) => b.timestamp - a.timestamp) // Newest first

    console.log(`✅ Loaded ${sales.length} sales with recoverable punk data`)

    return sales
  } catch (error) {
    console.error('Failed to fetch sales history:', error)
    return []
  }
}

/**
 * Get market statistics
 * Calculates floor price, highest sale, total volume, etc.
 */
export async function getMarketStats(): Promise<{
  floorPrice: bigint
  highestSale: bigint
  totalVolume: bigint
  totalSales: number
  averagePrice: bigint
}> {
  try {
    console.log('📈 Calculating market statistics...')

    // Get current listings for floor price
    const listEvents = await pool.querySync(RELAYS, {
      kinds: [32001],
      '#p': ['list'],
      limit: 100
    })

    // Get sales history for other stats
    const sales = await getSalesHistory()

    // Calculate floor price (lowest current listing)
    let floorPrice = 0n
    const activePrices: bigint[] = []

    for (const event of listEvents) {
      try {
        const content = JSON.parse(event.content)
        const price = BigInt(content.listingPrice || 0)
        if (price > 0n) {
          activePrices.push(price)
        }
      } catch (error) {
        continue
      }
    }

    if (activePrices.length > 0) {
      floorPrice = activePrices.reduce((min, price) => price < min ? price : min)
    }

    // Calculate sales stats
    let highestSale = 0n
    let totalVolume = 0n

    for (const sale of sales) {
      if (sale.price > highestSale) {
        highestSale = sale.price
      }
      totalVolume += sale.price
    }

    const totalSales = sales.length
    const averagePrice = totalSales > 0 ? totalVolume / BigInt(totalSales) : 0n

    console.log('✅ Market stats calculated:')
    console.log(`   Floor: ${floorPrice} sats`)
    console.log(`   Highest: ${highestSale} sats`)
    console.log(`   Volume: ${totalVolume} sats`)
    console.log(`   Sales: ${totalSales}`)

    return {
      floorPrice,
      highestSale,
      totalVolume,
      totalSales,
      averagePrice
    }
  } catch (error) {
    console.error('Failed to calculate market stats:', error)
    return {
      floorPrice: 0n,
      highestSale: 0n,
      totalVolume: 0n,
      totalSales: 0,
      averagePrice: 0n
    }
  }
}

/**
 * Get the original mint event for a punk ID
 * Returns the compressed data from the mint event
 * If mint event not found, tries to fetch from listing events as fallback
 */
export async function getPunkMintEvent(punkId: string): Promise<{
  compressedHex: string
  owner: string
  vtxo: string
  index: number
  mintedAt: number
} | null> {
  try {
    console.log(`🔍 Fetching mint event for punk: ${punkId.slice(0, 16)}...`)

    // First, try to get the mint event (KIND 1337)
    const mintEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      '#punk_id': [punkId],
      limit: 1
    })

    if (mintEvents.length > 0) {
      const event = mintEvents[0]

      // Extract data from tags
      const dataTag = event.tags.find(t => t[0] === 'data')
      const ownerTag = event.tags.find(t => t[0] === 'owner')
      const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
      const indexTag = event.tags.find(t => t[0] === 'index')

      if (dataTag) {
        console.log(`✅ Found mint event with compressed data`)
        return {
          compressedHex: dataTag[1],
          owner: ownerTag?.[1] || event.pubkey,
          vtxo: vtxoTag?.[1] || '',
          index: indexTag ? parseInt(indexTag[1]) : 0,
          mintedAt: event.created_at
        }
      }
    }

    // Fallback: Try to get data from listing events (KIND 1338)
    console.log(`⚠️ No mint event found, trying listing events...`)
    const KIND_PUNK_LISTING = 1338

    const listingEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_LISTING],
      '#punk_id': [punkId],
      limit: 10 // Get multiple to find one with compressed data
    })

    if (listingEvents.length > 0) {
      // Find the most recent listing event that has compressed data
      for (const event of listingEvents.sort((a, b) => b.created_at - a.created_at)) {
        const compressedTag = event.tags.find(t => t[0] === 'compressed')
        const vtxoTag = event.tags.find(t => t[0] === 'vtxo')

        if (compressedTag && compressedTag[1]) {
          console.log(`✅ Found compressed data in listing event`)
          return {
            compressedHex: compressedTag[1],
            owner: event.pubkey,
            vtxo: vtxoTag?.[1] || '',
            index: 0, // Unknown index from listing
            mintedAt: event.created_at
          }
        }
      }
    }

    console.warn(`❌ No mint or listing event found with compressed data for punk: ${punkId}`)
    return null

  } catch (error) {
    console.error('Failed to fetch punk data:', error)
    return null
  }
}

/**
 * Cleanup: Close all relay connections
 */
export function closeNostrConnections(): void {
  pool.close(RELAYS)
}

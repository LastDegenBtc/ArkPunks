/**
 * Nostr Registry for ArkPunks Supply Tracking
 *
 * Uses Nostr relays to track global punk supply in a decentralized way.
 *
 * Events:
 * - Kind 1337: Individual punk mint event
 * - Kind 30333: Global registry (replaceable event for current supply count)
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

// Event kinds
const KIND_PUNK_MINT = 1337      // Individual punk mint
const KIND_PUNK_EXIT = 1341      // L1 exit event (punk → Bitcoin address)
const KIND_PUNK_REGISTRY = 30333 // Global supply registry (replaceable)

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

    // Fetch all punk mint events (kind 1337)
    const events = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_MINT],
      '#t': ['arkade-punk'],
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
 * Cleanup: Close all relay connections
 */
export function closeNostrConnections(): void {
  pool.close(RELAYS)
}

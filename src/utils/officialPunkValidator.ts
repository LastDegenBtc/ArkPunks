/**
 * Official Punk Validator
 *
 * Validates which punks are in the official ArkPunks collection.
 * The first 1000 punks minted on the official relay (relay.damus.io) are official.
 *
 * Similar to how CryptoPunks uses a specific contract address,
 * we use timestamp-based ordering on the official relay as the source of truth.
 */

import { SimplePool, type Event as NostrEvent } from 'nostr-tools'
import { PUNK_SUPPLY_CONFIG } from '@/config/arkade'

// Official relay - the authority for punk mints
const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1337

// Cache for official punks list
let officialPunksCache: {
  punkIds: Set<string>
  events: NostrEvent[]
  lastFetch: number
} | null = null

const CACHE_DURATION = 60000 // 1 minute

/**
 * Get the list of official punk IDs from the authority relay
 * Returns the first 1000 punks sorted by timestamp
 */
export async function getOfficialPunksList(): Promise<{
  punkIds: string[]
  events: NostrEvent[]
}> {
  const now = Date.now()

  // Return cache if fresh
  if (officialPunksCache && (now - officialPunksCache.lastFetch) < CACHE_DURATION) {
    return {
      punkIds: Array.from(officialPunksCache.punkIds),
      events: officialPunksCache.events
    }
  }

  const pool = new SimplePool()

  try {
    console.log('📡 Fetching official punks from authority relay...')

    // Query official relay for all punk mints
    const events = await pool.querySync([OFFICIAL_RELAY], {
      kinds: [KIND_PUNK_MINT],
      '#t': ['arkade-punk'],
      limit: PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS + 500 // Fetch extra to be safe
    })

    console.log(`   Found ${events.length} punk events on authority relay`)

    // Filter valid events (must have punk_id and vtxo tags)
    const validEvents = events.filter(event => {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
      return punkIdTag && vtxoTag
    })

    // Sort by timestamp (earliest first)
    const sortedEvents = validEvents.sort((a, b) => a.created_at - b.created_at)

    // Take the first 1000 (official collection)
    const officialEvents = sortedEvents.slice(0, PUNK_SUPPLY_CONFIG.MAX_TOTAL_PUNKS)

    // Deduplicate by punkId (keep earliest)
    const punkMap = new Map<string, NostrEvent>()
    for (const event of officialEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]
      const existing = punkMap.get(punkId)

      if (!existing || event.created_at < existing.created_at) {
        punkMap.set(punkId, event)
      }
    }

    const finalEvents = Array.from(punkMap.values()).sort((a, b) => a.created_at - b.created_at)
    const punkIds = finalEvents.map(event => {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      return punkIdTag![1]
    })

    console.log(`✅ Loaded ${punkIds.length} official punks from authority relay`)

    // Update cache
    officialPunksCache = {
      punkIds: new Set(punkIds),
      events: finalEvents,
      lastFetch: now
    }

    return { punkIds, events: finalEvents }

  } catch (error) {
    console.error('❌ Failed to fetch official punks from relay:', error)

    // Return empty list if fetch fails
    return { punkIds: [], events: [] }
  } finally {
    pool.close([OFFICIAL_RELAY])
  }
}

/**
 * Check if a punk ID is in the official collection
 */
export async function isPunkOfficial(punkId: string): Promise<boolean> {
  try {
    const { punkIds } = await getOfficialPunksList()
    return punkIds.includes(punkId)
  } catch (error) {
    console.error('Failed to check if punk is official:', error)
    return false
  }
}

/**
 * Get the index of a punk in the official collection (0-999)
 * Returns -1 if not in official collection
 */
export async function getOfficialPunkIndex(punkId: string): Promise<number> {
  try {
    const { punkIds } = await getOfficialPunksList()
    return punkIds.indexOf(punkId)
  } catch (error) {
    console.error('Failed to get punk index:', error)
    return -1
  }
}

/**
 * Get detailed info about an official punk
 */
export async function getOfficialPunkInfo(punkId: string): Promise<{
  isOfficial: boolean
  index: number
  mintedAt?: number
  owner?: string
  vtxo?: string
} | null> {
  try {
    const { punkIds, events } = await getOfficialPunksList()
    const index = punkIds.indexOf(punkId)

    if (index === -1) {
      return { isOfficial: false, index: -1 }
    }

    const event = events.find(e => {
      const punkIdTag = e.tags.find(t => t[0] === 'punk_id')
      return punkIdTag?.[1] === punkId
    })

    if (!event) {
      return { isOfficial: true, index }
    }

    const ownerTag = event.tags.find(t => t[0] === 'owner')
    const vtxoTag = event.tags.find(t => t[0] === 'vtxo')

    return {
      isOfficial: true,
      index,
      mintedAt: event.created_at,
      owner: ownerTag?.[1],
      vtxo: vtxoTag?.[1]
    }
  } catch (error) {
    console.error('Failed to get official punk info:', error)
    return null
  }
}

/**
 * Clear the official punks cache
 * Useful when you want to force a refresh
 */
export function clearOfficialPunksCache(): void {
  officialPunksCache = null
  console.log('🔄 Official punks cache cleared')
}

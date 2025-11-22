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
import { schnorr } from '@noble/curves/secp256k1'
import { PUNK_SUPPLY_CONFIG, SERVER_SIGNING_CONFIG, getServerPubkey } from '@/config/arkade'
import { sha256 } from '@noble/hashes/sha256'
import { hexToBytes } from '@noble/hashes/utils'

// Official relay - the authority for punk mints
const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1400 // Mainnet launch event kind

// Auto-whitelist cache (fetched from API)
let autoWhitelistCache: {
  punkIds: Set<string>
  lastFetch: number
} | null = null

const AUTO_WHITELIST_CACHE_DURATION = 60000 // 1 minute

/**
 * Fetch auto-whitelist from API
 * These are punks submitted by users from the launch period
 */
async function getAutoWhitelist(): Promise<Set<string>> {
  const now = Date.now()

  // Return cache if fresh
  if (autoWhitelistCache && (now - autoWhitelistCache.lastFetch) < AUTO_WHITELIST_CACHE_DURATION) {
    return autoWhitelistCache.punkIds
  }

  try {
    const response = await fetch('/api/whitelist/list')
    if (!response.ok) {
      console.warn('⚠️ Failed to fetch auto-whitelist from API')
      return new Set()
    }

    const data = await response.json()
    const punkIds = new Set<string>(data.punkIds || [])

    console.log(`✅ Auto-whitelist loaded: ${punkIds.size} punk(s)`)

    // Update cache
    autoWhitelistCache = {
      punkIds,
      lastFetch: now
    }

    return punkIds
  } catch (error) {
    console.warn('⚠️ Failed to fetch auto-whitelist:', error)
    return new Set()
  }
}

/**
 * Verify a punk's server signature
 * Returns true if the punk has a valid signature OR is in the legacy/auto whitelist
 */
async function verifyPunkSignature(punkId: string, signature?: string, verbose: boolean = false): Promise<boolean> {
  // Check legacy whitelist first (pre-signature punks)
  if (SERVER_SIGNING_CONFIG.LEGACY_WHITELIST.includes(punkId)) {
    if (verbose) console.log(`   ✅ Legacy whitelisted punk: ${punkId.slice(0, 8)}...`)
    return true
  }

  // Check auto-whitelist (launch period punks without Nostr events)
  const autoWhitelist = await getAutoWhitelist()
  if (autoWhitelist.has(punkId)) {
    if (verbose) console.log(`   ✅ Auto-whitelisted punk: ${punkId.slice(0, 8)}...`)
    return true
  }

  // No signature = not official
  if (!signature) {
    return false
  }

  try {
    const serverPubkey = getServerPubkey()

    // If server pubkey not configured, fall back to legacy mode
    if (!serverPubkey) {
      console.warn('⚠️  Server pubkey not configured - using legacy whitelist only')
      return false
    }

    // Verify schnorr signature
    const messageHash = sha256(punkId)
    const sigBytes = hexToBytes(signature)
    const pubkeyBytes = hexToBytes(serverPubkey)

    const isValid = schnorr.verify(sigBytes, messageHash, pubkeyBytes)

    if (verbose) {
      if (isValid) {
        console.log(`   ✅ Valid server signature for punk: ${punkId.slice(0, 8)}...`)
      } else {
        console.log(`   ❌ Invalid signature for punk: ${punkId.slice(0, 8)}...`)
      }
    }

    return isValid
  } catch (error) {
    if (verbose) console.error(`   ❌ Signature verification error for ${punkId.slice(0, 8)}:`, error)
    return false
  }
}

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
    console.log(`🔄 Using cached official punks (${officialPunksCache.punkIds.size} punks, age: ${Math.floor((now - officialPunksCache.lastFetch) / 1000)}s)`)
    return {
      punkIds: Array.from(officialPunksCache.punkIds),
      events: officialPunksCache.events
    }
  }

  console.log('🆕 Cache expired or empty, fetching fresh data from relay...')

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

    // Debug: Count events at each filter stage
    let withPunkId = 0
    let withVtxo = 0
    let withServerSig = 0
    let validSig = 0

    // Filter valid events (must have punk_id, vtxo, AND valid signature)
    // Using for loop instead of filter because verifyPunkSignature is async
    const validEvents: NostrEvent[] = []

    for (const event of events) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
      const signatureTag = event.tags.find(t => t[0] === 'server_sig')

      if (punkIdTag) withPunkId++
      if (vtxoTag) withVtxo++
      if (signatureTag) withServerSig++

      if (!punkIdTag || !vtxoTag) {
        continue
      }

      const punkId = punkIdTag[1]
      const signature = signatureTag?.[1]

      // Verify server signature or check legacy/auto whitelist
      const isValid = await verifyPunkSignature(punkId, signature)
      if (isValid) {
        validSig++
        validEvents.push(event)
      }
    }

    console.log(`   📊 Filter stages:`)
    console.log(`      - Events with punk_id: ${withPunkId}/${events.length}`)
    console.log(`      - Events with vtxo: ${withVtxo}/${events.length}`)
    console.log(`      - Events with server_sig: ${withServerSig}/${events.length}`)
    console.log(`      - Events with valid signature: ${validSig}/${events.length}`)
    console.log(`   ✅ Final valid events: ${validEvents.length}`)

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

    // Debug: Warn if we got zero official punks
    if (punkIds.length === 0) {
      console.warn('⚠️  WARNING: Zero official punks loaded! This will cause all official tags to disappear.')
      console.warn('⚠️  Check:')
      console.warn('⚠️    1. Are there punk events on the relay?')
      console.warn('⚠️    2. Do they have server_sig tags?')
      console.warn('⚠️    3. Is the server pubkey configured correctly?')
      console.warn(`⚠️    Current server pubkey: ${getServerPubkey()}`)
    }

    // Update cache
    officialPunksCache = {
      punkIds: new Set(punkIds),
      events: finalEvents,
      lastFetch: now
    }

    return { punkIds, events: finalEvents }

  } catch (error) {
    console.error('❌ Failed to fetch official punks from relay:', error)
    console.error('❌ Error details:', error instanceof Error ? error.message : String(error))

    // Return empty list if fetch fails (THIS WILL CAUSE OFFICIAL TAGS TO DISAPPEAR)
    console.warn('⚠️  Returning empty official punks list due to error - all official tags will be hidden!')
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

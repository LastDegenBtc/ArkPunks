/**
 * Supply API
 *
 * Returns the current punk supply from Vercel Blob registry.
 * This is the single source of truth, independent of Nostr relay reliability.
 *
 * Falls back to Nostr relay query only if blob registry is unavailable.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list } from '@vercel/blob'
import { SimplePool } from 'nostr-tools'

const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1400
const BLOB_FILENAME = 'punk-registry.json'

interface RegistryStore {
  entries: Array<{ punkId: string }>
  lastUpdated: number
}

interface SupplyCache {
  totalMinted: number
  maxPunks: number
  lastUpdated: number
  source: 'blob' | 'nostr'
}

// In-memory cache (persists while function is warm)
let memoryCache: SupplyCache | null = null
const CACHE_DURATION_MS = 30000 // 30 seconds

/**
 * Read supply from Vercel Blob registry (primary source)
 */
async function fetchSupplyFromBlob(): Promise<SupplyCache | null> {
  try {
    console.log('📦 Fetching supply from Vercel Blob registry...')

    const { blobs } = await list()
    const registryBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!registryBlob) {
      console.log('   ⚠️  No registry blob found')
      return null
    }

    const url = (registryBlob as any).downloadUrl || registryBlob.url
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const store: RegistryStore = JSON.parse(text)

    console.log(`✅ Blob registry: ${store.entries.length} punks`)

    return {
      totalMinted: store.entries.length,
      maxPunks: 1000,
      lastUpdated: store.lastUpdated,
      source: 'blob'
    }
  } catch (error) {
    console.error('❌ Failed to read blob registry:', error)
    return null
  }
}

/**
 * Fetch supply from Nostr relay (fallback only)
 */
async function fetchSupplyFromNostr(): Promise<SupplyCache> {
  console.log('📡 Falling back to Nostr relay query...')

  const pool = new SimplePool()

  try {
    const allEvents = await pool.querySync([OFFICIAL_RELAY], {
      kinds: [KIND_PUNK_MINT],
      '#t': ['arkade-punk'],
      limit: 2000
    })

    console.log(`   Found ${allEvents.length} total events`)

    // Filter by network AND server signature (only official punks)
    const events = allEvents.filter(e => {
      const networkTag = e.tags.find(t => t[0] === 'network')
      const serverSigTag = e.tags.find(t => t[0] === 'server_sig')
      return networkTag?.[1] === 'mainnet' && serverSigTag
    })

    // Deduplicate by punkId
    const punkMap = new Map()
    for (const event of events) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (!punkIdTag) continue

      const punkId = punkIdTag[1]
      const existing = punkMap.get(punkId)

      if (!existing || event.created_at < existing.created_at) {
        punkMap.set(punkId, event)
      }
    }

    const count = punkMap.size
    console.log(`✅ Nostr relay: ${count} unique punks`)

    return {
      totalMinted: count,
      maxPunks: 1000,
      lastUpdated: Date.now(),
      source: 'nostr'
    }
  } finally {
    pool.close([OFFICIAL_RELAY])
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📊 Supply API called')
  console.log(`   User-Agent: ${req.headers['user-agent']}`)
  console.log(`   IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`)

  try {
    const now = Date.now()

    // Check if in-memory cache is fresh
    if (memoryCache && (now - memoryCache.lastUpdated) < CACHE_DURATION_MS) {
      const age = Math.floor((now - memoryCache.lastUpdated) / 1000)
      console.log(`✅ Serving cached supply (age: ${age}s, source: ${memoryCache.source})`)

      return res.status(200).json({
        totalMinted: memoryCache.totalMinted,
        maxPunks: memoryCache.maxPunks,
        cached: true,
        cacheAge: age,
        source: memoryCache.source
      })
    }

    // Cache expired or doesn't exist - fetch fresh data
    console.log('🔄 Cache expired or missing, fetching fresh data...')

    // Try blob registry first (primary source of truth)
    let freshSupply = await fetchSupplyFromBlob()

    // Fall back to Nostr if blob unavailable
    if (!freshSupply) {
      console.log('⚠️  Blob registry unavailable, falling back to Nostr...')
      freshSupply = await fetchSupplyFromNostr()
    }

    // Update in-memory cache
    memoryCache = freshSupply

    console.log(`✅ Cache updated: ${freshSupply.totalMinted} punks (source: ${freshSupply.source})`)

    return res.status(200).json({
      totalMinted: freshSupply.totalMinted,
      maxPunks: freshSupply.maxPunks,
      cached: false,
      cacheAge: 0,
      source: freshSupply.source
    })

  } catch (error: any) {
    console.error('❌ Error in supply API:', error)

    return res.status(500).json({
      error: 'Failed to fetch supply',
      details: error.message,
      totalMinted: 0,
      maxPunks: 1000
    })
  }
}

/**
 * Punk Registry List API
 *
 * Returns the list of all registered punk IDs and total supply.
 * This is the single source of truth for punk supply.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list } from '@vercel/blob'

interface RegistryEntry {
  punkId: string
  mintedAt: number
  minterPubkey?: string
  vtxo?: string
}

interface RegistryStore {
  entries: RegistryEntry[]
  lastUpdated: number
}

const BLOB_FILENAME = 'punk-registry.json'

// In-memory cache
let registryCache: RegistryStore | null = null
let lastFetchAttempt: number = 0
const FETCH_RETRY_DELAY = 5000 // 5 seconds between fetch attempts

/**
 * Read registry from Vercel Blob
 */
async function readRegistry(): Promise<RegistryStore> {
  // Return cached value if available
  if (registryCache) {
    return registryCache
  }

  // Rate limit fetch attempts
  const now = Date.now()
  if (now - lastFetchAttempt < FETCH_RETRY_DELAY) {
    console.log('⏭️  Skipping fetch (too soon since last attempt)')
    return { entries: [], lastUpdated: Date.now() }
  }

  lastFetchAttempt = now

  try {
    const { blobs } = await list()
    const registryBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!registryBlob) {
      console.log('📝 No registry blob found')
      return { entries: [], lastUpdated: Date.now() }
    }

    const url = (registryBlob as any).downloadUrl || registryBlob.url

    console.log(`📥 Fetching registry from blob...`)
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const store: RegistryStore = JSON.parse(text)

    // Cache successfully fetched registry
    registryCache = store

    return store
  } catch (error) {
    console.warn('Failed to read registry, returning empty:', error)
    return { entries: [], lastUpdated: Date.now() }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📋 Punk registry list endpoint called')

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const store = await readRegistry()

    console.log(`✅ Returning ${store.entries.length} registered punk(s)`)

    return res.status(200).json({
      punkIds: store.entries.map(e => e.punkId),
      count: store.entries.length,
      maxPunks: 1000,
      lastUpdated: store.lastUpdated
    })

  } catch (error: any) {
    console.error('❌ Error reading registry:', error)
    return res.status(500).json({
      error: 'Failed to read registry',
      details: error.message,
      punkIds: [],
      count: 0
    })
  }
}

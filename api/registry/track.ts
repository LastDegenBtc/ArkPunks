/**
 * Punk Registry Tracking API
 *
 * Stores minted punk IDs in Vercel Blob as the single source of truth.
 * This ensures accurate supply counting independent of Nostr relay reliability.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, list } from '@vercel/blob'

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

/**
 * Read registry from Vercel Blob
 */
async function readRegistry(): Promise<RegistryStore> {
  try {
    const { blobs } = await list()
    const registryBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!registryBlob) {
      console.log('📝 No registry blob found, creating new one')
      return { entries: [], lastUpdated: Date.now() }
    }

    const url = (registryBlob as any).downloadUrl || registryBlob.url
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const store: RegistryStore = JSON.parse(text)
    return store
  } catch (error) {
    console.warn('Failed to read registry, returning empty:', error)
    return { entries: [], lastUpdated: Date.now() }
  }
}

/**
 * Write registry to Vercel Blob
 */
async function writeRegistry(store: RegistryStore): Promise<void> {
  store.lastUpdated = Date.now()

  await put(BLOB_FILENAME, JSON.stringify(store, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 0  // No CDN caching - always fresh
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📝 Punk registry track endpoint called')

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkId, pubkey, vtxo } = req.body

    if (!punkId || typeof punkId !== 'string' || punkId.length !== 64) {
      return res.status(400).json({
        error: 'Missing or invalid punkId',
        required: 'punkId: string (64 chars hex)'
      })
    }

    console.log(`📋 Registering punk: ${punkId.slice(0, 16)}...`)
    if (pubkey) {
      console.log(`   Minter: ${pubkey.slice(0, 16)}...`)
    }

    // Load current registry
    const store = await readRegistry()
    const existingIds = new Set(store.entries.map(e => e.punkId))

    // Check if already registered
    if (existingIds.has(punkId)) {
      console.log(`   ⏭️  Already registered`)
      return res.status(200).json({
        success: true,
        alreadyRegistered: true,
        totalRegistered: store.entries.length
      })
    }

    // Add new punk to registry
    store.entries.push({
      punkId,
      mintedAt: Date.now(),
      minterPubkey: pubkey,
      vtxo
    })

    // Save updated registry
    await writeRegistry(store)

    console.log(`✅ Punk registered! Total: ${store.entries.length}`)

    return res.status(200).json({
      success: true,
      alreadyRegistered: false,
      totalRegistered: store.entries.length,
      message: `Punk registered successfully`
    })

  } catch (error: any) {
    console.error('❌ Error registering punk:', error)
    return res.status(500).json({
      error: 'Failed to register punk',
      details: error.message
    })
  }
}

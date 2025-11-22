/**
 * Auto-Whitelist Submit API
 *
 * Accepts punk IDs from users that were minted locally but never published to Nostr.
 * These are from the launch period when Nostr publishing had issues.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put, list } from '@vercel/blob'

// Launch window: First 6 hours after launch
const LAUNCH_DATE = new Date('2024-11-22T11:00:00Z') // Nov 22, 2024, 12:00 CET
const CUTOFF_DATE = new Date(LAUNCH_DATE.getTime() + 6 * 60 * 60 * 1000)

interface WhitelistEntry {
  punkId: string
  submittedAt: number
  submitterPubkey?: string
}

interface WhitelistStore {
  entries: WhitelistEntry[]
  lastUpdated: number
}

const BLOB_FILENAME = 'auto-whitelist.json'

/**
 * Read whitelist from Vercel Blob
 */
async function readWhitelist(): Promise<WhitelistStore> {
  try {
    const { blobs } = await list()
    const whitelistBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!whitelistBlob) {
      return { entries: [], lastUpdated: Date.now() }
    }

    const response = await fetch(whitelistBlob.url)
    const store: WhitelistStore = await response.json()
    return store
  } catch (error) {
    console.warn('Failed to read whitelist, returning empty:', error)
    return { entries: [], lastUpdated: Date.now() }
  }
}

/**
 * Write whitelist to Vercel Blob
 */
async function writeWhitelist(store: WhitelistStore): Promise<void> {
  store.lastUpdated = Date.now()

  await put(BLOB_FILENAME, JSON.stringify(store, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📝 Auto-whitelist submit endpoint called')
  console.log('   Method:', req.method)

  // Allow both GET (for testing) and POST
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { punkIds, pubkey } = req.method === 'POST' ? req.body : req.query

    if (!punkIds || !Array.isArray(punkIds)) {
      return res.status(400).json({
        error: 'Missing or invalid punkIds array',
        required: 'punkIds: string[]'
      })
    }

    console.log(`📋 Received ${punkIds.length} punk IDs for whitelisting`)
    if (pubkey) {
      console.log(`   From pubkey: ${pubkey.slice(0, 16)}...`)
    }

    // Load current whitelist
    const store = await readWhitelist()
    const existingIds = new Set(store.entries.map(e => e.punkId))

    // Add new punk IDs (deduplicate)
    let addedCount = 0
    for (const punkId of punkIds) {
      if (typeof punkId !== 'string' || punkId.length !== 64) {
        console.warn(`⚠️ Invalid punk ID format: ${punkId}`)
        continue
      }

      if (!existingIds.has(punkId)) {
        store.entries.push({
          punkId,
          submittedAt: Date.now(),
          submitterPubkey: pubkey
        })
        existingIds.add(punkId)
        addedCount++
        console.log(`   ✅ Added: ${punkId.slice(0, 16)}...`)
      } else {
        console.log(`   ⏭️  Already whitelisted: ${punkId.slice(0, 16)}...`)
      }
    }

    // Save updated whitelist
    if (addedCount > 0) {
      await writeWhitelist(store)
      console.log(`✅ Whitelist updated: ${addedCount} new punk(s) added`)
    }

    return res.status(200).json({
      success: true,
      added: addedCount,
      totalWhitelisted: store.entries.length,
      message: addedCount > 0
        ? `Added ${addedCount} punk(s) to whitelist`
        : 'All punks already whitelisted'
    })

  } catch (error: any) {
    console.error('❌ Error processing whitelist submission:', error)
    return res.status(500).json({
      error: 'Failed to process submission',
      details: error.message
    })
  }
}

/**
 * Auto-Whitelist List API
 *
 * Returns the current auto-whitelist of punk IDs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list } from '@vercel/blob'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const store = await readWhitelist()

    return res.status(200).json({
      punkIds: store.entries.map(e => e.punkId),
      count: store.entries.length,
      lastUpdated: store.lastUpdated
    })

  } catch (error: any) {
    console.error('❌ Error fetching whitelist:', error)
    return res.status(500).json({
      error: 'Failed to fetch whitelist',
      details: error.message
    })
  }
}

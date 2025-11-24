/**
 * Clear Blob Storage
 *
 * Simple endpoint to reset the escrow blob to empty state.
 * Use this to clean up corrupted listings.
 *
 * GET /api/escrow/clear-blob
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { put } from '@vercel/blob'

const BLOB_FILENAME = 'escrow-listings.json'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🗑️ Clearing escrow blob storage...')

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Create empty store
    const emptyStore = {
      listings: {},
      lastUpdated: Date.now()
    }

    // Write to blob
    const result = await put(BLOB_FILENAME, JSON.stringify(emptyStore, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true
    })

    console.log('✅ Blob storage cleared successfully')
    console.log(`   Blob URL: ${result.url}`)

    return res.status(200).json({
      success: true,
      message: 'Blob storage cleared - all escrow listings removed',
      blobUrl: result.url
    })

  } catch (error: any) {
    console.error('❌ Failed to clear blob:', error)
    return res.status(500).json({
      error: 'Failed to clear blob storage',
      details: error.message
    })
  }
}

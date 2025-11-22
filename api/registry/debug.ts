/**
 * Debug endpoint to list all blobs in Vercel Blob storage
 *
 * This helps diagnose why the supply endpoint can't find punk-registry.json
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list } from '@vercel/blob'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    console.log('🔍 Listing all blobs in storage...')

    const { blobs } = await list()

    console.log(`   Found ${blobs.length} blobs`)

    return res.status(200).json({
      count: blobs.length,
      blobs: blobs.map(b => ({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt
      }))
    })
  } catch (error: any) {
    console.error('❌ Error listing blobs:', error)
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    })
  }
}

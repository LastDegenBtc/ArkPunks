/**
 * Export All Data API
 *
 * GET /api/export-all
 *
 * Returns all critical data from Vercel Blob for local migration.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { list } from '@vercel/blob'

const BLOB_FILES = [
  'punk-ownership.json',
  'escrow-listings.json',
  'punk-registry.json',
  'auto-whitelist.json'
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('📦 Export all data endpoint called')

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { blobs } = await list()
    console.log(`Found ${blobs.length} blobs in storage`)

    const exportData: Record<string, any> = {}

    for (const filename of BLOB_FILES) {
      const blob = blobs.find(b => b.pathname === filename)

      if (!blob) {
        console.warn(`⚠️  Blob not found: ${filename}`)
        exportData[filename] = null
        continue
      }

      const url = (blob as any).downloadUrl || blob.url
      const response = await fetch(url)

      if (!response.ok) {
        console.error(`❌ Failed to fetch ${filename}: HTTP ${response.status}`)
        exportData[filename] = null
        continue
      }

      const data = await response.json()
      exportData[filename] = data

      // Log summary
      if (data.ownership) {
        console.log(`✅ ${filename}: ${Object.keys(data.ownership).length} punks`)
      } else if (data.listings) {
        console.log(`✅ ${filename}: ${Object.keys(data.listings).length} listings`)
      } else if (data.entries) {
        console.log(`✅ ${filename}: ${data.entries.length} entries`)
      }
    }

    return res.status(200).json({
      success: true,
      exportedAt: Date.now(),
      data: exportData
    })

  } catch (error: any) {
    console.error('❌ Error exporting data:', error)
    return res.status(500).json({
      error: 'Failed to export data',
      details: error.message
    })
  }
}

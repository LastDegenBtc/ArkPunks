/**
 * Punk Ownership Storage
 *
 * Single source of truth for punk ownership.
 * Maps punkId -> Arkade address (ark1...)
 */

import { put, list } from '@vercel/blob'

export interface OwnershipTable {
  ownership: Record<string, string> // punkId -> ark1 address
  lastUpdated: number
}

const BLOB_FILENAME = 'punk-ownership.json'

/**
 * Read ownership table from Vercel Blob
 */
export async function readOwnershipTable(): Promise<OwnershipTable> {
  try {
    const { blobs } = await list()
    const ownershipBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!ownershipBlob) {
      console.log('📝 No ownership table found, creating new one')
      return { ownership: {}, lastUpdated: Date.now() }
    }

    const url = (ownershipBlob as any).downloadUrl || ownershipBlob.url
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    const table: OwnershipTable = JSON.parse(text)
    return table
  } catch (error) {
    console.warn('Failed to read ownership table, returning empty:', error)
    return { ownership: {}, lastUpdated: Date.now() }
  }
}

/**
 * Write ownership table to Vercel Blob
 */
export async function writeOwnershipTable(table: OwnershipTable): Promise<void> {
  table.lastUpdated = Date.now()

  await put(BLOB_FILENAME, JSON.stringify(table, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    cacheControlMaxAge: 0,
    allowOverwrite: true
  })

  console.log(`✅ Ownership table updated (${Object.keys(table.ownership).length} punks)`)
}

/**
 * Get owner of a punk
 */
export async function getPunkOwner(punkId: string): Promise<string | null> {
  const table = await readOwnershipTable()
  return table.ownership[punkId] || null
}

/**
 * Set owner of a punk
 */
export async function setPunkOwner(punkId: string, ownerAddress: string): Promise<void> {
  const table = await readOwnershipTable()
  table.ownership[punkId] = ownerAddress
  await writeOwnershipTable(table)
  console.log(`✅ Punk ${punkId.slice(0, 8)}... owner set to ${ownerAddress.slice(0, 20)}...`)
}

/**
 * Batch set owners (for initialization)
 */
export async function batchSetOwners(updates: Record<string, string>): Promise<void> {
  const table = await readOwnershipTable()

  let updateCount = 0
  for (const [punkId, ownerAddress] of Object.entries(updates)) {
    table.ownership[punkId] = ownerAddress
    updateCount++
  }

  await writeOwnershipTable(table)
  console.log(`✅ Batch updated ${updateCount} punk owners`)
}

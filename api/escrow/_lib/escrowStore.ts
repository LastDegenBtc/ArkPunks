/**
 * Escrow Store
 *
 * Persistent storage using Vercel Blob
 */

import { put, list } from '@vercel/blob'
import { hex } from '@scure/base'
import { getPublicKey } from 'nostr-tools'

// Escrow wallet configuration (from Vercel env vars)
export const ESCROW_PRIVATE_KEY = process.env.ESCROW_WALLET_PRIVATE_KEY || ''
export const ESCROW_ADDRESS = process.env.ESCROW_WALLET_ADDRESS || 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4rrk6z965cxsq33k2t2xcl3mvn0faqk88fqaxef3zj6mfjqwj5xwm3vqcd'

// Derive escrow public key from private key for Nostr ownership
function deriveEscrowPubkey(): string {
  if (!ESCROW_PRIVATE_KEY || ESCROW_PRIVATE_KEY.length === 0) {
    console.warn('⚠️ ESCROW_PRIVATE_KEY not configured, escrow pubkey will be empty')
    return ''
  }
  try {
    const pubkey = getPublicKey(hex.decode(ESCROW_PRIVATE_KEY))
    console.log('✅ Escrow pubkey derived:', pubkey.slice(0, 16) + '...')
    return pubkey
  } catch (error) {
    console.error('❌ Failed to derive escrow pubkey:', error)
    return ''
  }
}

export const ESCROW_PUBKEY = deriveEscrowPubkey()

export interface EscrowListing {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
  price: string // bigint as string
  punkVtxoOutpoint: string
  escrowAddress: string
  status: 'pending' | 'deposited' | 'sold' | 'cancelled'
  createdAt: number
  depositedAt?: number
  soldAt?: number
  buyerAddress?: string
  buyerPubkey?: string
  punkTransferTxid?: string
  paymentTransferTxid?: string
}

interface EscrowStore {
  listings: Record<string, EscrowListing>
  lastUpdated: number
}

const BLOB_FILENAME = 'escrow-listings.json'

/**
 * Read all listings from Vercel Blob
 */
async function readStore(): Promise<EscrowStore> {
  try {
    // List all blobs to find our store
    const { blobs } = await list()
    const storeBlob = blobs.find(b => b.pathname === BLOB_FILENAME)

    if (!storeBlob) {
      // No store exists yet, return empty
      return { listings: {}, lastUpdated: Date.now() }
    }

    // Fetch the blob content
    const response = await fetch(storeBlob.url)
    const store: EscrowStore = await response.json()

    return store
  } catch (error) {
    console.warn('Failed to read blob store, returning empty:', error)
    return { listings: {}, lastUpdated: Date.now() }
  }
}

/**
 * Write all listings to Vercel Blob
 */
async function writeStore(store: EscrowStore): Promise<void> {
  store.lastUpdated = Date.now()

  await put(BLOB_FILENAME, JSON.stringify(store, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  })
}

/**
 * Create a new escrow listing
 */
export async function createEscrowListing(listing: EscrowListing): Promise<void> {
  const store = await readStore()
  store.listings[listing.punkId] = listing
  await writeStore(store)
  console.log(`📝 Created escrow listing for punk ${listing.punkId}`)
}

/**
 * Get an escrow listing by punk ID
 */
export async function getEscrowListing(punkId: string): Promise<EscrowListing | undefined> {
  const store = await readStore()
  return store.listings[punkId]
}

/**
 * Get all active escrow listings
 */
export async function getAllEscrowListings(): Promise<EscrowListing[]> {
  const store = await readStore()
  return Object.values(store.listings)
    .filter(l => l.status === 'deposited' || l.status === 'pending')
}

/**
 * Update escrow listing status
 */
export async function updateEscrowStatus(
  punkId: string,
  status: EscrowListing['status'],
  updates?: Partial<EscrowListing>
): Promise<void> {
  const store = await readStore()
  const listing = store.listings[punkId]

  if (!listing) {
    throw new Error(`Listing not found: ${punkId}`)
  }

  listing.status = status
  if (updates) {
    Object.assign(listing, updates)
  }

  store.listings[punkId] = listing
  await writeStore(store)
  console.log(`✏️ Updated escrow listing ${punkId}: ${status}`)
}

/**
 * Mark listing as deposited (punk VTXO received)
 */
export async function markAsDeposited(punkId: string): Promise<void> {
  await updateEscrowStatus(punkId, 'deposited', {
    depositedAt: Date.now()
  })
}

/**
 * Mark listing as sold
 */
export async function markAsSold(punkId: string, buyerAddress: string, buyerPubkey?: string): Promise<void> {
  await updateEscrowStatus(punkId, 'sold', {
    soldAt: Date.now(),
    buyerAddress,
    buyerPubkey
  })
}

/**
 * Remove old listings (cleanup)
 */
export async function cleanupOldListings(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
  const store = await readStore()
  const now = Date.now()
  let removed = 0

  for (const [punkId, listing] of Object.entries(store.listings)) {
    if (listing.status === 'sold' || listing.status === 'cancelled') {
      if (now - listing.createdAt > maxAgeMs) {
        delete store.listings[punkId]
        removed++
      }
    }
  }

  if (removed > 0) {
    await writeStore(store)
    console.log(`🗑️ Cleaned up ${removed} old listings`)
  }
}

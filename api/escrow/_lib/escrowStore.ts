/**
 * Escrow Store
 *
 * Simple in-memory storage for escrow listings
 * TODO: Migrate to Vercel KV for persistence
 */

// Escrow wallet configuration
// In production, this should be stored in Vercel environment variables
export const ESCROW_PRIVATE_KEY = process.env.ESCROW_PRIVATE_KEY || ''
export const ESCROW_ADDRESS = 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4rrk6z965cxsq33k2t2xcl3mvn0faqk88fqaxef3zj6mfjqwj5xwm3vqcd'

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
}

// In-memory store (temporary - will be replaced with Vercel KV)
const escrowListings = new Map<string, EscrowListing>()

/**
 * Create a new escrow listing
 */
export function createEscrowListing(listing: EscrowListing): void {
  escrowListings.set(listing.punkId, listing)
  console.log(`📝 Created escrow listing for punk ${listing.punkId}`)
}

/**
 * Get an escrow listing by punk ID
 */
export function getEscrowListing(punkId: string): EscrowListing | undefined {
  return escrowListings.get(punkId)
}

/**
 * Get all active escrow listings
 */
export function getAllEscrowListings(): EscrowListing[] {
  return Array.from(escrowListings.values())
    .filter(l => l.status === 'deposited' || l.status === 'pending')
}

/**
 * Update escrow listing status
 */
export function updateEscrowStatus(
  punkId: string,
  status: EscrowListing['status'],
  updates?: Partial<EscrowListing>
): void {
  const listing = escrowListings.get(punkId)
  if (!listing) {
    throw new Error(`Listing not found: ${punkId}`)
  }

  listing.status = status
  if (updates) {
    Object.assign(listing, updates)
  }

  escrowListings.set(punkId, listing)
  console.log(`✏️ Updated escrow listing ${punkId}: ${status}`)
}

/**
 * Mark listing as deposited (punk VTXO received)
 */
export function markAsDeposited(punkId: string): void {
  updateEscrowStatus(punkId, 'deposited', {
    depositedAt: Date.now()
  })
}

/**
 * Mark listing as sold
 */
export function markAsSold(punkId: string, buyerAddress: string, buyerPubkey?: string): void {
  updateEscrowStatus(punkId, 'sold', {
    soldAt: Date.now(),
    buyerAddress,
    buyerPubkey
  })
}

/**
 * Remove old listings (cleanup)
 */
export function cleanupOldListings(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): void {
  const now = Date.now()
  let removed = 0

  for (const [punkId, listing] of escrowListings.entries()) {
    if (listing.status === 'sold' || listing.status === 'cancelled') {
      if (now - listing.createdAt > maxAgeMs) {
        escrowListings.delete(punkId)
        removed++
      }
    }
  }

  if (removed > 0) {
    console.log(`🗑️ Cleaned up ${removed} old listings`)
  }
}

/**
 * Escrow API Client
 *
 * Client-side functions for interacting with the escrow serverless functions
 */

export interface EscrowListing {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
  price: string
  punkVtxoOutpoint: string
  escrowAddress: string
  status: 'pending' | 'deposited' | 'sold' | 'cancelled'
  createdAt: number
  depositedAt?: number
  soldAt?: number
  buyerAddress?: string
  buyerPubkey?: string
}

export interface ListPunkRequest {
  punkId: string
  sellerPubkey: string
  sellerArkAddress: string
  price: string
  punkVtxoOutpoint: string
}

export interface ListPunkResponse {
  success: boolean
  punkId: string
  escrowAddress: string
  price: string
  message: string
  instructions: string[]
}

export interface BuyPunkRequest {
  punkId: string
  buyerPubkey: string
  buyerArkAddress: string
}

export interface BuyPunkResponse {
  success: boolean
  punkId: string
  price: string
  totalWithFee: string
  fee: string
  feePercent: number
  escrowAddress: string
  instructions: string[]
}

export interface ExecuteSwapRequest {
  punkId: string
  buyerPubkey: string
}

export interface ExecuteSwapResponse {
  success: boolean
  punkId: string
  punkTxid: string
  paymentTxid: string
  message: string
}

export interface EscrowStatusResponse {
  success: boolean
  listing?: EscrowListing
  listings?: EscrowListing[]
  count?: number
}

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Get escrow wallet information
 */
export async function getEscrowInfo(): Promise<{
  escrowAddress: string
  escrowPubkey: string
  network: 'mainnet' | 'testnet'
}> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/info`)

  if (!response.ok) {
    throw new Error(`Failed to get escrow info: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Test if the escrow API is running
 */
export async function testEscrowApi(): Promise<{ message: string; timestamp: string; version: string }> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/test`)

  if (!response.ok) {
    throw new Error(`API test failed: ${response.statusText}`)
  }

  return response.json()
}

/**
 * List a punk in escrow mode
 *
 * @param request Listing details
 * @returns Escrow address and instructions
 */
export async function listPunkInEscrow(request: ListPunkRequest): Promise<ListPunkResponse> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/list`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to list punk in escrow')
  }

  return response.json()
}

/**
 * Buy a punk from escrow
 *
 * @param request Purchase details including payment TXID
 * @returns Transaction IDs for punk transfer and seller payout
 */
export async function buyPunkFromEscrow(request: BuyPunkRequest): Promise<BuyPunkResponse> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/buy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to purchase punk from escrow')
  }

  return response.json()
}

/**
 * Get status of a specific escrow listing
 *
 * @param punkId The punk ID to check
 * @returns Listing details
 */
export async function getEscrowStatus(punkId: string): Promise<EscrowListing> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/status?punkId=${encodeURIComponent(punkId)}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get escrow status')
  }

  const data: EscrowStatusResponse = await response.json()

  if (!data.listing) {
    throw new Error('Listing not found')
  }

  return data.listing
}

/**
 * Get all active escrow listings
 *
 * @returns Array of all escrow listings
 */
export async function getAllEscrowListings(): Promise<EscrowListing[]> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/status`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to get escrow listings')
  }

  const data: EscrowStatusResponse = await response.json()

  return data.listings || []
}

/**
 * Execute atomic swap for an escrow listing
 *
 * This should be called by the buyer after sending payment to escrow.
 * The server will verify both deposits and execute the swap.
 *
 * @param request Execution details
 * @returns Transaction IDs for punk and payment transfers
 */
export async function executeEscrowSwap(request: ExecuteSwapRequest): Promise<ExecuteSwapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/escrow/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to execute swap')
  }

  return response.json()
}

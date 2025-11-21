/**
 * Escrow Wallet Management
 *
 * SIMPLIFIED: Returns static escrow address
 * The actual wallet operations will be handled by execute.ts
 */

import { ESCROW_ADDRESS } from './escrowStore.js'

/**
 * Get the escrow wallet address (for receiving punk VTXOs and payments)
 */
export function getEscrowAddress(): string {
  if (!ESCROW_ADDRESS) {
    throw new Error('Escrow address not configured')
  }
  return ESCROW_ADDRESS
}

/**
 * Validate that escrow is properly configured
 */
export function isEscrowConfigured(): boolean {
  return !!ESCROW_ADDRESS
}

/**
 * Escrow Wallet Management
 *
 * SIMPLIFIED: Returns static escrow address from environment variable
 * The actual wallet operations will be handled manually or via separate service
 */

// Get escrow wallet address from environment
const ESCROW_ADDRESS = process.env.ESCROW_WALLET_ADDRESS

if (!ESCROW_ADDRESS) {
  console.warn('⚠️ ESCROW_WALLET_ADDRESS not set - using placeholder')
}

/**
 * Get the escrow wallet address (for receiving punk VTXOs)
 */
export function getEscrowAddress(): string {
  if (!ESCROW_ADDRESS) {
    throw new Error('Escrow address not configured - set ESCROW_WALLET_ADDRESS environment variable')
  }
  return ESCROW_ADDRESS
}

/**
 * Validate that escrow is properly configured
 */
export function isEscrowConfigured(): boolean {
  return !!ESCROW_ADDRESS
}

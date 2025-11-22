/**
 * Lightning Swaps via Boltz
 *
 * Enables Lightning Network integration for Arkade wallet:
 * - Receive: Lightning → Arkade (submarine swap)
 * - Send: Arkade → Lightning (reverse swap)
 */

import { BoltzSwapProvider } from '@arkade-os/boltz-swap'
import type { ArkWallet } from '@arkade-os/sdk'

const BOLTZ_API = 'https://api.ark.boltz.exchange'
const NETWORK = 'bitcoin' // mainnet

let boltzProvider: BoltzSwapProvider | null = null

/**
 * Initialize Boltz swap provider
 */
export function initBoltzProvider(): BoltzSwapProvider {
  if (!boltzProvider) {
    boltzProvider = new BoltzSwapProvider(BOLTZ_API, NETWORK)
  }
  return boltzProvider
}

/**
 * Create a Lightning invoice to receive funds into Arkade wallet
 *
 * @param wallet - Arkade wallet instance
 * @param amountSats - Amount in satoshis to receive
 * @returns Invoice details including bolt11 string
 */
export async function createReceiveInvoice(
  wallet: ArkWallet,
  amountSats: number
) {
  const provider = initBoltzProvider()

  try {
    const invoice = await provider.createInvoice(wallet, amountSats)

    return {
      bolt11: invoice.invoice,
      paymentHash: invoice.paymentHash,
      preimage: invoice.preimage,
      amount: amountSats,
      swapId: invoice.swapId,
      expiry: invoice.expiry
    }
  } catch (error: any) {
    console.error('Failed to create receive invoice:', error)
    throw new Error(`Failed to create invoice: ${error.message}`)
  }
}

/**
 * Wait for payment and claim to Arkade wallet
 *
 * @param wallet - Arkade wallet instance
 * @param swapId - Swap ID from createInvoice
 * @returns Transaction ID when claimed
 */
export async function waitAndClaimPayment(
  wallet: ArkWallet,
  swapId: string
): Promise<string> {
  const provider = initBoltzProvider()

  try {
    const txid = await provider.waitAndClaim(wallet, swapId)
    console.log('✅ Lightning payment claimed:', txid)
    return txid
  } catch (error: any) {
    console.error('Failed to claim payment:', error)
    throw new Error(`Failed to claim payment: ${error.message}`)
  }
}

/**
 * Decode a Lightning invoice to get details
 *
 * @param bolt11 - Lightning invoice string
 * @returns Invoice details
 */
export async function decodeInvoice(bolt11: string) {
  const provider = initBoltzProvider()

  try {
    const decoded = await provider.decodeInvoice(bolt11)
    return {
      amount: decoded.amount,
      paymentHash: decoded.paymentHash,
      description: decoded.description,
      expiry: decoded.expiry,
      timestamp: decoded.timestamp
    }
  } catch (error: any) {
    console.error('Failed to decode invoice:', error)
    throw new Error(`Invalid invoice: ${error.message}`)
  }
}

/**
 * Pay a Lightning invoice from Arkade wallet
 *
 * @param wallet - Arkade wallet instance
 * @param bolt11 - Lightning invoice to pay
 * @param maxFeeSats - Optional maximum fee tolerance in sats
 * @returns Payment result with preimage
 */
export async function payLightningInvoice(
  wallet: ArkWallet,
  bolt11: string,
  maxFeeSats?: number
) {
  const provider = initBoltzProvider()

  try {
    // Decode invoice first to show user the amount
    const decoded = await decodeInvoice(bolt11)

    console.log(`💸 Paying ${decoded.amount} sats via Lightning...`)

    const result = await provider.payInvoice(wallet, bolt11, maxFeeSats)

    return {
      preimage: result.preimage,
      paymentHash: result.paymentHash,
      amount: decoded.amount,
      fee: result.fee
    }
  } catch (error: any) {
    console.error('Failed to pay invoice:', error)
    throw new Error(`Failed to pay invoice: ${error.message}`)
  }
}

/**
 * Get pending swaps from storage (if storage was initialized)
 */
export async function getPendingSwaps(wallet: ArkWallet) {
  const provider = initBoltzProvider()

  try {
    const pending = await provider.getPendingSwaps(wallet)
    return pending || []
  } catch (error) {
    console.warn('Could not fetch pending swaps:', error)
    return []
  }
}

/**
 * Estimate fees for a Lightning swap
 *
 * @param amountSats - Amount in satoshis
 * @param direction - 'receive' or 'send'
 * @returns Estimated fee in sats
 */
export function estimateSwapFee(amountSats: number, direction: 'receive' | 'send'): number {
  // Boltz typically charges ~0.1-0.5% fee
  // Submarine swaps (receive) are slightly cheaper than reverse swaps (send)
  const feePercent = direction === 'receive' ? 0.001 : 0.005
  const minFee = direction === 'receive' ? 100 : 500 // sats

  return Math.max(Math.floor(amountSats * feePercent), minFee)
}

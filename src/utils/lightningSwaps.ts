/**
 * Lightning Swaps via Boltz
 *
 * Enables Lightning Network integration for Arkade wallet:
 * - Receive: Lightning → Arkade (submarine swap)
 * - Send: Arkade → Lightning (reverse swap)
 */

import { BoltzSwapProvider, ArkadeLightning } from '@arkade-os/boltz-swap'
import { RestArkProvider, RestIndexerProvider } from '@arkade-os/sdk'
import type { ArkadeWalletInterface } from '@/utils/arkadeWallet'
import { getActiveConfig } from '@/config/arkade'

const BOLTZ_API = 'https://api.ark.boltz.exchange'
const NETWORK = 'bitcoin' // mainnet

/**
 * Initialize ArkadeLightning instance with wallet
 */
function initArkadeLightning(walletInterface: ArkadeWalletInterface): ArkadeLightning {
  if (!walletInterface.sdkWallet) {
    throw new Error('SDK wallet not available')
  }

  const config = getActiveConfig()

  const swapProvider = new BoltzSwapProvider({
    apiUrl: BOLTZ_API,
    network: NETWORK
  })

  const arkProvider = new RestArkProvider({
    url: config.arkServerUrl
  })

  const indexerProvider = new RestIndexerProvider({
    url: config.arkServerUrl
  })

  return new ArkadeLightning({
    wallet: walletInterface.sdkWallet,
    swapProvider,
    arkProvider,
    indexerProvider
  })
}

/**
 * Create a Lightning invoice to receive funds into Arkade wallet
 *
 * @param wallet - Arkade wallet interface
 * @param amountSats - Amount in satoshis to receive
 * @returns Invoice details including bolt11 string
 */
export async function createReceiveInvoice(
  wallet: ArkadeWalletInterface,
  amountSats: number
) {
  const arkadeLightning = initArkadeLightning(wallet)

  try {
    const result = await arkadeLightning.createLightningInvoice({
      amount: amountSats,
      description: 'Arkade Punks - Lightning to Arkade'
    })

    return {
      bolt11: result.invoice,
      paymentHash: result.paymentHash,
      preimage: result.preimage,
      amount: result.amount,
      pendingSwap: result.pendingSwap,
      expiry: result.expiry
    }
  } catch (error: any) {
    console.error('Failed to create receive invoice:', error)
    throw new Error(`Failed to create invoice: ${error.message}`)
  }
}

/**
 * Wait for payment and claim to Arkade wallet
 *
 * @param wallet - Arkade wallet interface
 * @param pendingSwap - Pending swap object from createInvoice
 * @returns Transaction ID when claimed
 */
export async function waitAndClaimPayment(
  wallet: ArkadeWalletInterface,
  pendingSwap: any
): Promise<string> {
  const arkadeLightning = initArkadeLightning(wallet)

  try {
    const result = await arkadeLightning.waitAndClaim(pendingSwap)
    console.log('✅ Lightning payment claimed:', result.txid)
    return result.txid
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
  const swapProvider = new BoltzSwapProvider({
    apiUrl: BOLTZ_API,
    network: NETWORK
  })

  try {
    const decoded = await swapProvider.decodeInvoice(bolt11)
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
 * @param wallet - Arkade wallet interface
 * @param bolt11 - Lightning invoice to pay
 * @param maxFeeSats - Optional maximum fee tolerance in sats
 * @returns Payment result with preimage
 */
export async function payLightningInvoice(
  wallet: ArkadeWalletInterface,
  bolt11: string,
  maxFeeSats?: number
) {
  const arkadeLightning = initArkadeLightning(wallet)

  try {
    // Decode invoice first to show user the amount
    const decoded = await decodeInvoice(bolt11)

    console.log(`💸 Paying ${decoded.amount} sats via Lightning...`)

    const result = await arkadeLightning.sendLightningPayment({
      invoice: bolt11,
      maxFeeSats
    })

    return {
      preimage: result.preimage,
      paymentHash: decoded.paymentHash,
      amount: result.amount,
      txid: result.txid
    }
  } catch (error: any) {
    console.error('Failed to pay invoice:', error)
    throw new Error(`Failed to pay invoice: ${error.message}`)
  }
}

/**
 * Get pending swaps from storage (if storage was initialized)
 */
export async function getPendingSwaps(wallet: ArkadeWalletInterface) {
  const arkadeLightning = initArkadeLightning(wallet)

  try {
    const pending = await arkadeLightning.getPendingSwaps()
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

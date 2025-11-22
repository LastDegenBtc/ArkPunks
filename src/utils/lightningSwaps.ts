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
import * as bolt11 from 'light-bolt11-decoder'

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
 * Pay a Lightning invoice from Arkade wallet
 *
 * @param wallet - Arkade wallet interface
 * @param bolt11 - Lightning invoice to pay
 * @param maxFeeSats - Optional maximum fee tolerance in sats
 * @returns Payment result with preimage and amount
 */
export async function payLightningInvoice(
  wallet: ArkadeWalletInterface,
  bolt11: string,
  maxFeeSats?: number
) {
  const arkadeLightning = initArkadeLightning(wallet)

  try {
    console.log(`💸 Paying Lightning invoice...`)

    const result = await arkadeLightning.sendLightningPayment({
      invoice: bolt11,
      maxFeeSats
    })

    console.log(`✅ Payment sent: ${result.amount} sats`)

    return {
      preimage: result.preimage,
      paymentHash: result.paymentHash,
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
 * Decode a Lightning invoice to extract amount and other details
 *
 * @param invoice - bolt11 invoice string
 * @returns Invoice details including amount in sats
 */
export function decodeLightningInvoice(invoice: string): {
  amountSats: number
  description: string | null
  expiry: number
  paymentHash: string | null
} {
  try {
    const decoded = bolt11.decode(invoice)

    // Find amount section
    const amountSection = decoded.sections.find((s: any) => s.name === 'amount')
    const amountMillisats = amountSection ? parseInt(amountSection.value as string, 10) : 0
    const amountSats = Math.floor(amountMillisats / 1000)

    // Find description
    const descSection = decoded.sections.find((s: any) => s.name === 'description')
    const description = descSection ? (descSection.value as string) : null

    // Find expiry
    const expirySection = decoded.sections.find((s: any) => s.name === 'expiry')
    const expiry = expirySection ? parseInt(expirySection.value as string, 10) : 3600

    // Find payment hash
    const hashSection = decoded.sections.find((s: any) => s.name === 'payment_hash')
    const paymentHash = hashSection ? (hashSection.value as string) : null

    return {
      amountSats,
      description,
      expiry,
      paymentHash
    }
  } catch (error: any) {
    throw new Error(`Failed to decode Lightning invoice: ${error.message}`)
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

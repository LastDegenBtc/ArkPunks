/**
 * Punk Reserve Claim API
 *
 * POST /api/punks/claim-reserve
 *
 * Sends missing reserve sats to users who over-minted due to the locked sats bug.
 * Each punk requires 10,000 sats reserve. If user has N punks but less than N * 10,000 sats,
 * this endpoint sends the difference from escrow wallet fees.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getEscrowWallet } from '../escrow/_lib/escrowArkadeWallet.js'

interface ClaimRequest {
  userAddress: string
  punkCount: number
  currentBalance: string // bigint as string
}

interface ClaimResponse {
  success: boolean
  claimed: boolean
  deficit: string
  txid?: string
  message: string
}

const PUNK_RESERVE = 10000n // sats per punk
const MIN_CLAIM = 1000n // Don't send tiny amounts (< 1000 sats)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('💰 Punk reserve claim endpoint called')

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userAddress, punkCount, currentBalance } = req.body as ClaimRequest

    console.log(`   User: ${userAddress?.slice(0, 20)}...`)
    console.log(`   Punks: ${punkCount}`)
    console.log(`   Current balance: ${currentBalance} sats`)

    // Validate required fields
    if (!userAddress || punkCount === undefined || !currentBalance) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['userAddress', 'punkCount', 'currentBalance']
      })
    }

    // Validate punk count
    if (punkCount < 0 || punkCount > 100) {
      return res.status(400).json({
        error: 'Invalid punk count',
        details: 'Punk count must be between 0 and 100'
      })
    }

    // Calculate required reserve
    const balance = BigInt(currentBalance)
    const requiredReserve = BigInt(punkCount) * PUNK_RESERVE

    console.log(`   Required reserve: ${requiredReserve} sats`)

    // Calculate deficit
    const deficit = requiredReserve - balance

    if (deficit <= 0n) {
      console.log('✅ No deficit - user has sufficient reserve')
      return res.status(200).json({
        success: true,
        claimed: false,
        deficit: '0',
        message: 'You already have sufficient reserve for your punks!'
      })
    }

    console.log(`   Deficit: ${deficit} sats`)

    // Don't send tiny amounts
    if (deficit < MIN_CLAIM) {
      console.log(`⚠️ Deficit too small (< ${MIN_CLAIM} sats), ignoring`)
      return res.status(200).json({
        success: true,
        claimed: false,
        deficit: deficit.toString(),
        message: `Deficit is only ${deficit} sats - not worth claiming`
      })
    }

    // Initialize escrow wallet (source of reserve sats from fees)
    console.log('📦 Checking escrow wallet balance...')
    const escrowWallet = await getEscrowWallet()
    const escrowBalance = await escrowWallet.getBalance()
    console.log(`   Escrow available: ${escrowBalance.available} sats`)

    // Check if escrow has enough
    if (escrowBalance.available < deficit) {
      console.error(`❌ Insufficient escrow funds: need ${deficit}, have ${escrowBalance.available}`)
      return res.status(503).json({
        error: 'Escrow wallet has insufficient funds',
        details: `Need ${deficit} sats, but escrow only has ${escrowBalance.available} sats available`,
        deficit: deficit.toString()
      })
    }

    // Send missing reserve to user
    console.log(`💸 Sending ${deficit} sats to ${userAddress.slice(0, 20)}...`)
    const txid = await escrowWallet.send(userAddress, deficit)
    console.log(`✅ Reserve top-up sent! Txid: ${txid}`)

    const response: ClaimResponse = {
      success: true,
      claimed: true,
      deficit: deficit.toString(),
      txid,
      message: `Sent ${deficit} sats to complete your punk reserve!`
    }

    return res.status(200).json(response)

  } catch (error: any) {
    console.error('❌ Error processing reserve claim:', error)
    return res.status(500).json({
      error: 'Failed to process reserve claim',
      details: error.message
    })
  }
}

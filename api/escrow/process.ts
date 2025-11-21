/**
 * Escrow Processor Endpoint
 *
 * GET/POST /api/escrow/process
 *
 * Manually trigger or cron-triggered endpoint to process escrow transactions:
 * - Check for seller deposits
 * - Check for buyer payments
 * - Execute atomic swaps
 *
 * This endpoint can be called by:
 * 1. Vercel Cron (every minute in production)
 * 2. Manual trigger (for testing)
 * 3. GitHub Actions (scheduled workflow)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { processEscrowTransactions } from './_lib/escrowProcessor.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('⚙️ Escrow processor endpoint called')
  console.log('   Method:', req.method)
  console.log('   Time:', new Date().toISOString())
  console.log('   Env check:')
  console.log('     - ESCROW_WALLET_ADDRESS:', process.env.ESCROW_WALLET_ADDRESS ? 'SET ✓' : 'NOT SET ✗')
  console.log('     - ESCROW_WALLET_PRIVATE_KEY:', process.env.ESCROW_WALLET_PRIVATE_KEY ? 'SET ✓' : 'NOT SET ✗')
  console.log('     - VITE_ARKADE_NETWORK:', process.env.VITE_ARKADE_NETWORK || 'testnet (default)')

  // Allow both GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Optional: Add authentication for production
  // const authHeader = req.headers.authorization
  // if (authHeader !== `Bearer ${process.env.ESCROW_PROCESSOR_SECRET}`) {
  //   return res.status(401).json({ error: 'Unauthorized' })
  // }

  try {
    console.log('🚀 Starting escrow transaction processing...')

    const result = await processEscrowTransactions()

    console.log('✅ Processing complete')
    console.log('   Deposits:', result.depositsDetected)
    console.log('   Swaps:', result.swapsExecuted)
    console.log('   Errors:', result.errors.length)

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    })

  } catch (error: any) {
    console.error('❌ Processor endpoint error:', error)
    return res.status(500).json({
      success: false,
      error: 'Processor failed',
      details: error.message,
      timestamp: new Date().toISOString()
    })
  }
}

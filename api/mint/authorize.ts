/**
 * Mint Authorization API
 *
 * This endpoint authorizes new punk mints by:
 * 1. Verifying supply cap hasn't been reached
 * 2. Checking rate limits per user
 * 3. Signing the punk with server's private key (makes it official)
 *
 * The signature proves a punk was minted through the official ArkPunks app.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPublicKey } from 'nostr-tools'
import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

// Server's signing key - MUST be set as environment variable
const SERVER_PRIVATE_KEY = process.env.ARKPUNKS_SERVER_PRIVATE_KEY

// Punk supply configuration
const MAX_TOTAL_PUNKS = 1000
const MAX_MINTS_PER_ADDRESS = 5
const MINT_TIME_WINDOW = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// In-memory storage for rate limiting
// TODO: Replace with persistent storage (Redis, KV) for production
const mintHistory = new Map<string, number[]>()

/**
 * Sign a punk ID with the server's private key
 */
function signPunkId(punkId: string): string {
  if (!SERVER_PRIVATE_KEY) {
    throw new Error('Server private key not configured')
  }

  // Convert hex private key to Uint8Array
  const privKeyBytes = new Uint8Array(
    SERVER_PRIVATE_KEY.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  )

  // Create message to sign: sha256(punkId)
  const messageHash = sha256(punkId)

  // Sign with schnorr (Nostr standard)
  const signature = schnorr.sign(messageHash, privKeyBytes)

  return bytesToHex(signature)
}

/**
 * Check rate limits for a pubkey
 */
function checkRateLimit(pubkey: string): {
  allowed: boolean
  mintsUsed: number
  mintsRemaining: number
} {
  const now = Date.now()
  const cutoff = now - MINT_TIME_WINDOW

  // Get mint history for this pubkey
  const mints = mintHistory.get(pubkey) || []

  // Filter to only recent mints (within time window)
  const recentMints = mints.filter(timestamp => timestamp > cutoff)

  // Update storage
  mintHistory.set(pubkey, recentMints)

  const mintsUsed = recentMints.length
  const mintsRemaining = Math.max(0, MAX_MINTS_PER_ADDRESS - mintsUsed)

  return {
    allowed: mintsRemaining > 0,
    mintsUsed,
    mintsRemaining
  }
}

/**
 * Record a new mint for rate limiting
 */
function recordMint(pubkey: string): void {
  const mints = mintHistory.get(pubkey) || []
  mints.push(Date.now())
  mintHistory.set(pubkey, mints)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('🔐 Mint authorization endpoint called')
  console.log('   Method:', req.method)
  console.log('   Time:', new Date().toISOString())

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check if server key is configured
  if (!SERVER_PRIVATE_KEY) {
    console.error('❌ ARKPUNKS_SERVER_PRIVATE_KEY not configured')
    return res.status(500).json({
      error: 'Server not properly configured',
      details: 'Missing signing key'
    })
  }

  try {
    const { punkId, userPubkey, currentSupply } = req.body

    // Validate required fields
    if (!punkId || !userPubkey) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'userPubkey']
      })
    }

    console.log(`📋 Authorization request:`)
    console.log(`   Punk ID: ${punkId}`)
    console.log(`   User pubkey: ${userPubkey.slice(0, 16)}...`)
    console.log(`   Current supply: ${currentSupply}`)

    // Check 1: Supply cap
    if (currentSupply >= MAX_TOTAL_PUNKS) {
      console.log(`❌ Supply cap reached: ${currentSupply}/${MAX_TOTAL_PUNKS}`)
      return res.status(403).json({
        error: 'Supply cap reached',
        totalMinted: currentSupply,
        maxSupply: MAX_TOTAL_PUNKS
      })
    }

    // Check 2: Rate limits
    const rateCheck = checkRateLimit(userPubkey)
    if (!rateCheck.allowed) {
      console.log(`❌ Rate limit exceeded for ${userPubkey.slice(0, 16)}...`)
      return res.status(429).json({
        error: 'Rate limit exceeded',
        mintsUsed: rateCheck.mintsUsed,
        maxMints: MAX_MINTS_PER_ADDRESS,
        timeWindow: '24 hours'
      })
    }

    console.log(`✅ Rate limit check passed: ${rateCheck.mintsUsed}/${MAX_MINTS_PER_ADDRESS} mints used`)

    // Sign the punk ID
    const signature = signPunkId(punkId)
    console.log(`✅ Punk signed: ${signature.slice(0, 32)}...`)

    // Record this mint for rate limiting
    recordMint(userPubkey)

    // Get server's public key for client verification
    const privKeyBytes = new Uint8Array(
      SERVER_PRIVATE_KEY.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    )
    const serverPubkey = getPublicKey(privKeyBytes)

    return res.status(200).json({
      success: true,
      punkId,
      signature,
      serverPubkey,
      mintIndex: currentSupply,
      mintsRemaining: rateCheck.mintsRemaining - 1,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Mint authorization error:', error)
    return res.status(500).json({
      error: 'Authorization failed',
      details: error.message
    })
  }
}

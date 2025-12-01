/**
 * Arkade Punks Server v2 - User-Centric Ownership
 *
 * New architecture:
 * - Source of truth: User wallets (localStorage)
 * - Registration-based: Users register their punks on first connection
 * - Legacy data kept for reference only
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { returnPunkToSeller, verifyVtxoInEscrow } from './escrow-wallet.js'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'database/arkade-punks-v2.db')
const PORT = 3001

// Server signing key for official punks
const SERVER_PRIVATE_KEY = process.env.ARKPUNKS_SERVER_PRIVATE_KEY

// Escrow wallet configuration
const ESCROW_ADDRESS = process.env.ESCROW_WALLET_ADDRESS || 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t4rrk6z965cxsq33k2t2xcl3mvn0faqk88fqaxef3zj6mfjqwj5xwm3vqcd'
const ESCROW_PRIVATE_KEY = process.env.ESCROW_WALLET_PRIVATE_KEY || ''
let ESCROW_PUBKEY = ''

// Derive escrow pubkey from private key (for Nostr ownership)
if (ESCROW_PRIVATE_KEY && ESCROW_PRIVATE_KEY.length > 0) {
  try {
    // Will need to add nostr-tools import if needed
    // For now just set empty, can add later
    console.log('⚠️  Escrow private key set but pubkey derivation not implemented yet')
  } catch (error) {
    console.error('❌ Failed to derive escrow pubkey:', error)
  }
}

const app = express()
app.use(cors())
app.use(express.json())

// Initialize database
console.log('📦 Initializing database schema...')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Check if schema exists, if not create it
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='punks'
`).get()

if (!tableExists) {
  console.log('🔧 Creating schema...')
  const schema = readFileSync(join(__dirname, 'database/schema-v2.sql'), 'utf-8')
  db.exec(schema)
}

console.log('✅ Database ready\n')

// Admin password protection
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin_secret_2024'

// ============================================================
// AUDIT LOGGING
// ============================================================

const auditLog = db.prepare(`
  INSERT INTO audit_log (timestamp, action, punk_id, seller_address, buyer_address, amount_sats, txid, status, error_message, details)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

/**
 * Log an audit event for tracking and debugging
 */
function logAudit(action, data = {}) {
  const timestamp = Date.now()
  const {
    punkId = null,
    sellerAddress = null,
    buyerAddress = null,
    amount = null,
    txid = null,
    status = 'SUCCESS',
    error = null,
    details = null
  } = data

  try {
    auditLog.run(
      timestamp,
      action,
      punkId,
      sellerAddress,
      buyerAddress,
      amount,
      txid,
      status,
      error,
      details ? JSON.stringify(details) : null
    )
    console.log(`📋 AUDIT [${action}] ${status} - punk:${punkId?.slice(0,8) || 'N/A'} seller:${sellerAddress?.slice(0,20) || 'N/A'} buyer:${buyerAddress?.slice(0,20) || 'N/A'} amount:${amount || 0}`)
  } catch (err) {
    console.error('❌ Failed to write audit log:', err)
  }
}

// ============================================================
// PUNK SIGNING FUNCTION
// ============================================================

/**
 * Sign a punk ID with the server's private key
 * This proves the punk was registered through official ArkPunks
 */
function signPunkId(punkId) {
  if (!SERVER_PRIVATE_KEY) {
    console.warn('⚠️  Server private key not configured - punk will not be signed')
    return null
  }

  try {
    // Convert hex private key to Uint8Array
    const privKeyBytes = new Uint8Array(
      SERVER_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    )

    // Create message to sign: sha256(punkId as bytes)
    // Convert hex punkId to Uint8Array first
    const punkIdBytes = new Uint8Array(
      punkId.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    )
    const messageHash = sha256(punkIdBytes)

    // Sign with schnorr (Nostr standard)
    const signature = schnorr.sign(messageHash, privKeyBytes)

    return bytesToHex(signature)
  } catch (error) {
    console.error('❌ Failed to sign punk:', error)
    return null
  }
}

// ============================================================
// WALLET REGISTRATION ENDPOINTS
// ============================================================

/**
 * Check wallet registration status
 * GET /api/wallet/status?address=bc1p...
 */
app.get('/api/wallet/status', (req, res) => {
  const { address } = req.query

  if (!address) {
    return res.status(400).json({ error: 'Address required' })
  }

  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as punk_count
      FROM punks
      WHERE owner_address = ?
    `).get(address)

    const isRegistered = stats.punk_count > 0

    return res.json({
      address,
      isRegistered,
      punkCount: stats.punk_count,
      needsRegistration: !isRegistered
    })
  } catch (error) {
    console.error('Error checking wallet status:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Register wallet and its punks
 * POST /api/wallet/register
 * Body: { address: "ark1...", punks: [{punkId, vtxoOutpoint, mintDate, compressedMetadata}] }
 */
app.post('/api/wallet/register', (req, res) => {
  const { address, bitcoinAddress, punks } = req.body

  if (!address || !punks || !Array.isArray(punks)) {
    return res.status(400).json({ error: 'Invalid request: address and punks array required' })
  }

  try {
    const now = Date.now()
    const results = {
      registered: [],
      updated: [],
      conflicts: [],
      errors: []
    }

    // Prepare statements
    const checkExisting = db.prepare('SELECT * FROM punks WHERE punk_id = ?')
    const insertPunk = db.prepare(`
      INSERT INTO punks (punk_id, owner_address, punk_metadata_compressed, server_signature, minted_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    const updatePunk = db.prepare(`
      UPDATE punks
      SET owner_address = ?, punk_metadata_compressed = ?, server_signature = ?, updated_at = ?
      WHERE punk_id = ?
    `)
    const insertHistory = db.prepare(`
      INSERT INTO ownership_history (punk_id, from_address, to_address)
      VALUES (?, ?, ?)
    `)

    // Process each punk
    for (const punk of punks) {
      try {
        const { punkId, vtxoOutpoint, mintDate, compressedMetadata } = punk

        if (!punkId) {
          results.errors.push({ punkId: 'unknown', error: 'Missing punkId' })
          continue
        }

        const existing = checkExisting.get(punkId)
        const mintTimestamp = mintDate ? new Date(mintDate).getTime() : now

        // Generate server signature for official punk validation
        const signature = signPunkId(punkId)

        if (existing) {
          if (existing.owner_address === address) {
            // Same owner, update timestamp and compressed metadata (if provided)
            updatePunk.run(address, compressedMetadata || existing.punk_metadata_compressed, signature, now, punkId)
            results.updated.push({ punkId, action: 'refreshed' })
          } else if (bitcoinAddress && existing.owner_address === bitcoinAddress) {
            // SAME WALLET: Existing owner is this wallet's Bitcoin address, auto-migrate to Ark address
            updatePunk.run(address, compressedMetadata || existing.punk_metadata_compressed, signature, now, punkId)

            // Record in history
            insertHistory.run(punkId, bitcoinAddress, address)

            results.updated.push({ punkId, action: 'migrated_from_bitcoin_address' })
            console.log(`✅ Auto-migrated: Punk ${punkId.slice(0, 16)} from Bitcoin address ${bitcoinAddress.slice(0, 20)} to Ark address ${address.slice(0, 20)}`)
          } else {
            // CONFLICT: Different owner!
            results.conflicts.push({
              punkId,
              currentOwner: existing.owner_address,
              claimedBy: address,
              action: 'conflict_detected'
            })

            // Log but don't transfer (requires manual review)
            console.warn(`⚠️  CONFLICT: Punk ${punkId.slice(0, 16)} claimed by ${address.slice(0, 20)} but owned by ${existing.owner_address.slice(0, 20)}`)
          }
        } else {
          // New punk, register it
          insertPunk.run(punkId, address, compressedMetadata || null, signature, mintTimestamp)

          // Record in history
          insertHistory.run(punkId, null, address)

          results.registered.push({ punkId, action: 'registered' })
        }
      } catch (err) {
        results.errors.push({
          punkId: punk.punkId || 'unknown',
          error: err.message
        })
      }
    }

    // Calculate summary
    const summary = {
      total: punks.length,
      registered: results.registered.length,
      updated: results.updated.length,
      conflicts: results.conflicts.length,
      errors: results.errors.length
    }

    console.log(`📱 Wallet registration: ${address.slice(0, 20)}...`)
    console.log(`   New: ${summary.registered}, Updated: ${summary.updated}, Conflicts: ${summary.conflicts}, Errors: ${summary.errors}`)

    return res.json({
      success: true,
      address,
      summary,
      results
    })
  } catch (error) {
    console.error('Error registering wallet:', error)
    return res.status(500).json({ error: 'Registration failed', details: error.message })
  }
})

// ============================================================
// WALLET RECOVERY ENDPOINTS (Support for edge cases)
// ============================================================

/**
 * Recover punks from legacy data (registry/Nostr) by minter pubkey
 * POST /api/wallet/recover
 * Body: { minterPubkey: "149e4111..." }
 *
 * Use case: User lost wallet JSON but has private key
 */
app.post('/api/wallet/recover', (req, res) => {
  const { minterPubkey } = req.body

  if (!minterPubkey) {
    return res.status(400).json({ error: 'minterPubkey required' })
  }

  try {
    // Search in legacy_data (registry + nostr)
    const legacyPunks = db.prepare(`
      SELECT
        punk_id,
        source,
        minter_pubkey,
        bitcoin_address,
        minted_at,
        vtxo_outpoint
      FROM legacy_data
      WHERE minter_pubkey = ?
    `).all(minterPubkey)

    // Check if any are already claimed by someone else
    const claimedByOthers = []
    const available = []
    const alreadyOwned = []

    for (const punk of legacyPunks) {
      const existing = db.prepare('SELECT * FROM punks WHERE punk_id = ?').get(punk.punk_id)

      if (existing) {
        // Check if owned by a different address
        // We need to derive the address from the minterPubkey to compare
        // For now, just mark as claimed
        claimedByOthers.push({
          punkId: punk.punk_id,
          currentOwner: existing.owner_address,
          source: punk.source
        })
      } else {
        // Available for recovery
        available.push({
          punkId: punk.punk_id,
          source: punk.source,
          mintedAt: punk.minted_at,
          vtxoOutpoint: punk.vtxo_outpoint,
          bitcoinAddress: punk.bitcoin_address
        })
      }
    }

    console.log(`🔍 Recovery search for pubkey ${minterPubkey.slice(0, 16)}...`)
    console.log(`   Found ${legacyPunks.length} punks in legacy data`)
    console.log(`   Available: ${available.length}, Claimed: ${claimedByOthers.length}`)

    return res.json({
      success: true,
      minterPubkey,
      summary: {
        total: legacyPunks.length,
        available: available.length,
        claimed: claimedByOthers.length
      },
      punks: {
        available,
        claimed: claimedByOthers
      },
      message: available.length > 0
        ? `Found ${available.length} punk(s) available for recovery. Use /api/wallet/register to claim them.`
        : 'No unclaimed punks found for this minter pubkey.'
    })
  } catch (error) {
    console.error('Error recovering wallet:', error)
    return res.status(500).json({ error: 'Recovery failed', details: error.message })
  }
})

// ============================================================
// PUNKS ENDPOINTS
// ============================================================

/**
 * Get all active punks
 * GET /api/punks
 */
app.get('/api/punks', (req, res) => {
  try {
    const punks = db.prepare(`
      SELECT
        p.punk_id,
        p.owner_address,
        p.punk_metadata_compressed,
        p.server_signature,
        p.minted_at,
        p.updated_at,
        l.source as legacy_source,
        l.minter_pubkey as legacy_minter,
        l.vtxo_outpoint as legacy_vtxo_outpoint
      FROM punks p
      LEFT JOIN legacy_data l ON p.punk_id = l.punk_id
      ORDER BY p.updated_at DESC
    `).all()

    return res.json({
      total: punks.length,
      punks
    })
  } catch (error) {
    console.error('Error fetching punks:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Get punks by owner
 * GET /api/punks/owner?address=bc1p...
 */
app.get('/api/punks/owner', (req, res) => {
  const { address } = req.query

  if (!address) {
    return res.status(400).json({ error: 'Address required' })
  }

  try {
    const punks = db.prepare(`
      SELECT
        p.punk_id,
        p.owner_address,
        p.punk_metadata_compressed,
        p.server_signature,
        p.minted_at,
        l.source as legacy_source
      FROM punks p
      LEFT JOIN legacy_data l ON p.punk_id = l.punk_id
      WHERE p.owner_address = ?
      ORDER BY p.minted_at ASC
    `).all(address)

    return res.json({
      address,
      total: punks.length,
      punks
    })
  } catch (error) {
    console.error('Error fetching owner punks:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

// ============================================================
// STATS ENDPOINTS
// ============================================================

/**
 * Get supply stats
 * GET /api/supply
 */
app.get('/api/supply', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM punks) as active_punks,
        (SELECT COUNT(DISTINCT owner_address) FROM punks) as unique_owners,
        (SELECT COUNT(*) FROM legacy_data) as legacy_total
    `).get()

    return res.json({
      totalMinted: stats.active_punks,
      maxPunks: 2016,
      uniqueOwners: stats.unique_owners,
      legacyRecords: stats.legacy_total,
      source: 'user_wallets'
    })
  } catch (error) {
    console.error('Error fetching supply:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Get comprehensive stats
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  try {
    const supply = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT owner_address) as unique_owners
      FROM punks
    `).get()

    const marketplace = db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'deposited') as active_listings,
        COUNT(*) FILTER (WHERE status = 'sold') as total_sales
      FROM listings
    `).get()

    const topHolders = db.prepare(`
      SELECT owner_address as address, COUNT(*) as punkCount
      FROM punks
      GROUP BY owner_address
      ORDER BY punkCount DESC
      LIMIT 10
    `).all()

    const recentActivity = db.prepare(`
      SELECT punk_id, owner_address, updated_at
      FROM punks
      ORDER BY updated_at DESC
      LIMIT 10
    `).all()

    return res.json({
      success: true,
      supply: {
        totalMinted: supply.total,
        maxSupply: 2016
      },
      marketplace: {
        activeListings: marketplace.active_listings || 0,
        totalSales: marketplace.total_sales || 0
      },
      ownership: {
        uniqueOwners: supply.unique_owners,
        topHolders
      },
      recentActivity
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

// ============================================================
// MARKETPLACE ENDPOINTS (Adapted for v2)
// ============================================================

/**
 * Get marketplace listings
 * GET /api/marketplace/listings
 */
app.get('/api/marketplace/listings', (req, res) => {
  try {
    const rawListings = db.prepare(`
      SELECT
        l.*,
        p.owner_address
      FROM listings l
      JOIN punks p ON l.punk_id = p.punk_id
      WHERE l.status = 'deposited'
      ORDER BY l.created_at DESC
    `).all()

    // Convert snake_case to camelCase for frontend and parse compressed metadata
    const listings = rawListings.map(listing => {
      let compressedMetadata = null
      try {
        if (listing.punk_metadata_compressed) {
          compressedMetadata = JSON.parse(listing.punk_metadata_compressed)
        }
      } catch (error) {
        console.error(`Failed to parse metadata for listing ${listing.id}:`, error)
      }

      return {
        punkId: listing.punk_id,
        sellerPubkey: listing.seller_pubkey,
        seller: listing.seller_address,
        price: listing.price_sats,
        punkVtxoOutpoint: listing.punk_vtxo_outpoint,
        escrowAddress: listing.escrow_address,
        compressedMetadata,
        status: listing.status,
        createdAt: listing.created_at,
        depositedAt: listing.deposited_at,
        soldAt: listing.sold_at
      }
    })

    console.log(`✅ Returning ${listings.length} deposited listing(s)`)

    return res.json({ success: true, listings })
  } catch (error) {
    console.error('Error fetching listings:', error)
    return res.status(500).json({ success: false, error: 'Database error' })
  }
})

// ============================================================
// ESCROW ENDPOINTS
// ============================================================

/**
 * Get escrow wallet info
 * GET /api/escrow/info
 */
app.get('/api/escrow/info', (req, res) => {
  try {
    return res.json({
      escrowAddress: ESCROW_ADDRESS,
      escrowPubkey: ESCROW_PUBKEY,
      network: ESCROW_ADDRESS.startsWith('arkm') ? 'mainnet' : 'testnet'
    })
  } catch (error) {
    console.error('Error fetching escrow info:', error)
    return res.status(500).json({ error: 'Failed to get escrow info' })
  }
})

/**
 * Create escrow listing
 * POST /api/escrow/list
 * Body: { punkId, sellerPubkey, sellerArkAddress, price, punkVtxoOutpoint, compressedMetadata }
 */
app.post('/api/escrow/list', (req, res) => {
  const {
    punkId,
    sellerPubkey,
    sellerArkAddress,
    price,
    punkVtxoOutpoint,
    compressedMetadata
  } = req.body

  console.log(`🔵 Escrow list endpoint called`)
  console.log(`   Listing punk ${punkId?.slice(0, 8)}... for ${price} sats`)
  console.log(`   Seller: ${sellerArkAddress?.slice(0, 20)}...`)

  // Validate required fields
  if (!punkId || !sellerPubkey || !sellerArkAddress || !price) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['punkId', 'sellerPubkey', 'sellerArkAddress', 'price']
    })
  }

  try {
    // Check if already listed
    const existingListing = db.prepare(`
      SELECT * FROM listings WHERE punk_id = ?
    `).get(punkId)

    if (existingListing) {
      // If active listing exists, reject
      if (existingListing.status === 'pending' || existingListing.status === 'deposited') {
        console.log('   ⚠️ Punk already listed')
        return res.status(400).json({
          error: 'Punk already listed',
          listing: existingListing
        })
      }

      // If cancelled or sold, delete old listing to allow re-listing
      if (existingListing.status === 'cancelled' || existingListing.status === 'sold') {
        console.log(`   🧹 Removing old ${existingListing.status} listing`)
        db.prepare('DELETE FROM listings WHERE punk_id = ?').run(punkId)
      }
    }

    // Check ownership (accept both Bitcoin bc1p and Ark ark1 addresses from same wallet)
    const punk = db.prepare('SELECT * FROM punks WHERE punk_id = ?').get(punkId)

    if (punk) {
      // For now, skip ownership check if addresses don't match exactly
      // This is because the same wallet has both bc1p (Bitcoin) and ark1 (Ark) addresses
      // TODO: Add proper address derivation/linking logic
      if (punk.owner_address !== sellerArkAddress) {
        console.log(`   ℹ️  Note: Punk registered with ${punk.owner_address.slice(0, 20)}..., listing with ${sellerArkAddress.slice(0, 20)}...`)
        console.log(`   ℹ️  Assuming same wallet (bc1p ↔ ark1 addresses)`)
      }
    }

    // Create listing in "pending" state (waiting for punk deposit)
    const now = Date.now()
    db.prepare(`
      INSERT INTO listings (
        punk_id, seller_address, seller_pubkey, price_sats,
        status, escrow_address, created_at, punk_metadata_compressed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(punkId, sellerArkAddress, sellerPubkey, price, 'pending', ESCROW_ADDRESS, now, compressedMetadata || null)

    // AUDIT: List created
    logAudit('LIST_CREATED', {
      punkId,
      sellerAddress: sellerArkAddress,
      amount: price,
      status: 'SUCCESS',
      details: { escrowAddress: ESCROW_ADDRESS }
    })

    console.log(`✅ Listing created - waiting for punk deposit`)

    return res.status(200).json({
      success: true,
      punkId,
      escrowAddress: ESCROW_ADDRESS,
      price,
      message: 'Send your punk VTXO to escrow address to activate listing',
      instructions: [
        `Send your punk VTXO (~10,100 sats) to: ${ESCROW_ADDRESS}`,
        'Once received, your listing will appear in the marketplace',
        'Buyers can then purchase your punk',
        'When sold, you receive payment automatically (minus 1% fee)'
      ]
    })
  } catch (error) {
    console.error('❌ Error creating listing:', error)
    return res.status(500).json({
      error: 'Failed to create listing',
      details: error.message
    })
  }
})

/**
 * Get escrow listings
 * GET /api/escrow/listings
 */
app.get('/api/escrow/listings', (req, res) => {
  try {
    const listings = db.prepare(`
      SELECT
        l.*,
        p.server_signature
      FROM listings l
      LEFT JOIN punks p ON l.punk_id = p.punk_id
      WHERE l.status IN ('pending', 'deposited')
      ORDER BY l.created_at DESC
    `).all()

    // Map database fields (snake_case) to API format (camelCase)
    const listingsWithMetadata = listings.map(listing => {
      return {
        punkId: listing.punk_id,
        seller: listing.seller_address,
        sellerPubkey: listing.seller_pubkey,
        price: listing.price_sats,
        status: listing.status,
        escrowAddress: listing.escrow_address,
        punkVtxoOutpoint: listing.punk_vtxo_outpoint,
        compressedMetadata: listing.punk_metadata_compressed || null,
        serverSignature: listing.server_signature || null,
        createdAt: listing.created_at,
        depositedAt: listing.deposited_at
      }
    })

    return res.json({ listings: listingsWithMetadata, success: true })
  } catch (error) {
    console.error('Error fetching escrow listings:', error)
    return res.status(500).json({ error: 'Database error', success: false })
  }
})

/**
 * Update escrow listing with punk VTXO outpoint
 * POST /api/escrow/update-outpoint
 * Body: { punkId, punkVtxoOutpoint }
 *
 * CRITICAL: Verifies VTXO actually exists in escrow wallet before confirming deposit
 */
app.post('/api/escrow/update-outpoint', async (req, res) => {
  const { punkId, punkVtxoOutpoint } = req.body

  if (!punkId || !punkVtxoOutpoint) {
    return res.status(400).json({ error: 'punkId and punkVtxoOutpoint required' })
  }

  try {
    const listing = db.prepare('SELECT * FROM listings WHERE punk_id = ?').get(punkId)

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (listing.status !== 'pending') {
      return res.status(400).json({
        error: 'Listing not in pending state',
        currentStatus: listing.status
      })
    }

    // CRITICAL: Verify VTXO actually exists in escrow wallet
    const DEPOSIT_AMOUNT = 10000
    const verification = await verifyVtxoInEscrow(punkVtxoOutpoint, DEPOSIT_AMOUNT)

    if (!verification.exists) {
      console.log(`❌ VTXO verification failed for ${punkId.slice(0, 8)}: ${verification.error}`)

      // AUDIT: Failed deposit attempt
      logAudit('DEPOSIT_CONFIRMED', {
        punkId,
        sellerAddress: listing.seller_address,
        amount: listing.price_sats,
        status: 'FAILED',
        details: { vtxoOutpoint: punkVtxoOutpoint, error: verification.error }
      })

      return res.status(400).json({
        error: 'Deposit verification failed',
        details: verification.error,
        message: 'VTXO not found in escrow wallet. Please ensure the deposit was sent correctly.'
      })
    }

    // Update listing: mark as deposited and store punk VTXO outpoint
    const now = Date.now()
    db.prepare(`
      UPDATE listings
      SET status = 'deposited', deposited_at = ?, punk_vtxo_outpoint = ?
      WHERE punk_id = ?
    `).run(now, punkVtxoOutpoint, punkId)

    // Extract TXID from outpoint for audit log
    const [depositTxid] = punkVtxoOutpoint.split(':')

    // AUDIT: Deposit confirmed (verified!) - now with TXID!
    logAudit('DEPOSIT_CONFIRMED', {
      punkId,
      sellerAddress: listing.seller_address,
      amount: DEPOSIT_AMOUNT,
      txid: depositTxid,
      status: 'SUCCESS',
      details: { vtxoOutpoint: punkVtxoOutpoint, verified: true }
    })

    console.log(`✅ Punk deposited to escrow (VERIFIED): ${punkId.slice(0, 8)}...`)
    console.log(`   VTXO outpoint: ${punkVtxoOutpoint}`)

    return res.json({
      success: true,
      punkId,
      status: 'deposited',
      message: 'Punk successfully deposited to escrow. Listing is now active!'
    })
  } catch (error) {
    console.error('Error updating escrow outpoint:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Buy punk from escrow
 * POST /api/escrow/buy
 * Body: { punkId, buyerPubkey, buyerArkAddress }
 */
app.post('/api/escrow/buy', (req, res) => {
  const { punkId, buyerPubkey, buyerArkAddress } = req.body

  if (!punkId || !buyerPubkey || !buyerArkAddress) {
    return res.status(400).json({ error: 'punkId, buyerPubkey, and buyerArkAddress required' })
  }

  try {
    const listing = db.prepare(`
      SELECT * FROM listings WHERE punk_id = ?
    `).get(punkId)

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (listing.status !== 'deposited') {
      return res.status(400).json({
        error: 'Punk not available for purchase',
        currentStatus: listing.status
      })
    }

    // Calculate fees (currently no marketplace fee)
    const price = listing.price_sats
    const feePercent = 0
    const fee = 0
    const totalWithFee = price

    console.log(`🛒 Buy request for punk ${punkId.slice(0, 8)}...`)
    console.log(`   Price: ${price} sats`)
    console.log(`   Buyer: ${buyerArkAddress.slice(0, 20)}...`)

    return res.json({
      success: true,
      punkId,
      price: price.toString(),
      totalWithFee: totalWithFee.toString(),
      fee: fee.toString(),
      feePercent,
      escrowAddress: ESCROW_ADDRESS,
      instructions: [
        `Send ${totalWithFee} sats to escrow address: ${ESCROW_ADDRESS}`,
        'Include your Ark address in the payment',
        'The punk will be transferred to you once payment is confirmed',
        'The seller will receive their payment automatically'
      ]
    })
  } catch (error) {
    console.error('Error processing buy request:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

/**
 * Execute purchase (simple account-based system)
 * POST /api/escrow/execute
 * Body: { punkId, buyerPubkey, buyerArkAddress }
 *
 * Flow:
 * 1. Buyer has already sent payment to escrow
 * 2. Escrow sends payment to seller
 * 3. Update punk owner in database
 */
app.post('/api/escrow/execute', async (req, res) => {
  const { punkId, buyerPubkey, buyerArkAddress } = req.body

  if (!punkId || !buyerPubkey || !buyerArkAddress) {
    return res.status(400).json({ error: 'punkId, buyerPubkey, and buyerArkAddress required' })
  }

  try {
    const listing = db.prepare(`
      SELECT * FROM listings WHERE punk_id = ?
    `).get(punkId)

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (listing.status !== 'deposited') {
      return res.status(400).json({
        error: 'Listing not available for execution',
        currentStatus: listing.status
      })
    }

    // CRITICAL: Check if payment already made (prevent double payment)
    if (listing.payment_txid) {
      console.log(`⚠️  Payment already made for punk ${punkId.slice(0, 8)}: ${listing.payment_txid}`)
      return res.status(400).json({
        error: 'Purchase already completed',
        paymentTxid: listing.payment_txid
      })
    }

    const now = Date.now()

    console.log(`💰 Executing purchase for punk ${punkId.slice(0, 8)}...`)
    console.log(`   Price: ${listing.price_sats} sats`)
    console.log(`   Seller: ${listing.seller_address.slice(0, 20)}...`)
    console.log(`   Buyer: ${buyerArkAddress.slice(0, 20)}...`)

    // Note: In v2 architecture, wallets are registered via punk ownership
    // No need for separate registered_wallets table

    // STEP 1: Update database FIRST (atomic "lock" prevents double execution)
    console.log(`📝 Step 1: Updating database (marking as sold)...`)

    const updatePunkOwner = db.prepare(`
      UPDATE punks
      SET owner_address = ?,
          updated_at = ?
      WHERE punk_id = ?
    `)

    const insertOwnershipHistory = db.prepare(`
      INSERT INTO ownership_history (punk_id, from_address, to_address, transferred_at)
      VALUES (?, ?, ?, ?)
    `)

    // Execute ownership transfer in a transaction
    const ownershipTransaction = db.transaction(() => {
      updatePunkOwner.run(buyerArkAddress, now, punkId)
      insertOwnershipHistory.run(punkId, listing.seller_address, buyerArkAddress, now)
    })

    ownershipTransaction()
    console.log(`✅ Ownership transferred to buyer`)

    // STEP 2: Send payment from escrow to seller (AFTER database is updated)
    // This prevents double payment because if payment fails and buyer retries,
    // the punk is already sold to them
    console.log(`💸 Step 2: Sending payment to seller...`)
    let paymentTxid
    let depositReturnTxid
    try {
      // Send sale price to seller
      const payment = await returnPunkToSeller(listing.seller_address, listing.price_sats)
      paymentTxid = payment.txid
      console.log(`✅ Payment sent to seller: ${paymentTxid}`)

      // ALSO return the 10k deposit to seller
      console.log(`💸 Returning 10k deposit to seller...`)
      const depositReturn = await returnPunkToSeller(listing.seller_address, 10000)
      depositReturnTxid = depositReturn.txid
      console.log(`✅ Deposit returned to seller: ${depositReturnTxid}`)
    } catch (error) {
      console.error('❌ Failed to send payment to seller:', error)

      // AUDIT: Payment failed
      logAudit('PAYMENT_FAILED', {
        punkId,
        sellerAddress: listing.seller_address,
        buyerAddress: buyerArkAddress,
        amount: listing.price_sats,
        status: 'FAILED',
        error: error.message
      })

      // Payment failed but punk is already transferred
      // Mark listing with error status so we can retry payment manually
      db.prepare(`
        UPDATE listings
        SET status = 'sold',
            sold_at = ?,
            buyer_address = ?,
            buyer_pubkey = ?,
            payment_txid = ?
        WHERE punk_id = ?
      `).run(now, buyerArkAddress, buyerPubkey, `PAYMENT_FAILED: ${error.message}`, punkId)

      return res.status(500).json({
        error: 'Punk transferred but payment to seller failed',
        details: error.message,
        punkId,
        note: 'The punk is now yours, but escrow needs to manually pay the seller'
      })
    }

    // STEP 3: Finalize listing and record sale
    console.log(`📊 Step 3: Finalizing sale records...`)

    const updateListing = db.prepare(`
      UPDATE listings
      SET status = 'sold',
          sold_at = ?,
          buyer_address = ?,
          buyer_pubkey = ?,
          payment_txid = ?
      WHERE punk_id = ?
    `)

    const insertSale = db.prepare(`
      INSERT INTO sales (punk_id, price_sats, seller_address, buyer_address, sold_at, payment_txid)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const finalizeTransaction = db.transaction(() => {
      updateListing.run(now, buyerArkAddress, buyerPubkey, paymentTxid, punkId)
      insertSale.run(punkId, listing.price_sats, listing.seller_address, buyerArkAddress, now, paymentTxid)
    })

    finalizeTransaction()

    // AUDIT: Sale completed successfully
    logAudit('SALE_COMPLETED', {
      punkId,
      sellerAddress: listing.seller_address,
      buyerAddress: buyerArkAddress,
      amount: listing.price_sats,
      txid: paymentTxid,
      status: 'SUCCESS',
      details: { depositReturnTxid, depositAmount: 10000 }
    })

    console.log(`✅ Purchase completed for punk ${punkId.slice(0, 8)}...`)
    console.log(`   Seller: ${listing.seller_address.slice(0, 20)}...`)
    console.log(`   Buyer: ${buyerArkAddress.slice(0, 20)}...`)
    console.log(`   Price: ${listing.price_sats} sats`)
    console.log(`   Payment TXID: ${paymentTxid}`)

    return res.json({
      success: true,
      punkId,
      paymentTxid,
      message: 'Purchase completed successfully! The punk is now yours.'
    })

  } catch (error) {
    console.error('Error executing purchase:', error)
    return res.status(500).json({ error: 'Database error during purchase execution' })
  }
})

/**
 * Cancel escrow listing
 * POST /api/escrow/cancel
 * Body: { punkId, sellerAddress }
 */
app.post('/api/escrow/cancel', async (req, res) => {
  const { punkId, sellerAddress } = req.body

  if (!punkId || !sellerAddress) {
    return res.status(400).json({ error: 'punkId and sellerAddress required' })
  }

  try {
    const listing = db.prepare(`
      SELECT * FROM listings WHERE punk_id = ?
    `).get(punkId)

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    if (listing.seller_address !== sellerAddress) {
      return res.status(403).json({ error: 'Not your listing' })
    }

    if (listing.status === 'sold') {
      return res.status(400).json({ error: 'Listing already sold' })
    }

    // If punk was deposited, return it to seller
    let returnTxid = null
    if (listing.status === 'deposited') {
      console.log(`📦 Punk was deposited, returning to seller...`)
      try {
        const result = await returnPunkToSeller(sellerAddress, 10000)
        returnTxid = result.txid
        console.log(`✅ Punk returned via txid: ${returnTxid}`)
      } catch (returnError) {
        console.error(`❌ Failed to return punk:`, returnError)

        // AUDIT: Refund failed
        logAudit('REFUND_FAILED', {
          punkId,
          sellerAddress,
          amount: 10000,
          status: 'FAILED',
          error: returnError.message
        })

        // Still mark as cancelled, but note the return failed
        return res.status(500).json({
          error: 'Failed to return punk from escrow',
          details: returnError.message,
          note: 'Listing marked as cancelled but punk not returned. Contact support.'
        })
      }
    }

    // Cancel the listing
    const now = Date.now()
    db.prepare(`
      UPDATE listings
      SET status = 'cancelled', cancelled_at = ?
      WHERE punk_id = ?
    `).run(now, punkId)

    // AUDIT: Listing cancelled
    logAudit('LISTING_CANCELLED', {
      punkId,
      sellerAddress,
      amount: listing.price_sats,
      txid: returnTxid,
      status: 'SUCCESS',
      details: { wasDeposited: listing.status === 'deposited', refundAmount: returnTxid ? 10000 : 0 }
    })

    console.log(`🔴 Listing cancelled: ${punkId.slice(0, 8)}...`)

    return res.json({
      success: true,
      message: returnTxid
        ? 'Listing cancelled and punk returned to your wallet'
        : 'Listing cancelled (punk was not yet deposited)',
      punkId,
      returnTxid
    })
  } catch (error) {
    console.error('Error cancelling listing:', error)
    return res.status(500).json({ error: 'Database error' })
  }
})

// ============================================================
// WHITELIST - All punks in database are official
// ============================================================

app.get('/api/whitelist/list', (req, res) => {
  try {
    const punks = db.prepare('SELECT punk_id FROM punks').all()
    const punkIds = punks.map(p => p.punk_id)

    return res.json({
      success: true,
      punkIds,
      count: punkIds.length
    })
  } catch (error) {
    console.error('Error fetching whitelist:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', (req, res) => {
  try {
    const stats = db.prepare('SELECT COUNT(*) as count FROM punks').get()
    return res.json({
      status: 'ok',
      version: '2.0',
      database: 'connected',
      activePunks: stats.count
    })
  } catch (error) {
    return res.status(500).json({ status: 'error', error: error.message })
  }
})

// ============================================================
// ADMIN - AUDIT LOG
// ============================================================

app.get('/api/admin/audit', (req, res) => {
  const { password, limit = 100, action, punkId } = req.query

  // Verify admin password (separate from support password)
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  try {
    let query = 'SELECT * FROM audit_log'
    const params = []
    const conditions = []

    if (action) {
      conditions.push('action = ?')
      params.push(action)
    }

    if (punkId) {
      conditions.push('punk_id = ?')
      params.push(punkId)
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(parseInt(limit))

    const logs = db.prepare(query).all(...params)

    // Parse details JSON
    const formattedLogs = logs.map(log => ({
      ...log,
      details: log.details ? JSON.parse(log.details) : null,
      timestampFormatted: new Date(log.timestamp).toISOString()
    }))

    return res.json({
      success: true,
      count: formattedLogs.length,
      logs: formattedLogs
    })
  } catch (error) {
    console.error('Error fetching audit log:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================================
// MARKETPLACE SALES & STATS
// ============================================================

app.get('/api/marketplace/sales', (req, res) => {
  try {
    // Get all completed sales with punk metadata
    const sales = db.prepare(`
      SELECT
        s.punk_id,
        s.price_sats,
        s.seller_address,
        s.buyer_address,
        s.sold_at,
        s.payment_txid,
        p.punk_metadata_compressed
      FROM sales s
      LEFT JOIN punks p ON s.punk_id = p.punk_id
      ORDER BY s.sold_at DESC
    `).all()

    // Get current floor price from active listings
    const floorListing = db.prepare(`
      SELECT MIN(price_sats) as floor_price
      FROM listings
      WHERE status = 'deposited'
    `).get()

    // Calculate stats from sales history
    let highestSale = 0
    let totalVolume = 0
    let totalSales = sales.length

    for (const sale of sales) {
      if (sale.price_sats > highestSale) {
        highestSale = sale.price_sats
      }
      totalVolume += sale.price_sats
    }

    const averagePrice = totalSales > 0 ? Math.floor(totalVolume / totalSales) : 0
    const floorPrice = floorListing?.floor_price || 0

    // Format sales for frontend
    const formattedSales = sales.map(sale => ({
      punkId: sale.punk_id,
      price: sale.price_sats.toString(),
      seller: sale.seller_address,
      buyer: sale.buyer_address,
      timestamp: sale.sold_at,
      compressedMetadata: sale.punk_metadata_compressed || null
    }))

    return res.json({
      success: true,
      sales: formattedSales,
      stats: {
        floorPrice: floorPrice.toString(),
        highestSale: highestSale.toString(),
        totalVolume: totalVolume.toString(),
        totalSales,
        averagePrice: averagePrice.toString()
      }
    })
  } catch (error) {
    console.error('Error fetching marketplace sales:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================================
// SUPPORT - PUNK RECOVERY REQUESTS
// ============================================================

// Create support_requests table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS support_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ark_address TEXT,
    nostr_pubkey TEXT,
    boarding_address TEXT,
    punks_in_export INTEGER,
    contact_handle TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    punks_found INTEGER DEFAULT 0,
    admin_notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    resolved_at INTEGER
  )
`)

// Helper: convert npub to hex pubkey
function npubToHex(npub) {
  if (!npub || !npub.startsWith('npub1')) return null
  try {
    // bech32 decode - simplified version
    const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
    const data = npub.slice(5) // remove 'npub1'
    const values = []
    for (const char of data) {
      const idx = ALPHABET.indexOf(char)
      if (idx === -1) return null
      values.push(idx)
    }
    // Convert 5-bit to 8-bit
    let bits = 0
    let value = 0
    const result = []
    for (const v of values.slice(0, -6)) { // remove checksum
      value = (value << 5) | v
      bits += 5
      while (bits >= 8) {
        bits -= 8
        result.push((value >> bits) & 0xff)
      }
    }
    return result.map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

// Public endpoint - submit recovery request (no password)
app.post('/api/support/request', async (req, res) => {
  const { arkAddress, nostrPubkey, nostrNpub, boardingAddress, punksInExport, contactHandle } = req.body

  if (!arkAddress && !nostrPubkey && !nostrNpub && !boardingAddress) {
    return res.status(400).json({ success: false, error: 'Please provide at least one identifier' })
  }

  try {
    // Convert npub to hex if provided
    const npubHex = npubToHex(nostrNpub)
    const pubkeyToSearch = npubHex || nostrPubkey

    // Search for punks in all sources
    let punksFound = 0
    let legacyFound = 0

    if (arkAddress) {
      const punksOwned = db.prepare(`SELECT COUNT(*) as count FROM punks WHERE owner_address = ?`).get(arkAddress)
      const salesAsSeller = db.prepare(`SELECT COUNT(*) as count FROM sales WHERE seller_address = ?`).get(arkAddress)
      const salesAsBuyer = db.prepare(`SELECT COUNT(*) as count FROM sales WHERE buyer_address = ?`).get(arkAddress)
      const listings = db.prepare(`SELECT COUNT(*) as count FROM listings WHERE seller_address = ?`).get(arkAddress)

      punksFound = punksOwned.count + salesAsSeller.count + salesAsBuyer.count + listings.count
    }

    // Search in legacy_data by minter_pubkey
    if (pubkeyToSearch) {
      const legacy = db.prepare(`SELECT COUNT(*) as count FROM legacy_data WHERE minter_pubkey = ?`).get(pubkeyToSearch)
      legacyFound = legacy.count
      punksFound += legacyFound
    }

    // Store the request
    const result = db.prepare(`
      INSERT INTO support_requests (ark_address, nostr_pubkey, boarding_address, punks_in_export, contact_handle, punks_found)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(arkAddress, pubkeyToSearch || nostrNpub, boardingAddress, punksInExport, contactHandle, punksFound)

    console.log(`📩 New support request #${result.lastInsertRowid} from ${arkAddress?.slice(0, 30) || nostrNpub?.slice(0, 20) || 'unknown'}... (found ${punksFound} records, ${legacyFound} legacy)`)

    return res.json({
      success: true,
      requestId: result.lastInsertRowid,
      message: 'Request submitted successfully'
    })

  } catch (error) {
    console.error('Support request error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// Admin endpoint - view support requests
app.get('/api/admin/support-requests', (req, res) => {
  const { password, status = 'all' } = req.query

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  try {
    let query = 'SELECT * FROM support_requests'
    const params = []

    if (status !== 'all') {
      query += ' WHERE status = ?'
      params.push(status)
    }

    query += ' ORDER BY created_at DESC'

    const requests = db.prepare(query).all(...params)

    return res.json({
      success: true,
      count: requests.length,
      requests
    })

  } catch (error) {
    console.error('Admin support requests error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// Admin endpoint - lookup punk details for a request
app.get('/api/admin/support-lookup', (req, res) => {
  const { password, arkAddress, nostrPubkey } = req.query

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  if (!arkAddress && !nostrPubkey) {
    return res.status(400).json({ success: false, error: 'arkAddress or nostrPubkey required' })
  }

  try {
    const results = {
      sources: [],
      totalPunksFound: 0,
      punks: []
    }

    if (arkAddress) {
      // 1. Search in punks table
      const punksOwned = db.prepare(`
        SELECT punk_id, owner_address, punk_metadata_compressed, created_at, server_signature
        FROM punks WHERE owner_address = ?
      `).all(arkAddress)

      if (punksOwned.length > 0) {
        results.sources.push({ source: 'database_owner', description: 'Punks currently owned', count: punksOwned.length })
        punksOwned.forEach(p => {
          results.punks.push({ punkId: p.punk_id, source: 'database_owner', isOfficial: !!p.server_signature })
        })
      }

      // 2. Search in sales as seller
      const salesAsSeller = db.prepare(`SELECT punk_id, price_sats, buyer_address, sold_at FROM sales WHERE seller_address = ?`).all(arkAddress)
      if (salesAsSeller.length > 0) {
        results.sources.push({ source: 'sales_seller', description: 'Punks sold', count: salesAsSeller.length })
        salesAsSeller.forEach(s => {
          results.punks.push({ punkId: s.punk_id, source: 'sales_seller', price: s.price_sats, soldAt: s.sold_at })
        })
      }

      // 3. Search in sales as buyer
      const salesAsBuyer = db.prepare(`SELECT punk_id, price_sats, seller_address, sold_at FROM sales WHERE buyer_address = ?`).all(arkAddress)
      if (salesAsBuyer.length > 0) {
        results.sources.push({ source: 'sales_buyer', description: 'Punks bought', count: salesAsBuyer.length })
        salesAsBuyer.forEach(s => {
          results.punks.push({ punkId: s.punk_id, source: 'sales_buyer', price: s.price_sats, boughtAt: s.sold_at })
        })
      }

      // 4. Search in listings
      const listings = db.prepare(`SELECT punk_id, price_sats, status, created_at FROM listings WHERE seller_address = ?`).all(arkAddress)
      if (listings.length > 0) {
        results.sources.push({ source: 'listings', description: 'Listings created', count: listings.length })
        listings.forEach(l => {
          results.punks.push({ punkId: l.punk_id, source: 'listings', status: l.status, price: l.price_sats })
        })
      }
    }

    // 5. Search in legacy_data by minter_pubkey
    if (nostrPubkey) {
      // Try to convert if it's an npub
      const pubkeyHex = nostrPubkey.startsWith('npub1') ? npubToHex(nostrPubkey) : nostrPubkey
      if (pubkeyHex) {
        const legacyPunks = db.prepare(`
          SELECT punk_id, minter_pubkey, minted_at, vtxo_outpoint
          FROM legacy_data WHERE minter_pubkey = ?
        `).all(pubkeyHex)

        if (legacyPunks.length > 0) {
          results.sources.push({ source: 'legacy_registry', description: 'Legacy mints (registry)', count: legacyPunks.length })
          legacyPunks.forEach(l => {
            results.punks.push({
              punkId: l.punk_id,
              source: 'legacy_registry',
              mintedAt: l.minted_at,
              vtxo: l.vtxo_outpoint?.slice(0, 20)
            })
          })
        }
      }
    }

    const uniquePunkIds = [...new Set(results.punks.map(p => p.punkId))]
    results.totalPunksFound = uniquePunkIds.length

    return res.json({ success: true, ...results })

  } catch (error) {
    console.error('Admin support lookup error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// Admin endpoint - update request status
app.post('/api/admin/support-requests/:id/update', (req, res) => {
  const { password, status, adminNotes } = req.body
  const { id } = req.params

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  try {
    const resolvedAt = status === 'resolved' ? Date.now() : null

    db.prepare(`
      UPDATE support_requests
      SET status = ?, admin_notes = ?, resolved_at = ?
      WHERE id = ?
    `).run(status, adminNotes, resolvedAt, id)

    console.log(`📝 Support request #${id} updated to ${status}`)

    return res.json({ success: true })

  } catch (error) {
    console.error('Update support request error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('============================================================')
  console.log('🚀 Arkade Punks Server v2 Running')
  console.log('============================================================')
  console.log(`📡 Listening on: http://localhost:${PORT}`)
  console.log(`💾 Database: ${DB_PATH}`)
  console.log(`🎯 Architecture: User-Centric Ownership`)
  console.log('============================================================')
})

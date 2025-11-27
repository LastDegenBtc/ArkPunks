/**
 * Arkade Punks Local Server
 *
 * Simple, fast, reliable marketplace backend using SQLite.
 * Replaces unreliable Vercel Blob with ACID transactions.
 */

import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

// Initialize Express
const app = express()
app.use(cors())
app.use(express.json())

// Initialize SQLite database
const db = new Database(join(__dirname, 'database', 'arkade-punks.db'))

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

console.log('📦 Initializing database schema...')

// Load and execute schema
const schema = readFileSync(join(__dirname, 'database', 'schema.sql'), 'utf-8')
db.exec(schema)

console.log('✅ Database ready')

// =============================================================================
// PUNK OWNERSHIP API
// =============================================================================

/**
 * GET /api/ownership/get?punkId=...
 * Get owner of a specific punk
 * Returns minter_pubkey (Nostr) as authoritative owner
 */
app.get('/api/ownership/get', (req, res) => {
  try {
    const { punkId } = req.query

    if (!punkId) {
      return res.status(400).json({ error: 'Missing punkId parameter' })
    }

    const punk = db.prepare(`
      SELECT minter_pubkey, owner_address, bitcoin_address
      FROM punks
      WHERE punk_id = ?
    `).get(punkId)

    if (!punk) {
      return res.status(404).json({ error: 'Punk not found', punkId })
    }

    return res.json({
      punkId,
      minterPubkey: punk.minter_pubkey,      // Nostr pubkey (source of truth)
      ownerAddress: punk.owner_address,      // ark1... (cached/derived)
      bitcoinAddress: punk.bitcoin_address,  // bc1p... (from mint event)
      // Legacy field for backward compatibility
      owner: punk.minter_pubkey
    })
  } catch (error) {
    console.error('Error getting punk owner:', error)
    return res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

/**
 * GET /api/ownership/all
 * Get all punk ownership (for migration/backup)
 * Uses minter_pubkey as authoritative owner
 */
app.get('/api/ownership/all', (req, res) => {
  try {
    const punks = db.prepare(`
      SELECT punk_id, minter_pubkey, owner_address, bitcoin_address
      FROM punks
    `).all()

    // Build ownership maps
    const byMinterPubkey = {}  // Nostr pubkey (source of truth)
    const byOwnerAddress = {}  // ark1... (cached)
    const byBitcoinAddress = {} // bc1p... (from mint)

    for (const punk of punks) {
      byMinterPubkey[punk.punk_id] = punk.minter_pubkey
      if (punk.owner_address) {
        byOwnerAddress[punk.punk_id] = punk.owner_address
      }
      if (punk.bitcoin_address) {
        byBitcoinAddress[punk.punk_id] = punk.bitcoin_address
      }
    }

    return res.json({
      success: true,
      count: punks.length,
      ownership: byMinterPubkey,  // Default to Nostr pubkey
      ownershipByNostrPubkey: byMinterPubkey,
      ownershipByArkAddress: byOwnerAddress,
      ownershipByBitcoinAddress: byBitcoinAddress
    })
  } catch (error) {
    console.error('Error getting all ownership:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================================================
// MARKETPLACE API
// =============================================================================

/**
 * GET /api/marketplace/listings
 * Get all active listings (pending or deposited)
 */
app.get('/api/marketplace/listings', (req, res) => {
  try {
    const listings = db.prepare(`
      SELECT
        l.*,
        p.compressed_metadata,
        p.vtxo_outpoint
      FROM listings l
      JOIN punks p ON l.punk_id = p.punk_id
      WHERE l.status IN ('pending', 'deposited')
      ORDER BY l.created_at DESC
    `).all()

    return res.json({
      success: true,
      listings: listings.map(l => ({
        punkId: l.punk_id,
        price: String(l.price_sats),
        seller: l.seller_address,
        sellerPubkey: l.seller_pubkey,
        escrowAddress: l.escrow_address,
        status: l.status,
        createdAt: l.created_at,
        depositedAt: l.deposited_at,
        compressedMetadata: l.compressed_metadata,
        punkVtxoOutpoint: l.vtxo_outpoint
      }))
    })
  } catch (error) {
    console.error('Error getting listings:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/marketplace/list
 * Create a new marketplace listing
 */
app.post('/api/marketplace/list', (req, res) => {
  try {
    const {
      punkId,
      sellerAddress,
      sellerPubkey,
      priceSats,
      escrowAddress
    } = req.body

    // Validate required fields
    if (!punkId || !sellerAddress || !sellerPubkey || !priceSats || !escrowAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'sellerAddress', 'sellerPubkey', 'priceSats', 'escrowAddress']
      })
    }

    // Verify punk exists and seller owns it
    const punk = db.prepare('SELECT owner_address FROM punks WHERE punk_id = ?').get(punkId)

    if (!punk) {
      return res.status(404).json({ error: 'Punk not found' })
    }

    if (punk.owner_address !== sellerAddress) {
      return res.status(403).json({ error: 'You do not own this punk' })
    }

    // Check if already listed
    const existing = db.prepare('SELECT status FROM listings WHERE punk_id = ?').get(punkId)

    if (existing && (existing.status === 'pending' || existing.status === 'deposited')) {
      return res.status(400).json({ error: 'Punk already listed' })
    }

    // Create listing - ATOMIC operation, no race conditions!
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO listings (
        punk_id, seller_address, seller_pubkey, price_sats, status, escrow_address
      ) VALUES (?, ?, ?, ?, 'pending', ?)
    `)

    stmt.run(punkId, sellerAddress, sellerPubkey, priceSats, escrowAddress)

    console.log(`✅ Listed: ${punkId.slice(0, 8)}... for ${priceSats} sats`)

    return res.json({
      success: true,
      punkId,
      price: priceSats,
      status: 'pending',
      escrowAddress
    })

  } catch (error) {
    console.error('Error creating listing:', error)
    return res.status(500).json({ error: 'Failed to create listing', details: error.message })
  }
})

/**
 * POST /api/marketplace/cancel
 * Cancel a marketplace listing
 */
app.post('/api/marketplace/cancel', (req, res) => {
  try {
    const { punkId, sellerAddress } = req.body

    if (!punkId || !sellerAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'sellerAddress']
      })
    }

    // Cancel listing - ATOMIC operation, no race conditions!
    const stmt = db.prepare(`
      UPDATE listings
      SET status = 'cancelled', cancelled_at = unixepoch() * 1000
      WHERE punk_id = ? AND seller_address = ? AND status IN ('pending', 'deposited')
    `)

    const result = stmt.run(punkId, sellerAddress)

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Listing not found or already cancelled/sold' })
    }

    console.log(`✅ Cancelled: ${punkId.slice(0, 8)}...`)

    return res.json({
      success: true,
      punkId,
      status: 'cancelled'
    })

  } catch (error) {
    console.error('Error cancelling listing:', error)
    return res.status(500).json({ error: 'Failed to cancel listing', details: error.message })
  }
})

/**
 * POST /api/marketplace/update-status
 * Update listing status (deposited, sold, etc.)
 */
app.post('/api/marketplace/update-status', (req, res) => {
  try {
    const { punkId, status, updates } = req.body

    if (!punkId || !status) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['punkId', 'status']
      })
    }

    const validStatuses = ['pending', 'deposited', 'sold', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    // Build update query
    const fields = ['status = ?']
    const values = [status]

    if (status === 'deposited') {
      fields.push('deposited_at = ?')
      values.push(Date.now())
    } else if (status === 'sold') {
      fields.push('sold_at = ?')
      values.push(Date.now())
    } else if (status === 'cancelled') {
      fields.push('cancelled_at = ?')
      values.push(Date.now())
    }

    // Add optional updates
    if (updates) {
      if (updates.buyerAddress) {
        fields.push('buyer_address = ?')
        values.push(updates.buyerAddress)
      }
      if (updates.buyerPubkey) {
        fields.push('buyer_pubkey = ?')
        values.push(updates.buyerPubkey)
      }
      if (updates.punkTransferTxid) {
        fields.push('punk_transfer_txid = ?')
        values.push(updates.punkTransferTxid)
      }
      if (updates.paymentTxid) {
        fields.push('payment_txid = ?')
        values.push(updates.paymentTxid)
      }
    }

    values.push(punkId)

    const stmt = db.prepare(`
      UPDATE listings
      SET ${fields.join(', ')}
      WHERE punk_id = ?
    `)

    const result = stmt.run(...values)

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Listing not found' })
    }

    // If sold, update punk ownership and add to sales history
    if (status === 'sold' && updates?.buyerAddress) {
      const updateOwner = db.prepare(`
        UPDATE punks
        SET owner_address = ?, updated_at = ?
        WHERE punk_id = ?
      `)
      updateOwner.run(updates.buyerAddress, Date.now(), punkId)

      // Add to sales history
      const listing = db.prepare('SELECT * FROM listings WHERE punk_id = ?').get(punkId)
      const punk = db.prepare('SELECT compressed_metadata FROM punks WHERE punk_id = ?').get(punkId)

      db.prepare(`
        INSERT INTO sales (
          punk_id, price_sats, seller_address, buyer_address, sold_at,
          punk_transfer_txid, payment_txid, compressed_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        punkId,
        listing.price_sats,
        listing.seller_address,
        updates.buyerAddress,
        Date.now(),
        updates.punkTransferTxid,
        updates.paymentTxid,
        punk.compressed_metadata
      )

      console.log(`✅ Sold: ${punkId.slice(0, 8)}... to ${updates.buyerAddress.slice(0, 20)}...`)
    }

    return res.json({
      success: true,
      punkId,
      status
    })

  } catch (error) {
    console.error('Error updating listing status:', error)
    return res.status(500).json({ error: 'Failed to update listing', details: error.message })
  }
})

/**
 * GET /api/marketplace/sales
 * Get sales history and stats
 */
app.get('/api/marketplace/sales', (req, res) => {
  try {
    const sales = db.prepare(`
      SELECT * FROM sales
      ORDER BY sold_at DESC
      LIMIT 100
    `).all()

    // Calculate stats
    const totalSales = sales.length
    const totalVolume = sales.reduce((sum, s) => sum + s.price_sats, 0)
    const avgPrice = totalSales > 0 ? Math.floor(totalVolume / totalSales) : 0
    const floorPrice = sales.length > 0 ? Math.min(...sales.map(s => s.price_sats)) : 0

    return res.json({
      success: true,
      sales: sales.map(s => ({
        punkId: s.punk_id,
        price: String(s.price_sats),
        seller: s.seller_address,
        buyer: s.buyer_address,
        timestamp: s.sold_at,
        compressedMetadata: s.compressed_metadata
      })),
      stats: {
        totalSales,
        totalVolume: String(totalVolume),
        avgPrice: String(avgPrice),
        floorPrice: String(floorPrice)
      }
    })

  } catch (error) {
    console.error('Error getting sales:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// =============================================================================
// UTILITY ENDPOINTS
// =============================================================================

/**
 * GET /api/supply
 * Get punk supply information
 * Compatible with existing Vercel /api/supply endpoint
 */
app.get('/api/supply', (req, res) => {
  try {
    const totalMinted = db.prepare('SELECT COUNT(*) as count FROM punks').get().count
    const maxPunks = 2016 // Total supply cap

    return res.json({
      totalMinted,
      maxPunks,
      cached: false,
      cacheAge: 0,
      source: 'sqlite'
    })
  } catch (error) {
    console.error('Error getting supply:', error)
    return res.status(500).json({
      error: 'Failed to fetch supply',
      details: error.message,
      totalMinted: 0,
      maxPunks: 2016
    })
  }
})

/**
 * GET /api/stats
 * General statistics including ownership breakdown
 */
app.get('/api/stats', (req, res) => {
  try {
    const totalPunks = db.prepare('SELECT COUNT(*) as count FROM punks').get().count
    const activeListings = db.prepare('SELECT COUNT(*) as count FROM listings WHERE status IN (\'pending\', \'deposited\')').get().count
    const totalSales = db.prepare('SELECT COUNT(*) as count FROM sales').get().count

    // Get unique owners count
    const uniqueOwners = db.prepare('SELECT COUNT(DISTINCT owner_address) as count FROM punks').get().count

    // Get top holders (top 10 owners by punk count)
    const topHolders = db.prepare(`
      SELECT owner_address, COUNT(*) as punk_count
      FROM punks
      GROUP BY owner_address
      ORDER BY punk_count DESC
      LIMIT 10
    `).all()

    return res.json({
      success: true,
      supply: {
        totalMinted: totalPunks,
        maxSupply: 2016
      },
      marketplace: {
        activeListings,
        totalSales
      },
      ownership: {
        uniqueOwners,
        topHolders: topHolders.map(h => ({
          address: h.owner_address,
          punkCount: h.punk_count
        }))
      }
    })
  } catch (error) {
    console.error('Error getting stats:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /health
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' })
})

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 Arkade Punks Server Running')
  console.log('='.repeat(60))
  console.log(`📡 Listening on: http://localhost:${PORT}`)
  console.log(`💾 Database: ${join(__dirname, 'database', 'arkade-punks.db')}`)
  console.log('='.repeat(60) + '\n')
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...')
  db.close()
  process.exit(0)
})

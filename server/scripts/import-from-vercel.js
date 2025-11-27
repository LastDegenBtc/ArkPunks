/**
 * Import data from Vercel Blob to local SQLite database
 *
 * Usage:
 *   node scripts/import-from-vercel.js https://your-vercel-app.vercel.app
 *   OR
 *   node scripts/import-from-vercel.js ../data-export  (use local exported JSON files)
 */

import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../database/arkade-punks.db')

const source = process.argv[2]

if (!source) {
  console.error('❌ Usage: node scripts/import-from-vercel.js <vercel-url|data-dir>')
  console.error('   Examples:')
  console.error('     node scripts/import-from-vercel.js https://arkade-punks.vercel.app')
  console.error('     node scripts/import-from-vercel.js ../data-export')
  process.exit(1)
}

async function importFromAPI(apiUrl) {
  console.log(`📡 Fetching data from: ${apiUrl}`)

  try {
    // Fetch ownership data
    console.log('   Fetching ownership table...')
    const ownershipRes = await fetch(`${apiUrl}/api/export-all`)

    if (!ownershipRes.ok) {
      throw new Error(`HTTP ${ownershipRes.status}: ${ownershipRes.statusText}`)
    }

    const data = await ownershipRes.json()

    return {
      ownership: data.data['punk-ownership.json']?.ownership || {},
      listings: data.data['escrow-listings.json']?.listings || {},
      registry: data.data['punk-registry.json']?.entries || []
    }

  } catch (error) {
    console.error(`❌ Failed to fetch from API: ${error.message}`)
    throw error
  }
}

function importFromFiles(dataDir) {
  console.log(`📁 Reading data from: ${dataDir}`)

  const ownershipPath = join(dataDir, 'ownership.json')
  const listingsPath = join(dataDir, 'listings.json')
  const registryPath = join(dataDir, 'registry.json')

  const ownership = existsSync(ownershipPath)
    ? JSON.parse(readFileSync(ownershipPath, 'utf-8')).ownership || {}
    : {}

  const listings = existsSync(listingsPath)
    ? JSON.parse(readFileSync(listingsPath, 'utf-8')).listings || {}
    : {}

  const registry = existsSync(registryPath)
    ? JSON.parse(readFileSync(registryPath, 'utf-8')).entries || []
    : []

  return { ownership, listings, registry }
}

async function main() {
  console.log('🚀 Starting data import...\n')

  // Load data from source
  let data
  if (source.startsWith('http://') || source.startsWith('https://')) {
    data = await importFromAPI(source)
  } else {
    data = importFromFiles(source)
  }

  const { ownership, listings, registry } = data

  console.log('\n📊 Data loaded:')
  console.log(`   Ownership: ${Object.keys(ownership).length} punks`)
  console.log(`   Listings: ${Object.keys(listings).length} active listings`)
  console.log(`   Registry: ${registry.length} total minted`)

  // Open database
  console.log(`\n💾 Opening database: ${DB_PATH}`)
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // Import punks (from registry + ownership)
  console.log('\n📦 Importing punks...')

  const insertPunk = db.prepare(`
    INSERT OR REPLACE INTO punks (
      punk_id, owner_address, minted_at, minter_pubkey, compressed_metadata, vtxo_outpoint
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)

  let punkCount = 0

  // First, import from registry (has mint data)
  for (const entry of registry) {
    const owner = ownership[entry.punkId] || 'unknown'

    insertPunk.run(
      entry.punkId,
      owner,
      entry.mintedAt || Date.now(),
      entry.minterPubkey || null,
      null, // compressed_metadata will be added later
      entry.vtxo || null
    )

    punkCount++
  }

  // Then, add any punks that are in ownership but not in registry
  for (const [punkId, owner] of Object.entries(ownership)) {
    const exists = db.prepare('SELECT 1 FROM punks WHERE punk_id = ?').get(punkId)

    if (!exists) {
      insertPunk.run(
        punkId,
        owner,
        Date.now(),
        null,
        null,
        null
      )
      punkCount++
    }
  }

  console.log(`   ✅ Imported ${punkCount} punks`)

  // Import active listings
  console.log('\n📋 Importing listings...')

  const insertListing = db.prepare(`
    INSERT OR REPLACE INTO listings (
      punk_id, seller_address, seller_pubkey, price_sats, status, escrow_address,
      created_at, deposited_at, sold_at, buyer_address, punk_transfer_txid, payment_txid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let listingCount = 0
  let skippedListings = 0

  for (const [punkId, listing] of Object.entries(listings)) {
    // Check if punk exists (foreign key constraint)
    const punkExists = db.prepare('SELECT 1 FROM punks WHERE punk_id = ?').get(punkId)

    if (!punkExists) {
      console.warn(`   ⚠️  Skipping listing for non-existent punk: ${punkId.slice(0, 16)}...`)
      skippedListings++
      continue
    }

    insertListing.run(
      punkId,
      listing.sellerArkAddress,
      listing.sellerPubkey,
      parseInt(listing.price),
      listing.status,
      listing.escrowAddress,
      listing.createdAt,
      listing.depositedAt || null,
      listing.soldAt || null,
      listing.buyerAddress || null,
      listing.punkTransferTxid || null,
      listing.paymentTxid || null
    )

    // Update compressed metadata if available
    if (listing.compressedMetadata) {
      db.prepare('UPDATE punks SET compressed_metadata = ? WHERE punk_id = ?')
        .run(listing.compressedMetadata, punkId)
    }

    listingCount++
  }

  if (skippedListings > 0) {
    console.warn(`   ⚠️  Skipped ${skippedListings} listing(s) (punks not in database)`)
  }

  console.log(`   ✅ Imported ${listingCount} listings`)

  // Import sold listings to sales history
  console.log('\n📈 Importing sales history...')

  const soldListings = Object.values(listings).filter(l => l.status === 'sold')

  const insertSale = db.prepare(`
    INSERT INTO sales (
      punk_id, price_sats, seller_address, buyer_address, sold_at,
      punk_transfer_txid, payment_txid, compressed_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let salesCount = 0

  for (const listing of soldListings) {
    if (!listing.buyerAddress || !listing.soldAt) continue

    insertSale.run(
      listing.punkId,
      parseInt(listing.price),
      listing.sellerArkAddress,
      listing.buyerAddress,
      listing.soldAt,
      listing.punkTransferTxid || null,
      listing.paymentTxid || null,
      listing.compressedMetadata || null
    )

    salesCount++
  }

  console.log(`   ✅ Imported ${salesCount} sales`)

  db.close()

  console.log('\n' + '='.repeat(60))
  console.log('✅ Import Complete!')
  console.log('='.repeat(60))
  console.log(`📊 Total punks: ${punkCount}`)
  console.log(`📋 Active listings: ${listingCount}`)
  console.log(`📈 Sales history: ${salesCount}`)
  console.log('='.repeat(60))
}

main().catch(error => {
  console.error('\n❌ Import failed:', error)
  process.exit(1)
})

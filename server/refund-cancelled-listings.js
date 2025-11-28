/**
 * Refund cancelled listings that had deposits
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import Database from 'better-sqlite3'
import { returnPunkToSeller } from './escrow-wallet.js'

const db = new Database('./database/arkade-punks-v2.db')

// Punk VTXO value (standard deposit amount)
const PUNK_DEPOSIT = 10000

// Find cancelled listings with deposits
const cancelled = db.prepare(`
  SELECT punk_id, seller_address, deposited_at
  FROM listings
  WHERE status = 'cancelled' AND deposited_at IS NOT NULL
`).all()

console.log(`Found ${cancelled.length} cancelled listing(s) with deposits to refund`)

for (const listing of cancelled) {
  const punkShort = listing.punk_id.slice(0, 8)
  const sellerShort = listing.seller_address.slice(0, 30)

  console.log(`\nRefunding deposit for punk ${punkShort}...`)
  console.log(`   Amount: ${PUNK_DEPOSIT} sats`)
  console.log(`   To: ${sellerShort}...`)

  try {
    const result = await returnPunkToSeller(listing.seller_address, PUNK_DEPOSIT)
    console.log(`   Refund sent! TXID: ${result.txid}`)

    // Mark as refunded by clearing deposited_at
    db.prepare(`UPDATE listings SET deposited_at = NULL WHERE punk_id = ?`).run(listing.punk_id)
  } catch (error) {
    console.log(`   Failed: ${error.message}`)
  }
}

console.log('\nDone!')
db.close()

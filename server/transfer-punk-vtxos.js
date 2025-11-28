/**
 * Transfer punk VTXOs to buyers for completed sales
 * When a punk is sold, the 10k sats VTXO should go to the buyer
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import Database from 'better-sqlite3'
import { returnPunkToSeller } from './escrow-wallet.js'

const db = new Database('./database/arkade-punks-v2.db')

// Punk VTXO value
const PUNK_VTXO_VALUE = 10000

// Find sold listings where punk VTXO wasn't transferred to buyer
const needsTransfer = db.prepare(`
  SELECT punk_id, buyer_address, deposited_at
  FROM listings
  WHERE status = 'sold'
    AND deposited_at IS NOT NULL
    AND (punk_transfer_txid IS NULL OR punk_transfer_txid = '')
`).all()

console.log(`Found ${needsTransfer.length} sold punk(s) needing VTXO transfer to buyer`)

const updateTransfer = db.prepare(`
  UPDATE listings SET punk_transfer_txid = ? WHERE punk_id = ?
`)

for (const sale of needsTransfer) {
  const punkShort = sale.punk_id.slice(0, 8)
  const buyerShort = sale.buyer_address.slice(0, 30)

  console.log(`\nTransferring punk VTXO ${punkShort} to buyer...`)
  console.log(`   Amount: ${PUNK_VTXO_VALUE} sats`)
  console.log(`   To: ${buyerShort}...`)

  try {
    const result = await returnPunkToSeller(sale.buyer_address, PUNK_VTXO_VALUE)
    console.log(`   Transfer sent! TXID: ${result.txid}`)
    updateTransfer.run(result.txid, sale.punk_id)
  } catch (error) {
    console.log(`   Failed: ${error.message}`)
  }
}

console.log('\nDone!')
db.close()

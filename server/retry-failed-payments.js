/**
 * Retry failed payments to sellers
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import Database from 'better-sqlite3'
import { returnPunkToSeller } from './escrow-wallet.js'

const db = new Database('./database/arkade-punks-v2.db')

// Find failed payments
const failed = db.prepare(`
  SELECT punk_id, seller_address, price_sats
  FROM listings
  WHERE status = 'sold' AND payment_txid LIKE 'PAYMENT_FAILED%'
`).all()

console.log(`Found ${failed.length} failed payment(s)`)

const updatePayment = db.prepare(`
  UPDATE listings SET payment_txid = ? WHERE punk_id = ?
`)

for (const sale of failed) {
  const punkShort = sale.punk_id.slice(0, 8)
  const sellerShort = sale.seller_address.slice(0, 30)

  console.log(`\nRetrying payment for punk ${punkShort}...`)
  console.log(`   Amount: ${sale.price_sats} sats`)
  console.log(`   To: ${sellerShort}...`)

  try {
    const result = await returnPunkToSeller(sale.seller_address, sale.price_sats)
    console.log(`   Payment sent! TXID: ${result.txid}`)
    updatePayment.run(result.txid, sale.punk_id)
  } catch (error) {
    console.log(`   Failed: ${error.message}`)
  }
}

console.log('\nDone!')
db.close()

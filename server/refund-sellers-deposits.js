/**
 * Refund 10k deposit to sellers who didn't receive it
 * These are the sellers from completed sales where the deposit was sent to buyer by mistake
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import Database from 'better-sqlite3'
import { returnPunkToSeller } from './escrow-wallet.js'

const db = new Database('./database/arkade-punks-v2.db')

const DEPOSIT_AMOUNT = 10000

// Find sold listings where punk_transfer_txid exists (means we sent to buyer by mistake)
const needsRefund = db.prepare(`
  SELECT punk_id, seller_address, buyer_address, punk_transfer_txid
  FROM listings
  WHERE status = 'sold'
    AND punk_transfer_txid IS NOT NULL
    AND punk_transfer_txid != ''
    AND seller_address != buyer_address
`).all()

console.log(`Found ${needsRefund.length} seller(s) needing 10k deposit refund`)
console.log(`Total to send: ${needsRefund.length * DEPOSIT_AMOUNT} sats`)
console.log('')

// Check escrow balance first
const { getEscrowBalance } = await import('./escrow-wallet.js')
try {
  const balance = await getEscrowBalance()
  const needed = needsRefund.length * DEPOSIT_AMOUNT
  console.log(`Escrow balance: ${balance.available} sats`)
  console.log(`Needed: ${needed} sats`)

  if (balance.available < needed) {
    console.log(`\n!!! INSUFFICIENT FUNDS !!!`)
    console.log(`Missing: ${needed - balance.available} sats`)
    process.exit(1)
  }
  console.log(`OK - sufficient funds\n`)
} catch (e) {
  console.log('Could not check balance:', e.message)
}

for (const sale of needsRefund) {
  const punkShort = sale.punk_id.slice(0, 8)
  const sellerShort = sale.seller_address.slice(0, 40)

  console.log(`Refunding deposit for punk ${punkShort}...`)
  console.log(`   To seller: ${sellerShort}...`)

  try {
    const result = await returnPunkToSeller(sale.seller_address, DEPOSIT_AMOUNT)
    console.log(`   OK! TXID: ${result.txid}`)
  } catch (error) {
    console.log(`   FAILED: ${error.message}`)
  }
  console.log('')
}

console.log('Done!')
db.close()

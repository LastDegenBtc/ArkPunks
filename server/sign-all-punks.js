/**
 * Sign all existing punks in the database
 */

import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

import Database from 'better-sqlite3'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const db = new Database('./database/arkade-punks-v2.db')
const SERVER_PRIVATE_KEY = process.env.ARKPUNKS_SERVER_PRIVATE_KEY

if (!SERVER_PRIVATE_KEY) {
  console.log('❌ No ARKPUNKS_SERVER_PRIVATE_KEY in .env')
  process.exit(1)
}

const privKeyBytes = new Uint8Array(
  SERVER_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
)

const punks = db.prepare('SELECT punk_id FROM punks WHERE server_signature IS NULL').all()
console.log(`🔍 Found ${punks.length} punk(s) without signature`)

const update = db.prepare('UPDATE punks SET server_signature = ? WHERE punk_id = ?')

let signed = 0
for (const punk of punks) {
  try {
    const punkIdBytes = new Uint8Array(
      punk.punk_id.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    )
    const messageHash = sha256(punkIdBytes)
    const signature = schnorr.sign(messageHash, privKeyBytes)
    update.run(bytesToHex(signature), punk.punk_id)
    signed++
    console.log(`✅ Signed: ${punk.punk_id.slice(0, 16)}...`)
  } catch (err) {
    console.error(`❌ Failed to sign ${punk.punk_id.slice(0, 16)}:`, err.message)
  }
}

console.log(`\n✅ Done! Signed ${signed}/${punks.length} punk(s)`)
db.close()

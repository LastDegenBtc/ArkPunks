/**
 * Sign Existing Punks
 *
 * Adds server signatures to all existing punks in the database.
 * This is a one-time migration script to sign punks that were registered
 * before the signature system was implemented.
 */

import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .env from parent directory (project root)
dotenv.config({ path: join(__dirname, '..', '.env') })

import Database from 'better-sqlite3'
import { schnorr } from '@noble/curves/secp256k1.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const SERVER_PRIVATE_KEY = process.env.ARKPUNKS_SERVER_PRIVATE_KEY

if (!SERVER_PRIVATE_KEY) {
  console.error('❌ ARKPUNKS_SERVER_PRIVATE_KEY not found in environment variables')
  process.exit(1)
}

// Sign a punk ID
function signPunkId(punkId) {
  try {
    const privKeyBytes = new Uint8Array(
      SERVER_PRIVATE_KEY.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    )
    // Convert punkId string to bytes
    const punkIdBytes = new TextEncoder().encode(punkId)
    const messageHash = sha256(punkIdBytes)
    const signature = schnorr.sign(messageHash, privKeyBytes)
    return bytesToHex(signature)
  } catch (error) {
    console.error('❌ Failed to sign punk:', error)
    return null
  }
}

// Main function
async function signExistingPunks() {
  console.log('🔐 Signing all existing punks in the database...\n')

  // Open database
  const dbPath = join(__dirname, 'database', 'arkade-punks-v2.db')
  console.log(`📂 Database: ${dbPath}`)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  try {
    // Get all punks without signatures or with null signatures
    const punks = db.prepare(`
      SELECT punk_id, owner_address
      FROM punks
      WHERE server_signature IS NULL OR server_signature = ''
    `).all()

    console.log(`\n📊 Found ${punks.length} punk(s) to sign\n`)

    if (punks.length === 0) {
      console.log('✅ All punks already have signatures!')
      return
    }

    // Prepare update statement
    const updateStmt = db.prepare(`
      UPDATE punks
      SET server_signature = ?
      WHERE punk_id = ?
    `)

    let signed = 0
    let failed = 0

    // Sign each punk
    for (const punk of punks) {
      const signature = signPunkId(punk.punk_id)

      if (signature) {
        updateStmt.run(signature, punk.punk_id)
        signed++
        console.log(`✅ Signed: ${punk.punk_id.slice(0, 16)}... (owner: ${punk.owner_address.slice(0, 20)}...)`)
      } else {
        failed++
        console.log(`❌ Failed: ${punk.punk_id.slice(0, 16)}...`)
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Signed: ${signed}`)
    console.log(`   ❌ Failed: ${failed}`)
    console.log(`\n🎉 Done!`)

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    db.close()
  }
}

// Run the script
signExistingPunks()

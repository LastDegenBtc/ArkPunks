/**
 * Add Legacy Whitelist Punks to Blob Registry
 *
 * The migration script only adds punks with server signatures.
 * This script manually adds LEGACY_WHITELIST punks to the registry.
 */

import { SimplePool } from 'nostr-tools'

const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1400

// Legacy punks that should be in registry (from arkade.ts config)
const LEGACY_WHITELIST = [
  '4315737c9950cdc2797ab2caf6f3d208916d9a7b4f324550dde544fbbab0daaf',
  '9b986360f5bde2dd19a6e942a89bbbba541b31aece184688b846b233f751a881',
  'a02ee0929e3dd49e47e1ad0bcda6d8cd17d77ba50c6775fcb9c2be96e17e95f8',
  'd8f58e6e27def94a75be78a8b659e1b6823eb1906a1a9b6d8cf4d5f9e17e6906',
  'f7f37f5b15f0aea1ad44f24f03aa14e0f5cdd9b3088b37b5cc3c62c9b21e2ed3',
  'be947d905bf93af4f1dded85f7f0d2dca5b0e1d18ba1acb2f0e4e9e15cf7b3b1',
]

console.log('🔍 Finding legacy punks in Nostr relay...')
console.log(`   Looking for ${LEGACY_WHITELIST.length} whitelisted punks`)
console.log('')

const pool = new SimplePool()

try {
  // Fetch ALL punk mint events (don't filter by signature or network)
  console.log('📡 Fetching all punk events from Nostr relay...')
  const allEvents = await pool.querySync([OFFICIAL_RELAY], {
    kinds: [KIND_PUNK_MINT],
    '#t': ['arkade-punk'],
    limit: 3000 // Increased limit
  })

  console.log(`   Found ${allEvents.length} total events`)

  // Show time range to debug
  if (allEvents.length > 0) {
    const timestamps = allEvents.map(e => e.created_at).sort((a, b) => a - b)
    const earliest = new Date(timestamps[0] * 1000)
    const latest = new Date(timestamps[timestamps.length - 1] * 1000)
    console.log(`   Time range: ${earliest.toISOString()} to ${latest.toISOString()}`)
  }

  // Find events for legacy whitelist punks
  const legacyPunks = []

  for (const punkId of LEGACY_WHITELIST) {
    const event = allEvents.find(e => {
      const punkIdTag = e.tags.find(t => t[0] === 'punk_id')
      return punkIdTag?.[1] === punkId
    })

    if (event) {
      const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
      legacyPunks.push({
        punkId,
        mintedAt: event.created_at * 1000,
        minterPubkey: event.pubkey,
        vtxo: vtxoTag?.[1] || ''
      })
      console.log(`   ✅ Found: ${punkId.slice(0, 16)}...`)
    } else {
      console.log(`   ⚠️  Not found in Nostr: ${punkId.slice(0, 16)}...`)
    }
  }

  console.log('')
  console.log(`📋 Found ${legacyPunks.length}/${LEGACY_WHITELIST.length} legacy punks in Nostr`)
  console.log('')

  if (legacyPunks.length === 0) {
    console.log('❌ No legacy punks found to add')
    process.exit(1)
  }

  // Submit to blob registry
  const API_URL = process.env.API_URL || 'https://arkpunks.com'

  console.log(`📤 Adding ${legacyPunks.length} legacy punks to blob registry at ${API_URL}...`)

  try {
    const response = await fetch(`${API_URL}/api/registry/batch-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        punks: legacyPunks
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json()

    console.log('✅ Legacy punks added to registry!')
    console.log(`   Added: ${data.added} new punks`)
    console.log(`   Skipped: ${data.skipped} duplicates`)
    console.log(`   Total registered: ${data.totalRegistered}`)

  } catch (error) {
    console.error('❌ Failed to add legacy punks:', error.message)
  }

} catch (error) {
  console.error('❌ Script failed:', error)
} finally {
  pool.close([OFFICIAL_RELAY])
  process.exit(0)
}

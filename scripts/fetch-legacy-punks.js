/**
 * Fetch all punk IDs that were minted during launch but don't have server signatures
 * These should be whitelisted as official punks
 */

import { SimplePool } from 'nostr-tools'

const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1400

// Launch date: Nov 21, 2025, 18:00 CET (17:00 UTC) from config
const LAUNCH_DATE = new Date('2025-11-21T17:00:00Z')
const CUTOFF_DATE = new Date(LAUNCH_DATE.getTime() + 24 * 60 * 60 * 1000) // 24 hours after launch

console.log('🔍 Fetching punks minted during launch without server signatures...')
console.log(`   Launch window: ${LAUNCH_DATE.toISOString()} to ${CUTOFF_DATE.toISOString()}`)

const pool = new SimplePool()

try {
  // First, fetch ALL punk mint events to see what we have
  console.log('\n📡 Fetching ALL punk mint events from relay...')
  const allEvents = await pool.querySync([OFFICIAL_RELAY], {
    kinds: [KIND_PUNK_MINT],
    '#t': ['arkade-punk'],
    limit: 2000
  })

  console.log(`\n📊 Found ${allEvents.length} total punk events`)

  if (allEvents.length > 0) {
    // Show time range of events
    const timestamps = allEvents.map(e => e.created_at).sort((a, b) => a - b)
    const earliest = new Date(timestamps[0] * 1000)
    const latest = new Date(timestamps[timestamps.length - 1] * 1000)
    console.log(`   Earliest: ${earliest.toISOString()}`)
    console.log(`   Latest: ${latest.toISOString()}`)
  }

  // Now filter to launch window
  const events = allEvents.filter(e => {
    const eventDate = e.created_at * 1000
    return eventDate >= LAUNCH_DATE.getTime() && eventDate <= CUTOFF_DATE.getTime()
  })

  console.log(`\n📊 Found ${events.length} punk events in launch window (${LAUNCH_DATE.toISOString()} to ${CUTOFF_DATE.toISOString()})`)

  // Filter for punks WITHOUT server_sig (but have punk_id and vtxo)
  // Process ALL events to see the full picture
  const punksWithoutSig = []
  const punksWithSig = []

  for (const event of allEvents) {
    const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
    const vtxoTag = event.tags.find(t => t[0] === 'vtxo')
    const serverSigTag = event.tags.find(t => t[0] === 'server_sig')

    if (!punkIdTag || !vtxoTag) {
      continue // Skip invalid events
    }

    const punkId = punkIdTag[1]

    if (!serverSigTag || !serverSigTag[1]) {
      punksWithoutSig.push({
        punkId,
        vtxo: vtxoTag[1],
        timestamp: event.created_at,
        pubkey: event.pubkey
      })
    } else {
      punksWithSig.push(punkId)
    }
  }

  console.log(`\n✅ Punks WITH signatures: ${punksWithSig.length}`)
  console.log(`❌ Punks WITHOUT signatures: ${punksWithoutSig.length}`)

  if (punksWithoutSig.length === 0) {
    console.log('\n🎉 All punks have signatures! Nothing to whitelist.')
    process.exit(0)
  }

  // Deduplicate by punkId (some might be duplicated)
  const uniquePunks = new Map()
  for (const punk of punksWithoutSig) {
    if (!uniquePunks.has(punk.punkId)) {
      uniquePunks.set(punk.punkId, punk)
    }
  }

  console.log(`\n📋 Unique punks without signatures: ${uniquePunks.size}`)
  console.log('\nGenerated LEGACY_WHITELIST:')
  console.log('```typescript')
  console.log('LEGACY_WHITELIST: [')
  console.log('  // Original legacy punk')
  console.log('  \'4315737c9950cdc2797ab2caf6f3d208916d9a7b4f324550dde544fbbab0daaf\',')
  console.log('  // Punks minted during launch without signatures (Nostr publishing failed)')

  const punkIds = Array.from(uniquePunks.keys())
  for (const punkId of punkIds) {
    console.log(`  '${punkId}',`)
  }

  console.log('] as string[]')
  console.log('```')

  console.log(`\n\n✅ Total punks to whitelist: ${punkIds.length + 1}`)
  console.log('\n📋 Summary:')
  console.log(`   - Original legacy: 1`)
  console.log(`   - Launch punks without sigs: ${punkIds.length}`)
  console.log(`   - Total official punks: ${punksWithSig.length + punkIds.length + 1}`)

  pool.close([OFFICIAL_RELAY])

} catch (error) {
  console.error('❌ Error:', error)
  pool.close([OFFICIAL_RELAY])
  process.exit(1)
}

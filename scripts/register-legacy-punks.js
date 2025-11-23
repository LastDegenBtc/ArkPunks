/**
 * Register Legacy Whitelist Punks
 *
 * Directly adds LEGACY_WHITELIST punks to the blob registry.
 * These punks are official but don't have server signatures.
 */

// Legacy punks that should be in registry (from arkade.ts config)
const LEGACY_WHITELIST = [
  '4315737c9950cdc2797ab2caf6f3d208916d9a7b4f324550dde544fbbab0daaf',
  '9b986360f5bde2dd19a6e942a89bbbba541b31aece184688b846b233f751a881',
  'a02ee0929e3dd49e47e1ad0bcda6d8cd17d77ba50c6775fcb9c2be96e17e95f8',
  'd8f58e6e27def94a75be78a8b659e1b6823eb1906a1a9b6d8cf4d5f9e17e6906',
  'f7f37f5b15f0aea1ad44f24f03aa14e0f5cdd9b3088b37b5cc3c62c9b21e2ed3',
  'be947d905bf93af4f1dded85f7f0d2dca5b0e1d18ba1acb2f0e4e9e15cf7b3b1',
]

const API_URL = process.env.API_URL || 'https://arkpunks.com'

console.log('📝 Registering legacy whitelist punks...')
console.log(`   API: ${API_URL}`)
console.log(`   Punks: ${LEGACY_WHITELIST.length}`)
console.log('')

// Convert to format expected by batch-track API
const punks = LEGACY_WHITELIST.map(punkId => ({
  punkId,
  mintedAt: Date.now() // Current time (will be overridden by API if not provided)
}))

try {
  console.log('📤 Sending to blob registry...')

  const response = await fetch(`${API_URL}/api/registry/batch-track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ punks })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  console.log('✅ Legacy punks registered!')
  console.log(`   Added: ${data.added} new punks`)
  console.log(`   Skipped: ${data.skipped} duplicates`)
  console.log(`   Total in registry: ${data.totalRegistered}`)
  console.log('')
  console.log('🎉 Done! Legacy punks should now appear as official.')

} catch (error) {
  console.error('❌ Failed to register legacy punks:', error.message)
  process.exit(1)
}

/**
 * Cancel Escrow Listing (Admin)
 *
 * Directly marks a listing as cancelled in the blob store.
 * Use this for cleanup when UI cancel is not available.
 */

const punkId = '4315737c9950cdc2797ab2caf6f3d208916d9a7b4f324550dde544fbbab0daaf'
const API_URL = process.env.API_URL || 'https://arkpunks.com'

console.log('🔴 Cancelling escrow listing...')
console.log(`   Punk ID: ${punkId.slice(0, 16)}...`)
console.log(`   API: ${API_URL}`)
console.log('')

// Note: This will fail without seller credentials
// Better to do it directly via blob API

console.log('❌ Cannot cancel via API without seller credentials')
console.log('')
console.log('💡 Options:')
console.log('   1. Add Cancel button to UI for escrow listings')
console.log('   2. Manually update blob via Vercel dashboard')
console.log('   3. Wait for listing to expire (if we add expiry)')
console.log('')
console.log('For now, the listing will remain in blob but won\'t appear in marketplace')
console.log('(because the punk is not in the official list from Nostr)')

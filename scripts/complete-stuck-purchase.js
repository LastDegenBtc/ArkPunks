/**
 * Complete Stuck Purchase
 *
 * Manually completes a purchase that got stuck after payment was sent
 * but execute failed due to missing parameters.
 */

const punkId = 'be947d908a52375b07349f138b802c124c8b0de6077a6cab7243e4ab07a72c15'
const buyerPubkey = 'd7093faab55ca0b7650d1ce974e2006aafb4dea7211bd2aa052fb58b3b88064e'
const buyerArkAddress = 'ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5fct6p2y0hdhmmh37j7l9nmdg3ynmdk9zw9gke0ggu22thfvsu36muprg3'

const API_URL = process.env.API_URL || 'https://arkpunks-git-dev-lastdegen.vercel.app'

console.log('⚡ Completing stuck purchase...')
console.log(`   Punk: ${punkId.slice(0, 8)}...`)
console.log(`   Buyer: ${buyerArkAddress.slice(0, 20)}...`)
console.log('')

try {
  console.log('📤 Calling execute endpoint...')

  const response = await fetch(`${API_URL}/api/escrow/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      punkId,
      buyerPubkey,
      buyerArkAddress
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  console.log('✅ Purchase completed!')
  console.log(`   Payment TXID: ${data.paymentTxid}`)
  console.log(`   Message: ${data.message}`)
  console.log('')
  console.log('🎉 Done! Ownership table updated, seller has been paid.')
  console.log('   Note: Seller still needs to manually send punk VTXO to buyer.')

} catch (error) {
  console.error('❌ Failed to complete purchase:', error.message)
  process.exit(1)
}

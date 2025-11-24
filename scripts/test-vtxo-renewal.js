/**
 * Standalone VTXO Renewal Test Script
 *
 * Demonstrates the VTXO state inconsistency bug where:
 * - Server reports VTXOs as VTXO_RECOVERABLE (blocks sends)
 * - SDK reports balance.recoverable = 0
 * - SDK renewVtxos() throws "No VTXOs available to renew"
 * - SDK recoverVtxos() throws "No recoverable VTXOs found"
 *
 * Usage:
 *   node scripts/test-vtxo-renewal.js <private_key_hex>
 *
 * Example:
 *   node scripts/test-vtxo-renewal.js a1b2c3d4e5f6...
 */

import { Wallet, VtxoManager } from '@arkade-os/sdk'

const privateKeyHex = process.argv[2]

if (!privateKeyHex || privateKeyHex.length !== 64) {
  console.error('❌ Usage: node scripts/test-vtxo-renewal.js <private_key_hex>')
  console.error('   Private key must be 64 hex characters')
  process.exit(1)
}

console.log('🧪 VTXO Renewal Test Script')
console.log('=' .repeat(80))
console.log('')

try {
  // Step 1: Load wallet
  console.log('📦 Step 1: Loading wallet...')
  const privateKey = Buffer.from(privateKeyHex, 'hex')

  const wallet = await Wallet.fromSigner({
    privateKey,
    arkUrl: 'https://arkade.computer',
    indexerUrl: 'https://arkade.computer',
    esploraUrl: 'https://mempool.space/api',
    network: 'bitcoin'
  })

  const address = await wallet.getAddress()
  console.log(`✅ Wallet loaded: ${address}`)
  console.log('')

  // Step 2: Get VTXOs
  console.log('📊 Step 2: Fetching VTXOs...')
  const vtxos = await wallet.getVtxos()
  console.log(`   Found ${vtxos.length} VTXOs:`)

  vtxos.forEach((v, i) => {
    const expiry = new Date(v.virtualStatus?.batchExpiry || 0)
    const now = new Date()
    const isExpired = expiry < now

    console.log(`   ${i + 1}. ${v.value} sats - ${v.virtualStatus?.state} - expiry: ${expiry.toISOString()} ${isExpired ? '⚠️ EXPIRED' : '✅ OK'}`)
  })
  console.log('')

  // Step 3: Get balance
  console.log('💰 Step 3: Checking balance...')
  const balance = await wallet.getBalance()
  console.log(`   Total: ${balance.total} sats`)
  console.log(`   Available: ${balance.available} sats`)
  console.log(`   Settled: ${balance.settled} sats`)
  console.log(`   Preconfirmed: ${balance.preconfirmed} sats`)
  console.log(`   Recoverable: ${balance.recoverable} sats ${balance.recoverable === 0 ? '⚠️ ZERO (but server may disagree!)' : ''}`)
  console.log('')

  // Step 4: Try to renew VTXOs
  console.log('🔄 Step 4: Attempting VTXO renewal...')
  console.log('   Creating VtxoManager with config:')
  console.log('   - enabled: true')
  console.log('   - thresholdPercentage: 10')
  console.log('')

  const vtxoManager = new VtxoManager(wallet, {
    enabled: true,
    thresholdPercentage: 10
  })

  try {
    console.log('   Calling vtxoManager.renewVtxos()...')
    const txid = await vtxoManager.renewVtxos()
    console.log(`✅ SUCCESS! VTXOs renewed with txid: ${txid}`)
  } catch (renewError) {
    console.error(`❌ renewVtxos() FAILED: ${renewError.message}`)
    console.log('')

    // Step 5: Try to recover VTXOs
    console.log('🔄 Step 5: Attempting VTXO recovery (fallback)...')
    try {
      console.log('   Calling vtxoManager.recoverVtxos()...')
      const recoverTxid = await vtxoManager.recoverVtxos()
      console.log(`✅ SUCCESS! VTXOs recovered with txid: ${recoverTxid}`)
    } catch (recoverError) {
      console.error(`❌ recoverVtxos() FAILED: ${recoverError.message}`)
      console.log('')

      // Step 6: Try to send (to demonstrate VTXO_RECOVERABLE error)
      console.log('📤 Step 6: Attempting send (to demonstrate VTXO_RECOVERABLE error)...')
      try {
        console.log('   Sending 1000 sats to self...')
        const sendTxid = await wallet.sendBitcoin({
          address,
          amount: 1000
        })
        console.log(`✅ Send succeeded with txid: ${sendTxid}`)
      } catch (sendError) {
        console.error(`❌ Send FAILED: ${sendError.message}`)

        if (sendError.message?.includes('VTXO_RECOVERABLE')) {
          console.log('')
          console.log('🐛 BUG CONFIRMED!')
          console.log('=' .repeat(80))
          console.log('The server reports VTXOs as VTXO_RECOVERABLE (blocks sends)')
          console.log('But the SDK cannot renew or recover them:')
          console.log('  - balance.recoverable = 0')
          console.log('  - renewVtxos() throws "No VTXOs available to renew"')
          console.log('  - recoverVtxos() throws "No recoverable VTXOs found"')
          console.log('')
          console.log('This leaves the wallet in an unusable state.')
          console.log('=' .repeat(80))
        }
      }
    }
  }

  console.log('')
  console.log('✅ Test completed')

} catch (error) {
  console.error('❌ Fatal error:', error)
  process.exit(1)
}

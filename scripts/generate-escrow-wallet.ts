/**
 * Generate Escrow Wallet
 *
 * This script generates a new Arkade wallet for escrow purposes
 * and displays the configuration needed for Vercel environment variables.
 *
 * Usage:
 *   tsx scripts/generate-escrow-wallet.ts
 */

import { randomBytes } from 'crypto'

async function generateEscrowWallet() {
  console.log('🔐 Generating new escrow wallet...\n')

  try {
    // Import Arkade SDK and Nostr tools
    const { Wallet, SingleKey } = await import('@arkade-os/sdk')
    const { nip19, getPublicKey } = await import('nostr-tools')

    // Generate random 32-byte private key
    const privateKey = randomBytes(32)
    const privateKeyHex = privateKey.toString('hex')

    // Convert to Nostr format (nsec/npub)
    // Note: nip19 functions expect Uint8Array, not hex strings
    const nsec = nip19.nsecEncode(new Uint8Array(privateKey))
    const publicKey = getPublicKey(new Uint8Array(privateKey))
    const npub = nip19.npubEncode(publicKey)

    console.log('✅ Private key generated')
    console.log('   Keep this SECRET and secure!\n')

    // Create wallet identity
    const identity = SingleKey.fromHex(privateKeyHex)

    // Determine network (can be changed via env var)
    const network = process.env.VITE_ARKADE_NETWORK || 'testnet'
    const isMainnet = network === 'mainnet'

    console.log(`📡 Network: ${network.toUpperCase()}`)
    console.log(`   ${isMainnet ? '🔴 MAINNET (REAL MONEY!)' : '🟡 TESTNET (play money)'}\n`)

    // Create wallet
    const wallet = await Wallet.create({
      identity,
      esploraUrl: isMainnet ? 'https://mempool.space/api' : 'https://mutinynet.com/api',
      arkServerUrl: isMainnet ? 'https://arkade.computer' : 'https://mutinynet.arkade.sh',
    })

    const address = await wallet.getAddress()
    const balance = await wallet.getBalance()

    console.log('✅ Wallet created successfully!\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  ESCROW WALLET CONFIGURATION')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('📋 Vercel Environment Variables:')
    console.log('   Add these in: https://vercel.com/settings/environment-variables\n')

    console.log('ESCROW_WALLET_ADDRESS=')
    console.log(address)
    console.log('')

    console.log('ESCROW_WALLET_PRIVATE_KEY=')
    console.log(privateKeyHex)
    console.log('')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('📊 Wallet Info:')
    console.log(`   Address: ${address}`)
    console.log(`   Balance: ${balance.available} sats`)
    console.log(`   Network: ${isMainnet ? 'MAINNET' : 'TESTNET'}\n`)

    console.log('⚠️  IMPORTANT NEXT STEPS:\n')
    console.log('1. 🔒 SAVE THE PRIVATE KEY in a secure password manager')
    console.log('2. 📋 Add both variables to Vercel environment variables')
    console.log('3. 💰 Send funds to the address:')
    console.log(`   ${isMainnet ? 'Recommended: 100,000 - 500,000 sats (~$100-500)' : 'Testnet: Get from faucet'}`)

    if (!isMainnet) {
      console.log(`   Faucet: https://faucet.mutinynet.com`)
    }

    console.log('4. 🔄 Redeploy your Vercel project')
    console.log('5. ✅ Test the escrow system!\n')

    console.log('💡 How to add liquidity:')
    if (isMainnet) {
      console.log('   - Use any Bitcoin wallet to send to this address')
      console.log('   - Or use Arkade wallet app to onboard funds')
    } else {
      console.log(`   - Visit: https://faucet.mutinynet.com`)
      console.log(`   - Enter address: ${address}`)
      console.log('   - Request testnet sats (usually 100,000 per request)')
    }
    console.log('')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🔐 Security Reminder:')
    console.log('   - NEVER commit the private key to git')
    console.log('   - NEVER share the private key')
    console.log('   - Store it securely (password manager, hardware key, etc.)')
    console.log('   - This wallet holds marketplace funds - protect it!\n')

  } catch (error) {
    console.error('❌ Error generating wallet:', error)
    console.error('\nMake sure @arkade-os/sdk is installed:')
    console.error('   npm install @arkade-os/sdk')
    process.exit(1)
  }
}

// Run the generator
generateEscrowWallet().catch(console.error)

/**
 * Generate Server Signing Key
 *
 * This script generates a cryptographic key pair for server-side punk mint authorization.
 * The private key will be used to sign official punk mints on the server.
 * The public key will be embedded in the app to verify signatures.
 *
 * Usage:
 *   tsx scripts/generate-server-key.ts
 */

import { randomBytes } from 'crypto'
import { getPublicKey } from 'nostr-tools'

async function generateServerKey() {
  console.log('🔐 Generating server signing key pair...\n')

  try {
    // Generate random 32-byte private key
    const privateKey = randomBytes(32)
    const privateKeyHex = privateKey.toString('hex')

    // Derive public key
    const publicKey = getPublicKey(privateKey)

    console.log('✅ Key pair generated successfully!\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  SERVER SIGNING KEY CONFIGURATION')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('📋 Vercel Environment Variables:')
    console.log('   Add these in: https://vercel.com/settings/environment-variables\n')

    console.log('🔒 PRIVATE KEY (KEEP SECRET!):')
    console.log('   Add to Vercel as: ARKPUNKS_SERVER_PRIVATE_KEY\n')
    console.log('ARKPUNKS_SERVER_PRIVATE_KEY=')
    console.log(privateKeyHex)
    console.log('')

    console.log('🔓 PUBLIC KEY (Safe to share):')
    console.log('   Add to Vercel as: VITE_SERVER_PUBKEY\n')
    console.log('VITE_SERVER_PUBKEY=')
    console.log(publicKey)
    console.log('')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('⚠️  IMPORTANT SECURITY NOTES:\n')
    console.log('1. 🔒 NEVER commit the private key to git')
    console.log('2. 🔒 NEVER share the private key with anyone')
    console.log('3. 🔒 Store private key ONLY in Vercel environment variables')
    console.log('4. ✅ Public key CAN be shared publicly')
    console.log('5. ✅ Public key will be embedded in the app code\n')

    console.log('📝 SETUP STEPS:\n')
    console.log('1. Copy ARKPUNKS_SERVER_PRIVATE_KEY to Vercel:')
    console.log('   - Go to https://vercel.com/settings/environment-variables')
    console.log('   - Add ARKPUNKS_SERVER_PRIVATE_KEY with the value above')
    console.log('   - Set scope: Production, Preview, Development\n')

    console.log('2. Copy VITE_SERVER_PUBKEY to Vercel:')
    console.log('   - Add VITE_SERVER_PUBKEY with the public key above')
    console.log('   - Set scope: Production, Preview, Development\n')

    console.log('3. (Optional) Update SERVER_PUBKEY in src/config/arkade.ts:')
    console.log('   - Hardcode the public key for better UX')
    console.log(`   - Replace: SERVER_PUBKEY: '${publicKey}',\n`)

    console.log('4. Redeploy Vercel project\n')

    console.log('5. Test the mint authorization:')
    console.log('   - Try minting a punk')
    console.log('   - Check console for "Server signature received"')
    console.log('   - Verify punk appears in marketplace\n')

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('🎯 What this achieves:\n')
    console.log('✅ Only punks minted through YOUR server will have valid signatures')
    console.log('✅ Impossible for others to forge official punk mints')
    console.log('✅ Punks #585eea17 and #ea5dba6c will be filtered out (no signature)')
    console.log('✅ Your punk #4315737c is whitelisted in config (pre-signature)')
    console.log('✅ All future mints will require server signature\n')

  } catch (error) {
    console.error('❌ Error generating server key:', error)
    process.exit(1)
  }
}

// Run the generator
generateServerKey().catch(console.error)

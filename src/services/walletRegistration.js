/**
 * Wallet Registration Service
 * Handles automatic punk registration when wallet is imported/loaded
 */

// API URL - uses environment variable or defaults to localhost for dev
const API_BASE = import.meta.env.VITE_PUNKS_API_URL || 'http://localhost:3001'

/**
 * Check if wallet needs registration
 * @param {string} address - Wallet address (bc1p... or ark1...)
 * @returns {Promise<boolean>}
 */
export async function needsRegistration(address) {
  try {
    // Check localStorage flag first (fast path)
    const flag = localStorage.getItem(`wallet-registered-v2:${address}`)
    if (flag === 'true') {
      console.log('✓ Wallet already registered (local flag)')
      return false
    }

    // Check with server
    const response = await fetch(`${API_BASE}/api/wallet/status?address=${address}`)
    const data = await response.json()

    if (data.isRegistered) {
      // Set flag to avoid future checks
      localStorage.setItem(`wallet-registered-v2:${address}`, 'true')
      console.log(`✓ Wallet already registered with ${data.punkCount} punks`)
      return false
    }

    console.log('⚠ Wallet needs registration')
    return true
  } catch (error) {
    console.error('Error checking registration status:', error)
    // On error, assume needs registration (safer)
    return true
  }
}

/**
 * Register wallet and its punks
 * @param {Object} wallet - Wallet object with address and punks
 * @returns {Promise<Object>} Registration result
 */
export async function registerWallet(wallet) {
  try {
    const payload = {
      address: wallet.address,
      punks: wallet.punks.map(punk => ({
        punkId: punk.punkId,
        vtxoOutpoint: punk.vtxoOutpoint,
        mintDate: punk.mintDate
      }))
    }

    console.log(`📝 Registering wallet ${wallet.address.slice(0, 20)}... with ${wallet.punks.length} punks`)

    const response = await fetch(`${API_BASE}/api/wallet/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    if (result.success) {
      // Set flag to avoid re-registration
      localStorage.setItem(`wallet-registered-v2:${wallet.address}`, 'true')

      console.log(`✅ Registration successful:`)
      console.log(`   New: ${result.summary.registered}`)
      console.log(`   Updated: ${result.summary.updated}`)
      console.log(`   Conflicts: ${result.summary.conflicts}`)

      // Handle conflicts if any
      if (result.summary.conflicts > 0) {
        handleConflicts(result.results.conflicts)
      }

      return result
    } else {
      throw new Error(result.error || 'Registration failed')
    }
  } catch (error) {
    console.error('❌ Wallet registration failed:', error)
    throw error
  }
}

/**
 * Handle punk ownership conflicts
 * @param {Array} conflicts - List of conflicting punks
 */
function handleConflicts(conflicts) {
  console.warn('⚠️ Ownership conflicts detected:', conflicts)

  // Show user notification
  const message = `
    Attention: ${conflicts.length} punk(s) sont déjà enregistrés par un autre wallet.

    Cela peut arriver si:
    - Vous avez importé un wallet qui a déjà été utilisé ailleurs
    - Il y a eu un transfert non enregistré

    Punks en conflit:
    ${conflicts.map(c => `
      - ${c.punkId.slice(0, 16)}...
        Propriétaire actuel: ${c.currentOwner.slice(0, 20)}...
    `).join('')}

    Contactez le support si vous pensez que c'est une erreur.
  `

  // TODO: Replace with your app's notification system
  console.error(message)

  // Optional: Show modal or toast
  // showNotification({ type: 'warning', message })
}

/**
 * Main registration flow - call this when wallet is imported or loaded
 * @param {Object} wallet - Wallet object (supports both formats: { address, punks } and { wallet: { address }, punks })
 * @returns {Promise<void>}
 */
export async function handleWalletImport(wallet) {
  // Handle both wallet formats
  const address = wallet.address || wallet.wallet?.address
  const punks = wallet.punks || []

  if (!address || !punks) {
    console.error('Invalid wallet object: missing address or punks')
    return
  }

  console.log('🔐 Processing wallet import...')
  console.log(`   Address: ${address}`)
  console.log(`   Punks: ${punks.length}`)

  try {
    // Check if registration needed
    const needs = await needsRegistration(address)

    if (!needs) {
      console.log('✓ Wallet already registered, skipping')
      return
    }

    // Register wallet with extracted address and punks
    const result = await registerWallet({ address, punks })

    console.log('✅ Wallet import complete')
    return result
  } catch (error) {
    console.error('❌ Wallet import failed:', error)

    // Show user-friendly error
    // TODO: Replace with your app's error handling
    alert(`Erreur lors de l'enregistrement du wallet: ${error.message}`)
  }
}

/**
 * Recovery flow - for users who lost wallet JSON but have private key
 * @param {string} minterPubkey - Nostr pubkey derived from private key
 * @returns {Promise<Object>} Available punks for recovery
 */
export async function recoverWallet(minterPubkey) {
  try {
    console.log(`🔍 Searching for punks with minterPubkey ${minterPubkey.slice(0, 16)}...`)

    const response = await fetch(`${API_BASE}/api/wallet/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minterPubkey })
    })

    const result = await response.json()

    if (result.success) {
      console.log(`✅ Recovery search complete:`)
      console.log(`   Total found: ${result.summary.total}`)
      console.log(`   Available: ${result.summary.available}`)
      console.log(`   Claimed: ${result.summary.claimed}`)

      return result
    } else {
      throw new Error(result.error || 'Recovery failed')
    }
  } catch (error) {
    console.error('❌ Wallet recovery failed:', error)
    throw error
  }
}

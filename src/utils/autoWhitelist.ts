/**
 * Auto-Whitelist Utility
 *
 * Automatically detects punks in localStorage that aren't on Nostr
 * and submits them to the whitelist API
 */

import { SimplePool } from 'nostr-tools'
import { loadIdentity } from './arkadeWallet'
import { getPublicKey } from 'nostr-tools'

const OFFICIAL_RELAY = 'wss://relay.damus.io'
const KIND_PUNK_MINT = 1400

// Track if we've already run auto-submit this session
let hasRunAutoSubmit = false

/**
 * Auto-submit localStorage punks that aren't on Nostr
 * This should be called once when the app loads
 */
export async function autoSubmitLocalPunks(): Promise<void> {
  // Only run once per session
  if (hasRunAutoSubmit) {
    return
  }
  hasRunAutoSubmit = true

  try {
    console.log('🔍 Auto-whitelist: Checking for local punks without Nostr events...')

    // Load punks from localStorage
    const punksJson = localStorage.getItem('arkade_punks')
    if (!punksJson) {
      console.log('   No local punks found')
      return
    }

    const localPunks = JSON.parse(punksJson)
    if (!Array.isArray(localPunks) || localPunks.length === 0) {
      console.log('   No local punks found')
      return
    }

    console.log(`   Found ${localPunks.length} local punk(s)`)

    // Get all punk IDs from localStorage
    const localPunkIds = localPunks.map((p: any) => p.punkId).filter(Boolean)

    if (localPunkIds.length === 0) {
      console.log('   No valid punk IDs in localStorage')
      return
    }

    // Fetch all punk events from Nostr to see which ones exist
    console.log('   📡 Checking Nostr for these punks...')
    const pool = new SimplePool()

    const nostrEvents = await pool.querySync([OFFICIAL_RELAY], {
      kinds: [KIND_PUNK_MINT],
      '#punk_id': localPunkIds,
      limit: localPunkIds.length + 100
    })

    pool.close([OFFICIAL_RELAY])

    // Get set of punk IDs that exist on Nostr
    const nostrPunkIds = new Set<string>()
    for (const event of nostrEvents) {
      const punkIdTag = event.tags.find(t => t[0] === 'punk_id')
      if (punkIdTag) {
        nostrPunkIds.add(punkIdTag[1])
      }
    }

    console.log(`   Found ${nostrPunkIds.size} punk(s) on Nostr`)

    // Find punks that are NOT on Nostr
    const missingPunkIds = localPunkIds.filter((id: string) => !nostrPunkIds.has(id))

    if (missingPunkIds.length === 0) {
      console.log('   ✅ All local punks are on Nostr!')
      return
    }

    console.log(`   ⚠️ Found ${missingPunkIds.length} punk(s) missing from Nostr:`)
    missingPunkIds.forEach((id: string) => {
      console.log(`      - ${id.slice(0, 16)}...`)
    })

    // Submit to whitelist API
    console.log('   📤 Submitting to auto-whitelist...')

    // Get user's pubkey if available
    let pubkey: string | undefined
    try {
      const identity = loadIdentity()
      if (identity) {
        pubkey = getPublicKey(identity.privateKey)
      }
    } catch (error) {
      // Ignore - pubkey is optional
    }

    const response = await fetch('/api/whitelist/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        punkIds: missingPunkIds,
        pubkey
      })
    })

    if (!response.ok) {
      console.warn('   ⚠️ Failed to submit to whitelist:', response.statusText)
      return
    }

    const result = await response.json()
    console.log(`   ✅ Whitelist submission successful:`)
    console.log(`      - Added: ${result.added} punk(s)`)
    console.log(`      - Total whitelisted: ${result.totalWhitelisted}`)

    if (result.added > 0) {
      console.log('   🎉 Your punks will now show as official!')
      console.log('   💡 Refresh the page to see the updated tags')
    }

  } catch (error) {
    console.warn('⚠️ Auto-whitelist submission failed:', error)
  }
}

/**
 * Reset the auto-submit flag (for testing)
 */
export function resetAutoSubmit(): void {
  hasRunAutoSubmit = false
}

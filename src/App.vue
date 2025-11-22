<template>
  <div id="app">
    <header class="app-header">
      <div class="container">
        <h1 class="logo">
          <img src="/logo.svg" alt="ArkPunks" class="logo-icon logo-punk" />
          ArkPunks
        </h1>
        <nav class="nav">
          <button @click="currentView = 'gallery'" :class="{ active: currentView === 'gallery' }">
            Gallery
          </button>
          <button @click="currentView = 'mint'" :class="{ active: currentView === 'mint' }">
            Mint
          </button>
          <button
            v-if="isMarketplaceAvailable"
            @click="currentView = 'marketplace'"
            :class="{ active: currentView === 'marketplace' }"
          >
            Marketplace
          </button>
          <button @click="currentView = 'stats'" :class="{ active: currentView === 'stats' }">
            Stats
          </button>
          <button @click="currentView = 'faq'" :class="{ active: currentView === 'faq' }">
            FAQ
          </button>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <div class="container">
        <!-- Wallet Connection -->
        <WalletConnect ref="walletConnectRef" />

        <div v-if="currentView === 'gallery'" class="view">
          <div class="gallery-header">
            <div>
              <h2>Punk Gallery</h2>
              <p class="subtitle">Your personal collection</p>
            </div>
            <button @click="refreshGallery" class="btn-refresh" :disabled="refreshing">
              {{ refreshing ? '🔄 Refreshing...' : '🔄 Refresh' }}
            </button>
          </div>

          <div v-if="samplePunks.length === 0" class="empty-gallery">
            <p>No punks yet. Go to Mint section to create your first ArkPunk!</p>
          </div>

          <div v-else class="punk-grid">
            <div v-for="punk in samplePunks" :key="`${punk.punkId}-${officialPunksMap.size}`" class="punk-card-wrapper">
              <PunkCard
                :punk="punk"
                :is-official="isOfficialPunk(punk.punkId)"
                :official-index="getOfficialIndex(punk.punkId)"
                :in-escrow="isPunkInEscrow(punk.punkId)"
              />
              <div class="punk-actions">
                <button
                  v-if="!listedPunkIds.has(punk.punkId)"
                  @click="listPunk(punk)"
                  class="btn-action btn-list"
                >
                  💰 List for Sale
                </button>
                <button
                  v-else
                  @click="delistPunkFromMarket(punk)"
                  class="btn-action btn-delist"
                >
                  🗑️ Delist
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="currentView === 'mint'" class="view">
          <MintPunk />
        </div>

        <div v-if="currentView === 'marketplace' && isMarketplaceAvailable" class="view">
          <Marketplace />
        </div>

        <div v-if="currentView === 'stats'" class="view">
          <Stats />
        </div>

        <div v-if="currentView === 'faq'" class="view">
          <FAQ />
        </div>
      </div>
    </main>

    <footer class="app-footer">
      <div class="container">
        <p>
          Built with ❤️ by <strong>PPRGB20</strong> on Bitcoin using
          <a href="https://docs.arkadeos.com" target="_blank">ArkadeOS SDK</a>
        </p>
        <p class="disclaimer">
          ⚠️ Alpha software - you can loose your funds, don't put too much in this silly game
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, provide, onMounted, computed, watch } from 'vue'
import PunkCard from './components/PunkCard.vue'
import MintPunk from './components/MintPunk.vue'
import Marketplace from './components/Marketplace.vue'
import Stats from './components/Stats.vue'
import WalletConnect from './components/WalletConnect.vue'
import FAQ from './components/FAQ.vue'
import { PunkState } from './types/punk'
import { generatePunkMetadata } from './utils/generator'
import type { ArkadeWalletInterface } from './utils/arkadeWallet'
import { getOfficialPunksList } from './utils/officialPunkValidator'
import { listPunkForSale, delistPunk, getMarketplaceListings, getSoldPunkIds, syncPunksFromNostr, publishPunkTransfer } from './utils/marketplaceUtils'
import { compressPunkMetadata } from './utils/compression'
import { autoSubmitLocalPunks } from './utils/autoWhitelist'
import { hex } from '@scure/base'
import { getPublicKey, nip19 } from 'nostr-tools'
import { PUNK_SUPPLY_CONFIG, getActiveConfig } from './config/arkade'

const walletConnectRef = ref<any>()

// Check if marketplace is available (only after launch in production)
const isMarketplaceAvailable = computed(() => {
  const config = getActiveConfig()

  // Always show in dev/testnet
  if (config.network !== 'mainnet') {
    return true
  }

  // TEMPORARY: Always show on dev preview URL for testing
  if (typeof window !== 'undefined' && window.location.hostname.includes('arkpunks-git-dev')) {
    return true
  }

  // In production, check if we've reached launch time
  const now = Date.now()
  const launchTime = new Date(PUNK_SUPPLY_CONFIG.LAUNCH_DATE).getTime()

  return now >= launchTime
})

const currentView = ref<'gallery' | 'mint' | 'marketplace' | 'stats' | 'faq'>('gallery')
const selectedPunk = ref<PunkState | null>(null)

// Track which punks are currently listed
const listedPunkIds = ref<Set<string>>(new Set())

// Track refreshing state
const refreshing = ref(false)

// Provide wallet getter to child components
provide('getWallet', (): ArkadeWalletInterface | null => {
  return walletConnectRef.value?.getWallet?.() || null
})

// Provide reload function to child components
// Use loadPunksFromLocalStorage() to avoid re-filtering after Nostr sync
provide('reloadPunks', async () => {
  await loadPunksFromLocalStorage()
})

// All punks from localStorage
const allPunks = ref<PunkState[]>([])

// Current wallet address
const currentWalletAddress = ref<string | null>(null)
const lastLoggedAddress = ref<string | null>(null) // Track last logged address to avoid spam

// Filtered punks for current wallet only
// Includes punks owned by wallet AND punks in escrow (to show with badge)
const samplePunks = computed(() => {
  console.log('🔍 Gallery Debug:')
  console.log('   Current wallet address:', currentWalletAddress.value)
  console.log('   All punks count:', allPunks.value.length)
  console.log('   All punks:', allPunks.value.map(p => ({ punkId: p.punkId, owner: p.owner })))

  if (!currentWalletAddress.value) {
    console.log('   ❌ No wallet connected - gallery will be empty')
    return []
  }

  const filtered = allPunks.value.filter(punk => {
    // Show punk if user owns it directly
    if (punk.owner === currentWalletAddress.value) {
      return true
    }

    // Also show punk if it's in escrow (owned by escrow pubkey)
    // This allows sellers to see their punks with "En escrow" badge
    if (escrowPubkey.value && punk.owner === escrowPubkey.value) {
      return true
    }

    return false
  })

  console.log('   ✅ Filtered punks for this wallet:', filtered.length)
  console.log('   📊 Official punks map size in gallery:', officialPunksMap.value.size)

  // Debug: Check which filtered punks are official
  if (filtered.length > 0 && officialPunksMap.value.size > 0) {
    console.log('   🔍 Checking which gallery punks are official:')
    filtered.forEach(punk => {
      const isOff = officialPunksMap.value.has(punk.punkId)
      const idx = officialPunksMap.value.get(punk.punkId)
      console.log(`      ${punk.punkId.slice(0, 8)}... → ${isOff ? `✅ Official #${idx}` : '❌ Not official'}`)
    })
  }

  return filtered
})

// Official punks list from Nostr authority relay
const officialPunkIds = ref<string[]>([])
const officialPunksMap = ref<Map<string, number>>(new Map())

// Escrow pubkey for detecting punks in escrow
const escrowPubkey = ref<string>('')

// Load all punks from localStorage (with sold punk filtering for normal loads)
async function loadPunks() {
  try {
    const punksJson = localStorage.getItem('arkade_punks')
    if (punksJson) {
      let punks = JSON.parse(punksJson)

      // Check if any punks have been sold (for sellers)
      // This filters punks that were sold on marketplace
      const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
      if (privateKeyHex) {
        const myPubkey = getPublicKey(hex.decode(privateKeyHex))
        const soldPunkIds = await getSoldPunkIds(myPubkey)

        if (soldPunkIds.size > 0) {
          const punksBefore = punks.length
          punks = punks.filter((p: any) => !soldPunkIds.has(p.punkId))
          const punksRemoved = punksBefore - punks.length

          if (punksRemoved > 0) {
            // Update localStorage
            localStorage.setItem('arkade_punks', JSON.stringify(punks))
          }
        }
      }

      // Deduplicate by punkId (in case there are duplicates in localStorage)
      const uniquePunksMap = new Map()
      for (const punk of punks) {
        if (!uniquePunksMap.has(punk.punkId)) {
          uniquePunksMap.set(punk.punkId, punk)
        }
      }
      const uniquePunks = Array.from(uniquePunksMap.values())

      // If we found duplicates, clean up localStorage
      if (uniquePunks.length < punks.length) {
        console.warn(`⚠️ Found ${punks.length - uniquePunks.length} duplicate punks in localStorage, cleaning up...`)
        localStorage.setItem('arkade_punks', JSON.stringify(uniquePunks))
      }

      allPunks.value = uniquePunks.map((data: any) => ({
        punkId: data.punkId,
        owner: data.owner || '', // Use owner from localStorage
        // Handle both formats: new (with metadata field) and old (metadata spread at root)
        metadata: data.metadata || data,
        listingPrice: 10000n,
        vtxoOutpoint: data.vtxoOutpoint || `${data.punkId}:0`
      }))
    }
  } catch (error) {
    console.error('Failed to load punks:', error)
  }
}

// Load punks from localStorage WITHOUT filtering (used after Nostr sync)
// This is needed because syncPunksFromNostr() already handles all ownership logic
async function loadPunksFromLocalStorage() {
  try {
    const punksJson = localStorage.getItem('arkade_punks')
    if (punksJson) {
      const punks = JSON.parse(punksJson)

      // Deduplicate by punkId (in case there are duplicates in localStorage)
      const uniquePunksMap = new Map()
      for (const punk of punks) {
        if (!uniquePunksMap.has(punk.punkId)) {
          uniquePunksMap.set(punk.punkId, punk)
        }
      }
      const uniquePunks = Array.from(uniquePunksMap.values())

      // If we found duplicates, clean up localStorage
      if (uniquePunks.length < punks.length) {
        console.warn(`⚠️ Found ${punks.length - uniquePunks.length} duplicate punks in localStorage (Nostr sync), cleaning up...`)
        localStorage.setItem('arkade_punks', JSON.stringify(uniquePunks))
      }

      allPunks.value = uniquePunks.map((data: any) => ({
        punkId: data.punkId,
        owner: data.owner || '', // Use owner from localStorage
        // Handle both formats: new (with metadata field) and old (metadata spread at root)
        metadata: data.metadata || data,
        listingPrice: 10000n,
        vtxoOutpoint: data.vtxoOutpoint || `${data.punkId}:0`
      }))
    }
  } catch (error) {
    console.error('Failed to load punks from localStorage:', error)
  }
}

// Update current wallet address
function updateWalletAddress() {
  const wallet = walletConnectRef.value?.getWallet?.()
  currentWalletAddress.value = wallet?.address || null
  lastLoggedAddress.value = currentWalletAddress.value
}

// Watch for wallet changes
watch(() => walletConnectRef.value?.getWallet?.()?.address, () => {
  updateWalletAddress()
})

// Load official punks list from Nostr
async function loadOfficialPunks() {
  try {
    const { punkIds } = await getOfficialPunksList()
    officialPunkIds.value = punkIds

    // Create map for O(1) lookup
    const map = new Map<string, number>()
    punkIds.forEach((id, index) => {
      map.set(id, index)
    })
    officialPunksMap.value = map

    console.log(`✅ Loaded ${punkIds.length} official punks from authority relay`)
    console.log(`📊 Official punks map size: ${officialPunksMap.value.size}`)

    // Debug: Check if user's punks are in the official list
    const userPunkIds = samplePunks.value.map(p => p.punkId)
    const officialUserPunks = userPunkIds.filter(id => map.has(id))
    console.log(`🔍 User has ${officialUserPunks.length}/${userPunkIds.length} official punks in gallery`)
    if (officialUserPunks.length > 0) {
      console.log(`   Official punk IDs: ${officialUserPunks.map(id => id.slice(0, 8)).join(', ')}...`)
    }
  } catch (error) {
    console.error('Failed to load official punks:', error)
  }
}

// Check if a punk is official
function isOfficialPunk(punkId: string): boolean {
  const isOfficial = officialPunksMap.value.has(punkId)
  // Debug: Log when checking official status
  if (isOfficial) {
    console.log(`   🎯 Punk ${punkId.slice(0, 8)}... IS official (map size: ${officialPunksMap.value.size})`)
  }
  return isOfficial
}

// Get official index (0-999) for a punk
function getOfficialIndex(punkId: string): number | undefined {
  return officialPunksMap.value.get(punkId)
}

// Check if punk is currently held in escrow
function isPunkInEscrow(punkId: string): boolean {
  if (!escrowPubkey.value) return false
  const punk = allPunks.value.find(p => p.punkId === punkId)
  return punk?.owner === escrowPubkey.value
}

// Load marketplace listings to check which punks are listed
async function loadMarketplaceListings() {
  try {
    const listings = await getMarketplaceListings()

    // Get Nostr pubkey from wallet private key
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      return
    }

    const myPubkey = getPublicKey(hex.decode(privateKeyHex))
    console.log('🔑 My Nostr pubkey:', myPubkey)

    // Only track listings from current wallet (compare Nostr pubkeys)
    const myListings = listings.filter(l => l.owner === myPubkey)
    listedPunkIds.value = new Set(myListings.map(l => l.punkId))

    console.log(`📋 My listings: ${myListings.length}`)
  } catch (error) {
    console.error('Failed to load marketplace listings:', error)
  }
}

// Refresh gallery - reload punks and marketplace listings from Nostr
async function refreshGallery() {
  refreshing.value = true
  let added = 0
  let removed = 0
  let totalSynced = 0

  try {
    console.log('🔄 Refreshing gallery from Nostr...')

    // Get wallet and pubkey for sync
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    const wallet = walletConnectRef.value?.getWallet?.()

    if (privateKeyHex && wallet) {
      const myPubkey = getPublicKey(hex.decode(privateKeyHex))

      // Sync punks from Nostr (recovers all minted/bought punks)
      const nostrPunks = await syncPunksFromNostr(myPubkey, wallet.address)
      totalSynced = nostrPunks.length

      // Get existing localStorage punks BEFORE sync
      const punksJson = localStorage.getItem('arkade_punks')
      const existingPunks = punksJson ? JSON.parse(punksJson) : []

      // IMPORTANT: Nostr is the ONLY source of truth
      // Replace localStorage entirely with Nostr data (no merge!)
      // This prevents "phantom punks" on different devices
      localStorage.setItem('arkade_punks', JSON.stringify(nostrPunks))

      // Count changes
      added = nostrPunks.filter(np =>
        !existingPunks.find((ep: any) => ep.punkId === np.punkId)
      ).length

      removed = existingPunks.filter((ep: any) =>
        !nostrPunks.find(np => np.punkId === ep.punkId)
      ).length

      console.log(`✅ Synced ${nostrPunks.length} punks from Nostr (${added} added, ${removed} removed phantom punks)`)
    }

    // Load punks directly from localStorage WITHOUT filtering sold punks
    // because syncPunksFromNostr() already handles ownership correctly
    await loadPunksFromLocalStorage()
    await loadMarketplaceListings()
    console.log('✅ Gallery refreshed successfully')

    // Show feedback to user
    if (added > 0 || removed > 0) {
      let message = `✅ Gallery refreshed!\n\nTotal punks: ${totalSynced}`
      if (added > 0) {
        message += `\n+ ${added} punk${added === 1 ? '' : 's'} recovered`
      }
      if (removed > 0) {
        message += `\n- ${removed} phantom punk${removed === 1 ? '' : 's'} removed`
      }
      alert(message)
    } else {
      alert(`✅ Gallery refreshed!\n\nTotal punks: ${totalSynced}\nAlready in sync.`)
    }
  } catch (error) {
    console.error('Failed to refresh gallery:', error)
    alert('❌ Failed to refresh gallery. Check console for details.')
  } finally {
    refreshing.value = false
  }
}

// Check if a punk was already sold on the marketplace
async function isPunkSold(punkId: string, myPubkey: string): Promise<{ sold: boolean, buyerPubkey?: string }> {
  const { SimplePool } = await import('nostr-tools')
  const pool = new SimplePool()
  const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://nostr.wine',
    'wss://relay.snort.social'
  ]
  const KIND_PUNK_SOLD = 1402 // Mainnet launch event kind

  try {
    // Query for sold events for this specific punk
    const soldEvents = await pool.querySync(RELAYS, {
      kinds: [KIND_PUNK_SOLD],
      '#punk_id': [punkId],
      limit: 100
    })

    // Find the most recent sold event where I was the seller
    let mostRecentSale: any = null
    for (const event of soldEvents) {
      const sellerTag = event.tags.find(t => t[0] === 'seller')
      if (sellerTag && sellerTag[1] === myPubkey) {
        if (!mostRecentSale || event.created_at > mostRecentSale.created_at) {
          mostRecentSale = event
        }
      }
    }

    if (mostRecentSale) {
      const buyerTag = mostRecentSale.tags.find(t => t[0] === 'buyer')
      return {
        sold: true,
        buyerPubkey: buyerTag?.[1]
      }
    }

    return { sold: false }
  } catch (error) {
    console.error('Failed to check if punk was sold:', error)
    return { sold: false }
  } finally {
    pool.close(RELAYS)
  }
}

// Delist a punk from the marketplace
async function delistPunkFromMarket(punk: PunkState) {
  const wallet = walletConnectRef.value?.getWallet?.()

  if (!wallet) {
    alert('Please connect your wallet first!')
    return
  }

  try {
    // Get private key from localStorage
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      throw new Error('Private key not found')
    }

    const myPubkey = getPublicKey(hex.decode(privateKeyHex))

    // Check if punk was already sold
    console.log('🔍 Checking if punk was already sold...')
    const saleCheck = await isPunkSold(punk.punkId, myPubkey)

    if (saleCheck.sold) {
      const buyerShort = saleCheck.buyerPubkey
        ? `${saleCheck.buyerPubkey.slice(0, 8)}...${saleCheck.buyerPubkey.slice(-4)}`
        : 'unknown buyer'

      alert(
        `❌ Cannot delist: This punk was already sold!\n\n` +
        `${punk.metadata.name} was purchased by ${buyerShort}.\n\n` +
        `Click the Refresh button to update your gallery.`
      )
      console.log('❌ Punk already sold, cannot delist')

      // Refresh gallery to sync with Nostr
      await refreshGallery()
      return
    }

    const confirmed = confirm(`Remove ${punk.metadata.name} from marketplace?`)
    if (!confirmed) return

    console.log('🗑️ Delisting punk from marketplace...')

    // Publish delist event to Nostr
    const success = await delistPunk(punk.punkId, privateKeyHex)

    if (success) {
      alert(`✅ ${punk.metadata.name} removed from marketplace!`)
      console.log('✅ Punk successfully delisted')

      // Update local state
      listedPunkIds.value.delete(punk.punkId)
    } else {
      alert('❌ Failed to delist punk. Check console for details.')
    }
  } catch (error: any) {
    console.error('Failed to delist punk:', error)
    alert(`Failed to delist punk: ${error?.message || error}`)
  }
}

// Transfer a punk directly to another wallet
async function transferPunk(punk: PunkState) {
  const wallet = walletConnectRef.value?.getWallet?.()

  if (!wallet) {
    alert('Please connect your wallet first!')
    return
  }

  // Check if punk is listed
  if (listedPunkIds.value.has(punk.punkId)) {
    alert('Please delist this punk from the marketplace before transferring it.')
    return
  }

  const recipientAddress = prompt('Enter recipient Arkade address (ark1...):', '')
  if (!recipientAddress) return

  // Validate address format (basic check)
  if (!recipientAddress.startsWith('ark1')) {
    alert('Invalid Arkade address. Must start with ark1...')
    return
  }

  // Get recipient Nostr pubkey (accept both npub and hex formats)
  const recipientInput = prompt('Enter recipient Nostr public key (npub1... or hex):', '')
  if (!recipientInput) return

  // Parse and validate pubkey (accept both npub and hex)
  let recipientPubkey: string
  try {
    if (recipientInput.startsWith('npub1')) {
      // Decode npub to hex
      const decoded = nip19.decode(recipientInput)
      if (decoded.type !== 'npub') {
        throw new Error('Invalid npub format')
      }
      recipientPubkey = decoded.data
    } else if (/^[0-9a-fA-F]{64}$/.test(recipientInput)) {
      // Already in hex format
      recipientPubkey = recipientInput
    } else {
      alert('Invalid Nostr public key. Must be npub1... or 64 hex characters.')
      return
    }
  } catch (error) {
    alert('Invalid Nostr public key format.')
    return
  }

  const confirmed = confirm(
    `Transfer ${punk.metadata.name}?\n\n` +
    `To: ${recipientAddress.slice(0, 20)}...\n` +
    `Recipient Nostr: ${recipientInput.startsWith('npub') ? recipientInput.slice(0, 12) : recipientPubkey.slice(0, 8)}...${recipientInput.startsWith('npub') ? recipientInput.slice(-4) : recipientPubkey.slice(-4)}\n\n` +
    `This action cannot be undone!`
  )

  if (!confirmed) return

  try {
    console.log('📤 Transferring punk...')

    // Get private key from localStorage
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      throw new Error('Private key not found')
    }

    const myPubkey = getPublicKey(hex.decode(privateKeyHex))

    // Check balance for minimal transfer (punk has no real value, just 1 sat symbolic transfer)
    const balance = await wallet.getBalance()
    if (balance.available < 1000) {
      throw new Error('Insufficient balance for transfer (need at least 1000 sats for fees)')
    }

    // Send symbolic 1 sat transfer to recipient
    const txid = await wallet.send(recipientAddress, BigInt(1))

    // Publish transfer event to Nostr
    await publishPunkTransfer(punk.punkId, myPubkey, recipientPubkey, txid, privateKeyHex)

    // Remove punk from local storage
    const punksJson = localStorage.getItem('arkade_punks')
    if (punksJson) {
      const punks = JSON.parse(punksJson)
      const updatedPunks = punks.filter((p: any) => p.punkId !== punk.punkId)
      localStorage.setItem('arkade_punks', JSON.stringify(updatedPunks))
    }

    // Reload gallery
    await loadPunksFromLocalStorage()

    alert(
      `✅ Transfer successful!\n\n` +
      `${punk.metadata.name} has been transferred to ${recipientAddress.slice(0, 20)}...\n` +
      `Transaction ID: ${txid.slice(0, 16)}...`
    )

    // Close punk details
    selectedPunk.value = null

  } catch (error: any) {
    console.error('❌ Failed to transfer punk:', error)
    alert(`Failed to transfer punk: ${error?.message || error}`)
  }
}

// List a punk for sale on the marketplace
async function listPunk(punk: PunkState) {
  const wallet = walletConnectRef.value?.getWallet?.()

  if (!wallet) {
    alert('Please connect your wallet first!')
    return
  }

  // Ask for sale mode
  const modeChoice = confirm(
    '🛡️ Choose Sale Mode:\n\n' +
    '✅ OK = ESCROW MODE (Recommended)\n' +
    '   • You can go offline after listing\n' +
    '   • Server holds punk temporarily\n' +
    '   • Automatic sale execution\n' +
    '   • 1% marketplace fee\n\n' +
    '❌ CANCEL = P2P MODE (Advanced)\n' +
    '   • Completely trustless\n' +
    '   • You must stay online\n' +
    '   • Uses HTLC contracts\n' +
    '   • Coming soon!'
  )

  const saleMode = modeChoice ? 'escrow' : 'p2p'

  // P2P mode not yet implemented
  if (saleMode === 'p2p') {
    alert('❌ P2P Mode (HTLC) coming soon!\n\nFor now, please use Escrow Mode.')
    return
  }

  const priceInput = prompt('Enter listing price in sats (minimum 10,000):', '10000')
  if (!priceInput) return

  const price = parseInt(priceInput)
  if (isNaN(price) || price < 10000) {
    alert('Invalid price. Minimum is 10,000 sats.')
    return
  }

  try {
    console.log('📝 Listing punk for sale...')
    console.log('   Sale mode:', saleMode)
    console.log('   Punk metadata:', punk.metadata)

    // Get private key from localStorage
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      throw new Error('Private key not found')
    }

    const myPubkey = getPublicKey(hex.decode(privateKeyHex))

    // Compress punk metadata
    const compressed = compressPunkMetadata(punk.metadata)
    console.log('   Compressed bytes:', compressed)

    const compressedHex = Array.from(compressed.data)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    console.log('   Compressed hex:', compressedHex)
    console.log('   Hex length:', compressedHex.length)

    if (!compressedHex || compressedHex.length === 0) {
      throw new Error('Failed to compress punk metadata')
    }

    // Get Arkade address for payment
    const arkAddress = wallet.arkadeAddress
    console.log('   Ark address:', arkAddress)

    let escrowAddress: string | undefined

    // If escrow mode, create listing via API
    if (saleMode === 'escrow') {
      console.log('📡 Creating escrow listing...')
      const { listPunkInEscrow, getEscrowInfo } = await import('./utils/escrowApi')

      // Get escrow pubkey
      const escrowInfo = await getEscrowInfo()
      const escrowPubkey = escrowInfo.escrowPubkey
      console.log('   Escrow pubkey:', escrowPubkey.slice(0, 16) + '...')

      const escrowListing = await listPunkInEscrow({
        punkId: punk.punkId,
        sellerPubkey: myPubkey,
        sellerArkAddress: arkAddress,
        price: price.toString(),
        punkVtxoOutpoint: punk.vtxoOutpoint
      })

      escrowAddress = escrowListing.escrowAddress
      console.log('✅ Escrow listing created')
      console.log('   Escrow address:', escrowAddress)

      // Transfer punk ownership to escrow via Nostr
      const transferConfirm = confirm(
        `🛡️ Escrow Listing Created!\n\n` +
        `Now transfer ${punk.metadata.name} ownership to escrow.\n\n` +
        `This will:\n` +
        `• Publish a Nostr event transferring ownership to escrow\n` +
        `• Your punk will show as "En escrow" in your gallery\n` +
        `• Once a buyer pays, the escrow will automatically:\n` +
        `  - Transfer the punk to the buyer\n` +
        `  - Send ${price.toLocaleString()} sats to you\n\n` +
        `Ready to transfer punk to escrow?`
      )

      if (!transferConfirm) {
        alert(
          `⚠️ Listing created but punk ownership not transferred.\n\n` +
          `The listing won't be active until you transfer ownership to escrow.`
        )
        return
      }

      // Publish Nostr event transferring punk to escrow
      console.log('🔑 Publishing Nostr transfer event to escrow...')

      try {
        // Transfer punk from seller to escrow pubkey
        await publishPunkTransfer(
          punk.punkId,
          myPubkey, // from seller
          escrowPubkey, // to escrow
          'escrow-listing', // txid placeholder for listing action
          privateKeyHex // seller signs the transfer
        )
        console.log('✅ Punk ownership transferred to escrow via Nostr!')

        alert(
          `✅ Success!\n\n` +
          `${punk.metadata.name} has been transferred to escrow.\n\n` +
          `Your listing is now active in the marketplace!\n` +
          `The punk will show as "🛡️ En escrow" in your gallery.\n\n` +
          `When a buyer purchases it, you'll receive ${price.toLocaleString()} sats automatically.`
        )
      } catch (nostrError: any) {
        console.error('❌ Failed to publish Nostr transfer:', nostrError)
        alert(
          `⚠️ Listing created but failed to transfer ownership via Nostr:\n\n` +
          `${nostrError?.message || nostrError}\n\n` +
          `Please try listing again.`
        )
        return
      }
    }

    // Publish listing to Nostr
    const success = await listPunkForSale(
      punk.punkId,
      BigInt(price),
      punk.vtxoOutpoint,
      compressedHex,
      privateKeyHex,
      arkAddress,
      saleMode,
      escrowAddress
    )

    if (success) {
      alert(`✅ Punk listed for ${price.toLocaleString()} sats!\n\nView it in the Marketplace tab.`)
      console.log('✅ Punk successfully listed on marketplace')

      // Update local state
      listedPunkIds.value.add(punk.punkId)
    } else {
      alert('❌ Failed to list punk. Check console for details.')
    }
  } catch (error: any) {
    console.error('Failed to list punk:', error)
    alert(`Failed to list punk: ${error?.message || error}`)
  }
}

// Load punks on mount and on wallet change
// Load escrow pubkey
async function loadEscrowPubkey() {
  try {
    const { getEscrowInfo } = await import('./utils/escrowApi')
    const escrowInfo = await getEscrowInfo()
    escrowPubkey.value = escrowInfo.escrowPubkey
    console.log('✅ Escrow pubkey loaded:', escrowPubkey.value.slice(0, 16) + '...')
  } catch (error) {
    console.error('Failed to load escrow pubkey:', error)
  }
}

onMounted(async () => {
  // Use loadPunksFromLocalStorage() to avoid filtering sold punks
  // If user did a Nostr sync before, the data is already correct
  await loadPunksFromLocalStorage()
  updateWalletAddress()
  await loadOfficialPunks()
  await loadMarketplaceListings()
  await loadEscrowPubkey()

  // Auto-submit local punks that aren't on Nostr to whitelist
  // This runs in background and doesn't block the UI
  autoSubmitLocalPunks().catch(err => {
    console.warn('Auto-whitelist submission failed:', err)
  })

  // Reload punks when switching wallets
  setInterval(() => {
    const currentAddress = walletConnectRef.value?.getWallet?.()?.address
    if (currentAddress !== currentWalletAddress.value) {
      updateWalletAddress()
    }
  }, 1000)
})
</script>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #0a0a0a;
  color: #fff;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
}

/* Header */
.app-header {
  background: #1a1a1a;
  border-bottom: 2px solid #333;
  padding: 20px 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.app-header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  margin: 0;
  font-size: 28px;
  font-weight: bold;
  background: linear-gradient(45deg, #ff6b35, #ff8555);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 32px;
  filter: none;
  -webkit-text-fill-color: initial;
}

.logo-punk {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  border-radius: 4px;
}

.badge-testnet {
  font-size: 12px;
  padding: 4px 8px;
  background: #fbbf24;
  color: #000;
  border-radius: 4px;
  font-weight: bold;
  -webkit-text-fill-color: #000;
  margin-left: 8px;
}

.nav {
  display: flex;
  gap: 12px;
}

.nav button {
  padding: 10px 20px;
  background: transparent;
  border: 2px solid #333;
  color: #aaa;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.nav button:hover {
  border-color: #ff6b35;
  color: #fff;
}

.nav button.active {
  background: #ff6b35;
  border-color: #ff6b35;
  color: #fff;
}

/* Main */
.app-main {
  flex: 1;
  padding: 48px 0;
}

.view h2 {
  font-size: 36px;
  margin: 0 0 8px 0;
}

.subtitle {
  color: #888;
  margin: 0 0 32px 0;
  font-size: 18px;
}

/* Gallery Header */
.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  gap: 16px;
}

.gallery-header h2 {
  margin-bottom: 8px;
}

.gallery-header .subtitle {
  margin-bottom: 0;
}

.btn-refresh {
  padding: 12px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn-refresh:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Punk Grid */
.punk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.punk-card-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.punk-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-list {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
}

.btn-list:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.btn-delist {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
}

.btn-delist:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.btn-transfer {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
}

.btn-transfer:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.empty-gallery {
  text-align: center;
  padding: 60px 20px;
  color: #888;
  font-size: 18px;
}

.coming-soon {
  text-align: center;
  color: #666;
  font-size: 24px;
  margin-top: 100px;
}

/* Footer */
.app-footer {
  background: #1a1a1a;
  border-top: 2px solid #333;
  padding: 24px 0;
  margin-top: 48px;
  text-align: center;
}

.app-footer p {
  margin: 8px 0;
  color: #888;
}

.app-footer a {
  color: #ff6b35;
  text-decoration: none;
}

.app-footer a:hover {
  text-decoration: underline;
}

.disclaimer {
  font-size: 14px;
  color: #ff6b35;
}

.warning-arkade {
  background: rgba(255, 107, 53, 0.15);
  border: 2px solid #ff6b35;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #fbbf24;
  font-weight: 600;
  font-size: 15px;
  line-height: 1.5;
}

/* Responsive */
@media (max-width: 768px) {
  .app-header .container {
    flex-direction: column;
    gap: 16px;
  }

  .logo {
    font-size: 24px;
  }

  .nav {
    width: 100%;
  }

  .nav button {
    flex: 1;
    padding: 8px 12px;
    font-size: 14px;
  }

  .view h2 {
    font-size: 28px;
  }

  .gallery-header {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-refresh {
    width: 100%;
    padding: 10px 20px;
  }

  .punk-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
}
</style>

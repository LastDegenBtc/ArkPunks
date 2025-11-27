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
            <button @click="refreshGallery" class="btn-refresh">
              🔄 Refresh
            </button>
          </div>

          <div v-if="samplePunks.length === 0" class="empty-gallery">
            <p>No punks yet. Check the Marketplace to buy your first ArkPunk!</p>
          </div>

          <div v-else class="punk-grid">
            <div v-for="punk in samplePunks" :key="punk.punkId" class="punk-card-wrapper">
              <PunkCard
                :punk="punk"
                :is-official="punk.isOfficial"
                :in-escrow="isPunkInEscrow(punk.punkId)"
                :can-cancel="isPunkInEscrow(punk.punkId)"
                @cancel="delistPunkFromMarket"
              />
              <div class="punk-actions">
                <button
                  v-if="!isPunkInEscrow(punk.punkId)"
                  @click="listPunk(punk)"
                  class="btn-action btn-list"
                  :disabled="isMaintenanceMode"
                  :title="isMaintenanceMode ? 'Marketplace is under maintenance' : 'List this punk for sale'"
                >
                  💰 List for Sale
                </button>
              </div>
            </div>
          </div>
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
import { ref, provide, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import PunkCard from './components/PunkCard.vue'
import Marketplace from './components/Marketplace.vue'
import Stats from './components/Stats.vue'
import WalletConnect from './components/WalletConnect.vue'
import FAQ from './components/FAQ.vue'
import { PunkState } from './types/punk'
import { generatePunkMetadata } from './utils/generator'
import type { ArkadeWalletInterface } from './utils/arkadeWallet'
import { compressPunkMetadata } from './utils/compression'
import { hex } from '@scure/base'
import { getPublicKey } from 'nostr-tools' // Only for crypto (deriving pubkey from private key)
import { PUNK_SUPPLY_CONFIG, getActiveConfig } from './config/arkade'

const walletConnectRef = ref<any>()

// Maintenance mode - set to true to disable listing/delisting
const isMaintenanceMode = import.meta.env.VITE_MARKETPLACE_MAINTENANCE === 'true'

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

const currentView = ref<'gallery' | 'marketplace' | 'stats' | 'faq'>('gallery')
const selectedPunk = ref<PunkState | null>(null)

// Provide wallet getter to child components
provide('getWallet', (): ArkadeWalletInterface | null => {
  return walletConnectRef.value?.getWallet?.() || null
})

// Provide reload function to child components
// Use loadPunksSmartly() for automatic database migration and loading
provide('reloadPunks', async () => {
  await loadPunksSmartly()
})

// Provide function to refresh punk locked balance
provide('refreshPunkBalance', () => {
  walletConnectRef.value?.refreshPunkBalance?.()
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

  if (!currentWalletAddress.value) {
    console.log('   ❌ No wallet connected - gallery will be empty')
    return []
  }

  // Debug: Show first punk's owner for comparison
  if (allPunks.value.length > 0) {
    console.log('   📋 First punk owner:', allPunks.value[0].owner)
    console.log('   🔑 Wallet address:', currentWalletAddress.value)
    console.log('   ✅ Match?', allPunks.value[0].owner === currentWalletAddress.value)
  }

  const filtered = allPunks.value.filter(punk => {
    // Show punk if user owns it directly (includes punks held in escrow with inEscrow flag)
    if (punk.owner === currentWalletAddress.value) {
      return true
    }

    // Legacy check: Also show punk if it's in escrow (owned by escrow pubkey)
    // This handles old punks that were listed before the inEscrow flag was added
    if (escrowPubkey.value && punk.owner === escrowPubkey.value) {
      return true
    }

    return false
  })

  console.log('   ✅ Filtered punks for this wallet:', filtered.length)

  return filtered
})

// Escrow pubkey for detecting punks in escrow
const escrowPubkey = ref<string>('')

// Load all punks from localStorage (NO LONGER USED - keeping for reference)
// Use loadPunksFromLocalStorage() instead
async function loadPunks() {
  console.warn('loadPunks() is deprecated, use loadPunksFromLocalStorage() instead')
  await loadPunksFromLocalStorage()
}

// ============================================================
// DATABASE MIGRATION & LOADING
// ============================================================

const API_URL = 'http://localhost:3001'

/**
 * Check if wallet is registered in database
 */
async function checkWalletRegistration(address: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/wallet/status?address=${encodeURIComponent(address)}`)
    const data = await response.json()
    return data.isRegistered || false
  } catch (error) {
    console.error('Failed to check wallet registration:', error)
    return false
  }
}

/**
 * Migrate localStorage punks to database (ONE-TIME operation)
 */
async function migrateLocalStorageToDatabase(address: string): Promise<boolean> {
  console.log('🔄 Starting localStorage → database migration...')

  try {
    // Read punks from localStorage
    const stored = localStorage.getItem('arkade_punks')
    let punks = stored ? JSON.parse(stored) : []

    // Also check arkade-wallet format
    if (punks.length === 0) {
      const walletJson = localStorage.getItem('arkade-wallet')
      if (walletJson) {
        const walletData = JSON.parse(walletJson)
        punks = walletData.punks || []
      }
    }

    if (punks.length === 0) {
      console.log('✅ No punks to migrate')
      return true
    }

    console.log(`📦 Found ${punks.length} punks in localStorage`)

    // Prepare punks for registration with compressed metadata
    const { compressPunkMetadata, compressedToHex } = await import('./utils/compression')
    const { generatePunkMetadata } = await import('./utils/generator')

    const punksToRegister = punks.map((punk: any) => {
      // Get metadata: use existing if available, otherwise generate from punkId
      const metadata = punk.metadata || generatePunkMetadata(punk.punkId)

      // Compress metadata
      const compressed = compressPunkMetadata(metadata)
      const compressedHex = compressedToHex(compressed)

      return {
        punkId: punk.punkId,
        mintDate: punk.mintDate,
        compressedMetadata: compressedHex
      }
    })

    console.log(`🗜️  Compressed metadata for ${punksToRegister.length} punks`)

    // Get wallet's Bitcoin address to help resolve same-wallet conflicts
    const wallet = walletConnectRef.value?.getWallet?.()
    const bitcoinAddress = wallet?.address || null

    // Register in database
    const response = await fetch(`${API_URL}/api/wallet/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        bitcoinAddress, // Send Bitcoin address to help resolve same-wallet conflicts
        punks: punksToRegister
      })
    })

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.statusText}`)
    }

    const result = await response.json()
    console.log('✅ Migration complete:', result.summary)
    console.log(`   Registered: ${result.summary.registered}`)
    console.log(`   Updated: ${result.summary.updated}`)
    console.log(`   Conflicts: ${result.summary.conflicts}`)

    if (result.summary.conflicts > 0) {
      console.warn('⚠️  Some punks had ownership conflicts:', result.results.conflicts)
    }

    // Clear localStorage punk data - database is now the source of truth
    console.log('🗑️  Clearing localStorage punk data (migrated to database)...')
    localStorage.removeItem('arkade_punks')
    console.log('✅ localStorage cleared - database is now the single source of truth')

    return true
  } catch (error) {
    console.error('❌ Migration failed:', error)
    return false
  }
}

/**
 * Load punks from database and decompress metadata
 */
async function loadPunksFromDatabase(address: string): Promise<PunkState[]> {
  console.log('📥 Loading punks from database...')

  try {
    const response = await fetch(`${API_URL}/api/punks/owner?address=${encodeURIComponent(address)}`)

    if (!response.ok) {
      throw new Error(`Failed to fetch punks: ${response.statusText}`)
    }

    const data = await response.json()
    const dbPunks = data.punks || []

    console.log(`📦 Fetched ${dbPunks.length} punks from database`)

    if (dbPunks.length === 0) {
      return []
    }

    // Decompress metadata for each punk
    const { hexToCompressed, decompressPunkMetadata } = await import('./utils/compression')

    const punks: PunkState[] = []

    for (const dbPunk of dbPunks) {
      try {
        // Decompress metadata if available
        if (dbPunk.punk_metadata_compressed) {
          const compressed = hexToCompressed(dbPunk.punk_metadata_compressed)
          const metadata = decompressPunkMetadata(compressed, dbPunk.punk_id)

          punks.push({
            punkId: dbPunk.punk_id,
            owner: dbPunk.owner_address,
            metadata,
            vtxoOutpoint: `${dbPunk.punk_id}:0`, // Placeholder, not stored in DB
            mintDate: dbPunk.minted_at ? new Date(dbPunk.minted_at).toISOString() : new Date().toISOString(),
            inEscrow: false, // Will be updated by escrow sync below
            isOfficial: !!dbPunk.server_signature // Official if server signature exists
          })
        } else {
          console.warn(`⚠️  Punk ${dbPunk.punk_id.slice(0, 8)} has no compressed metadata, skipping`)
        }
      } catch (error) {
        console.error(`Failed to decompress punk ${dbPunk.punk_id.slice(0, 8)}:`, error)
      }
    }

    console.log(`✅ Decompressed ${punks.length} punks`)

    // Sync escrow flags from server
    try {
      console.log('🔄 Syncing escrow state from server...')
      const escrowResponse = await fetch(`${API_URL}/api/escrow/listings`)
      const escrowData = await escrowResponse.json()
      const escrowListings = escrowData.listings || []

      console.log(`   Found ${escrowListings.length} escrow listing(s) on server`)

      // Mark punks as in escrow
      for (const punk of punks) {
        const listing = escrowListings.find((l: any) => l.punkId === punk.punkId)
        if (listing) {
          punk.inEscrow = true
          punk.listingPrice = BigInt(listing.price)
          console.log(`   ✅ Punk ${punk.punkId.slice(0, 8)} is in escrow (${listing.price} sats)`)
        }
      }
    } catch (error) {
      console.error('Failed to sync escrow state:', error)
    }

    return punks
  } catch (error) {
    console.error('❌ Failed to load punks from database:', error)
    throw error
  }
}

/**
 * Smart punk loading: checks registration status and loads accordingly
 */
async function loadPunksSmartly() {
  console.log('🧠 Smart punk loading started...')

  const wallet = walletConnectRef.value?.getWallet?.()
  if (!wallet?.address) {
    console.log('   No wallet connected, loading from localStorage as fallback')
    await loadPunksFromLocalStorage()
    return
  }

  // IMPORTANT: Use Ark address for database queries (not Bitcoin address)
  const address = wallet.arkadeAddress || wallet.address
  console.log(`   Wallet Ark address: ${address.slice(0, 20)}...`)

  try {
    // Check if wallet is registered in database
    const isRegistered = await checkWalletRegistration(address)
    console.log(`   Registered in database: ${isRegistered}`)

    if (!isRegistered) {
      // First-time user: migrate localStorage → database
      console.log('🆕 First-time user detected - starting migration...')
      const migrationSuccess = await migrateLocalStorageToDatabase(address)

      if (!migrationSuccess) {
        console.warn('⚠️  Migration failed, falling back to localStorage')
        await loadPunksFromLocalStorage()
        return
      }

      console.log('✅ Migration successful!')
    }

    // Load from database (works for both newly registered and existing users)
    const punks = await loadPunksFromDatabase(address)

    // Edge case: If registered but database returned no/few punks, check if localStorage has more
    // This happens when punks were registered without compressed metadata
    if (isRegistered && punks.length === 0) {
      console.warn('⚠️  Registered but no valid punks in database - checking localStorage...')

      // Count punks in localStorage
      const stored = localStorage.getItem('arkade_punks')
      let localPunks = stored ? JSON.parse(stored) : []

      if (localPunks.length === 0) {
        const walletJson = localStorage.getItem('arkade-wallet')
        if (walletJson) {
          const walletData = JSON.parse(walletJson)
          localPunks = walletData.punks || []
        }
      }

      if (localPunks.length > 0) {
        console.log(`📦 Found ${localPunks.length} punks in localStorage - triggering re-migration...`)
        const migrationSuccess = await migrateLocalStorageToDatabase(address)

        if (migrationSuccess) {
          console.log('✅ Re-migration successful, reloading from database...')
          const updatedPunks = await loadPunksFromDatabase(address)
          allPunks.value = updatedPunks
          console.log(`✅ Loaded ${updatedPunks.length} punks from database after re-migration`)
          return
        } else {
          console.warn('⚠️  Re-migration failed, falling back to localStorage')
          await loadPunksFromLocalStorage()
          return
        }
      }
    }

    allPunks.value = punks
    console.log(`✅ Loaded ${punks.length} punks from database`)

    // Clear localStorage punk data after successful database load
    // Database is now the source of truth
    if (localStorage.getItem('arkade_punks')) {
      console.log('🗑️  Clearing stale localStorage punk data...')
      localStorage.removeItem('arkade_punks')
      console.log('✅ localStorage cleared - database is the source of truth')
    }

  } catch (error) {
    console.error('❌ Smart loading failed, falling back to localStorage:', error)
    await loadPunksFromLocalStorage()
  }
}

// Load punks from localStorage WITHOUT filtering (LEGACY - kept for fallback)
// This is needed because syncPunksFromNostr() already handles all ownership logic
async function loadPunksFromLocalStorage() {
  console.log('🔵 loadPunksFromLocalStorage() CALLED')
  try {
    let punks = []

    // First try arkade_punks (Nostr sync format)
    const punksJson = localStorage.getItem('arkade_punks')
    console.log('   arkade_punks exists?', !!punksJson)
    if (punksJson) {
      punks = JSON.parse(punksJson)
      console.log(`📦 Loaded ${punks.length} punks from arkade_punks`)

      // Check if owners are valid - if not, reload from arkade-wallet
      const hasInvalidOwners = punks.length > 0 && punks.some((p: any) => !p.owner)
      if (hasInvalidOwners) {
        console.warn('⚠️ arkade_punks has undefined owners, reloading from arkade-wallet...')
        localStorage.removeItem('arkade_punks')
        punks = []
      }
    }

    // If no punks, try loading from arkade-wallet (imported wallet format)
    console.log('   Checking arkade-wallet... (punks.length:', punks.length, ')')
    if (punks.length === 0) {
      const walletJson = localStorage.getItem('arkade-wallet')
      console.log('   arkade-wallet exists?', !!walletJson)
      if (walletJson) {
        const walletData = JSON.parse(walletJson)
        const walletPunks = walletData.punks || []
        const walletAddress = walletData.address || walletData.wallet?.address

        console.log(`📦 Loaded ${walletPunks.length} punks from arkade-wallet`)

        // Convert wallet punks to app format and set owner
        punks = walletPunks.map((punk: any) => ({
          punkId: punk.punkId,
          owner: walletAddress, // Set owner to wallet address
          metadata: punk.metadata || punk,
          vtxoOutpoint: punk.vtxoOutpoint || `${punk.punkId}:0`,
          mintDate: punk.mintDate,
          inEscrow: punk.inEscrow || false
        }))

        // Save to arkade_punks for future loads
        if (punks.length > 0) {
          localStorage.setItem('arkade_punks', JSON.stringify(punks, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          ))
          console.log(`💾 Saved ${punks.length} punks to arkade_punks`)
        }
      }
    }

    if (punks.length > 0) {
      // Deduplicate by punkId
      const uniquePunksMap = new Map()
      for (const punk of punks) {
        if (!uniquePunksMap.has(punk.punkId)) {
          uniquePunksMap.set(punk.punkId, punk)
        }
      }
      const uniquePunks = Array.from(uniquePunksMap.values())

      // Sync escrow flags from server database
      try {
        console.log('🔄 Syncing escrow state from server...')
        const escrowResponse = await fetch('http://localhost:3001/api/escrow/listings')
        const escrowData = await escrowResponse.json()
        const escrowListings = escrowData.listings || []

        console.log(`   Found ${escrowListings.length} escrow listing(s) on server`)

        // Create set of punk IDs that are in escrow (status: pending or deposited)
        const escrowPunkIds = new Set(
          escrowListings
            .filter((l: any) => l.status === 'deposited' || l.status === 'pending')
            .map((l: any) => l.punk_id)
        )

        console.log(`   ${escrowPunkIds.size} punk(s) currently in escrow`)

        // Update inEscrow flags based on server data
        let updated = false
        uniquePunks.forEach((p: any) => {
          const shouldBeInEscrow = escrowPunkIds.has(p.punkId)
          if (p.inEscrow !== shouldBeInEscrow) {
            console.log(`   ${shouldBeInEscrow ? '🛡️ Marking' : '✅ Unmarking'} punk ${p.punkId?.slice(0, 8)}... as ${shouldBeInEscrow ? 'in escrow' : 'not in escrow'}`)
            p.inEscrow = shouldBeInEscrow
            updated = true
          }
        })

        if (updated) {
          localStorage.setItem('arkade_punks', JSON.stringify(uniquePunks, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          ))
          console.log('✅ Escrow flags synced from server')
        } else {
          console.log('✅ Escrow flags already in sync')
        }
      } catch (error) {
        console.warn('⚠️ Failed to sync escrow state from server:', error)
        // Continue anyway - don't block loading
      }

      // If we found duplicates, clean up localStorage
      if (uniquePunks.length < punks.length) {
        console.warn(`⚠️ Found ${punks.length - uniquePunks.length} duplicate punks in localStorage, cleaning up...`)
        localStorage.setItem('arkade_punks', JSON.stringify(uniquePunks, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ))
      }

      allPunks.value = uniquePunks.map((data: any) => {
        const punk = {
          punkId: data.punkId,
          owner: data.owner || '', // Use owner from localStorage
          // Handle both formats: new (with metadata field) and old (metadata spread at root)
          metadata: data.metadata || data,
          listingPrice: 10000n,
          vtxoOutpoint: data.vtxoOutpoint || `${data.punkId}:0`,
          inEscrow: data.inEscrow || false
        }
        if (data.inEscrow) {
          console.log(`📦 loadPunksFromLocalStorage: Loaded punk ${data.punkId.slice(0, 8)}... with inEscrow=${data.inEscrow}`)
        }
        return punk
      })
      console.log(`✅ loadPunksFromLocalStorage: Set allPunks to ${allPunks.value.length} punks`)
    } else {
      console.log('   No punks found in localStorage')
    }
  } catch (error) {
    console.error('Failed to load punks from localStorage:', error)
  }
}

// Update current wallet address
function updateWalletAddress() {
  // Try to get wallet from WalletConnect component first
  const wallet = walletConnectRef.value?.getWallet?.()

  // Fallback to localStorage if wallet not loaded in component yet
  if (!wallet?.address) {
    try {
      const storedWallet = localStorage.getItem('arkade-wallet')
      if (storedWallet) {
        const walletData = JSON.parse(storedWallet)
        // IMPORTANT: Use Ark address for punk ownership (not Bitcoin address)
        const address = walletData.arkadeAddress || walletData.wallet?.arkadeAddress
        if (address) {
          currentWalletAddress.value = address
          lastLoggedAddress.value = address
          return
        }
      }
    } catch (error) {
      console.warn('Failed to read wallet from localStorage:', error)
    }
  }

  // IMPORTANT: Use Ark address for punk ownership (not Bitcoin address)
  currentWalletAddress.value = wallet?.arkadeAddress || wallet?.address || null
  lastLoggedAddress.value = currentWalletAddress.value
}

// Watch for wallet changes
watch(() => walletConnectRef.value?.getWallet?.()?.address, async (newAddress, oldAddress) => {
  updateWalletAddress()

  // Load punks from database when wallet connects or switches
  if (newAddress && newAddress !== oldAddress) {
    console.log('💡 Wallet connected/changed, loading punks from database...')
    await loadPunksSmartly()
  }
})

// Computed map of punk escrow status (cached to avoid multiple calls)
const punkEscrowStatus = computed(() => {
  const map = new Map<string, boolean>()
  for (const punk of allPunks.value) {
    map.set(punk.punkId, punk.inEscrow === true)
  }
  return map
})

// Check if punk is currently held in escrow
function isPunkInEscrow(punkId: string): boolean {
  return punkEscrowStatus.value.get(punkId) === true
}

// Refresh gallery - reload punks from database (or localStorage for fallback)
async function refreshGallery() {
  try {
    console.log('🔄 Refreshing gallery...')
    await loadPunksSmartly()
    console.log('✅ Gallery refreshed successfully')
    alert(`✅ Gallery refreshed!`)
  } catch (error) {
    console.error('Failed to refresh gallery:', error)
    alert('❌ Failed to refresh gallery. Check console for details.')
  }
}

// Delist a punk from the marketplace (escrow-only)
async function delistPunkFromMarket(punk: PunkState) {
  const wallet = walletConnectRef.value?.getWallet?.()

  if (!wallet) {
    alert('Please connect your wallet first!')
    return
  }

  // Only works for escrow punks
  if (!punk.inEscrow) {
    alert('This punk is not in escrow')
    return
  }

  const confirmed = confirm(`Remove ${punk.metadata.name} from marketplace?`)
  if (!confirmed) return

  try {
    console.log('📦 Cancelling escrow listing...')
    const { cancelEscrowListing } = await import('./utils/escrowApi')
    const arkAddress = wallet.arkadeAddress || ''

    await cancelEscrowListing({
      punkId: punk.punkId,
      sellerAddress: arkAddress
    })

    alert(`✅ ${punk.metadata.name} removed from marketplace!`)
    console.log('✅ Escrow cancelled, collateral returned')

    // Clear escrow flag in localStorage
    const punkIndex = allPunks.value.findIndex(p => p.punkId === punk.punkId)
    if (punkIndex !== -1) {
      allPunks.value[punkIndex].inEscrow = false
      allPunks.value[punkIndex].listingPrice = 0n
      localStorage.setItem('arkade_punks', JSON.stringify(allPunks.value, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ))
      console.log(`✅ Cleared escrow flag for punk ${punk.punkId.slice(0, 8)}...`)
    }

    // Refresh gallery
    await loadPunksSmartly()
  } catch (error: any) {
    console.error('❌ Failed to cancel escrow:', error)
    alert(`Failed to delist punk: ${error?.message || error}`)
  }
}


// List a punk for sale on the marketplace
async function listPunk(punk: PunkState) {
  const wallet = walletConnectRef.value?.getWallet?.()

  if (!wallet) {
    alert('Please connect your wallet first!')
    return
  }

  // Check marketplace reserve requirement
  try {
    const balance = await wallet.getBalance()
    const punksJson = localStorage.getItem('arkade_punks')
    const punks = punksJson ? JSON.parse(punksJson) : []

    // Count punks owned by this wallet (exclude escrowed)
    const ownedPunks = punks.filter((p: any) =>
      p.owner === wallet.address && !p.inEscrow
    )

    // Calculate how many punks can be listed
    const PUNK_VALUE = 10000n
    const sellablePunks = Number(balance.total / PUNK_VALUE)

    // Count punks already in escrow
    const punksInEscrow = punks.filter((p: any) =>
      p.owner === wallet.address && p.inEscrow
    ).length

    // Check if user can list more
    if (punksInEscrow >= sellablePunks) {
      const deficit = (BigInt(ownedPunks.length) * PUNK_VALUE) - balance.total
      alert(
        `❌ Marketplace Reserve Limit\n\n` +
        `You have ${ownedPunks.length} punks but can only list ${sellablePunks} on the marketplace.\n\n` +
        `Why? Each punk requires 10,000 sats reserve.\n` +
        `Your balance: ${balance.total.toLocaleString()} sats\n` +
        `Required for all punks: ${(BigInt(ownedPunks.length) * PUNK_VALUE).toLocaleString()} sats\n` +
        `Missing: ${deficit.toLocaleString()} sats\n\n` +
        `💡 To list more punks, receive ${deficit.toLocaleString()} sats via Lightning or on-chain.`
      )
      return
    }
  } catch (error) {
    console.error('Failed to check marketplace reserve:', error)
    // Continue anyway if check fails
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
      const { compressPunkMetadata, compressedToHex } = await import('./utils/compression')

      // Get escrow pubkey
      const escrowInfo = await getEscrowInfo()
      const escrowPubkey = escrowInfo.escrowPubkey
      console.log('   Escrow pubkey:', escrowPubkey.slice(0, 16) + '...')

      // Compress metadata for buyer recovery (optimization: no Nostr query needed later)
      const compressed = compressPunkMetadata(punk.metadata)
      const compressedMetadata = compressedToHex(compressed)
      console.log(`   Compressed metadata: ${compressedMetadata.length} chars`)

      const escrowListing = await listPunkInEscrow({
        punkId: punk.punkId,
        sellerPubkey: myPubkey,
        sellerArkAddress: arkAddress,
        price: price.toString(),
        punkVtxoOutpoint: punk.vtxoOutpoint,
        compressedMetadata
      })

      escrowAddress = escrowListing.escrowAddress
      console.log('✅ Escrow listing created')
      console.log('   Escrow address:', escrowAddress)

      // Check wallet balance before sending
      const balance = await wallet.getBalance()
      const DEPOSIT_AMOUNT = 10000n

      if (balance.total < DEPOSIT_AMOUNT) {
        alert(
          `❌ Insufficient Balance\n\n` +
          `You need at least ${Number(DEPOSIT_AMOUNT).toLocaleString()} sats to list a punk in escrow.\n\n` +
          `Your balance: ${balance.total.toLocaleString()} sats\n` +
          `Missing: ${(DEPOSIT_AMOUNT - balance.total).toLocaleString()} sats\n\n` +
          `💡 Receive more sats via Lightning or on-chain to list this punk.`
        )
        return
      }

      // Confirm sending deposit to escrow
      const transferConfirm = confirm(
        `🛡️ Escrow Listing Created!\n\n` +
        `Now send ${punk.metadata.name} deposit to the escrow wallet.\n\n` +
        `This will:\n` +
        `• Send ${Number(DEPOSIT_AMOUNT).toLocaleString()} sats to escrow as collateral\n` +
        `• Your punk will show as "🛡️ In Escrow" in your gallery (grayed out)\n` +
        `• Once a buyer pays, the escrow will automatically:\n` +
        `  - Transfer the punk to the buyer\n` +
        `  - Send ${price.toLocaleString()} sats to you\n` +
        `  - Return your ${Number(DEPOSIT_AMOUNT).toLocaleString()} sat deposit\n\n` +
        `Ready to send deposit to escrow?`
      )

      if (!transferConfirm) {
        alert(
          `⚠️ Listing created but deposit not sent to escrow.\n\n` +
          `The listing won't be active until you send the deposit to escrow.`
        )
        return
      }

      // Send deposit to escrow address
      console.log(`📤 Sending ${Number(DEPOSIT_AMOUNT).toLocaleString()} sats deposit to escrow: ${escrowAddress}`)

      try {
        const txid = await wallet.send(escrowAddress, DEPOSIT_AMOUNT)
        console.log(`✅ Deposit sent to escrow! Txid: ${txid}`)

        // The escrow will receive the VTXO at txid:0 (recipient gets vout 0)
        const escrowVtxoOutpoint = `${txid}:0`
        console.log(`   Escrow will receive VTXO at: ${escrowVtxoOutpoint}`)

        // Notify escrow about the VTXO we sent
        console.log('📡 Updating escrow with received VTXO outpoint...')
        const { updateEscrowOutpoint } = await import('./utils/escrowApi')
        await updateEscrowOutpoint(punk.punkId, escrowVtxoOutpoint)
        console.log('✅ Escrow updated successfully')

        alert(
          `✅ Success!\n\n` +
          `${punk.metadata.name} has been listed in escrow.\n\n` +
          `Deposit sent: ${Number(DEPOSIT_AMOUNT).toLocaleString()} sats\n` +
          `Transaction ID: ${txid}\n\n` +
          `Your listing is now active in the marketplace!\n` +
          `The punk will show as "🛡️ In Escrow" (grayed out) in your gallery.\n\n` +
          `When a buyer purchases it, you'll receive ${price.toLocaleString()} sats + your ${Number(DEPOSIT_AMOUNT).toLocaleString()} sat deposit back.`
        )
      } catch (sendError: any) {
        console.error('❌ Failed to send deposit to escrow:', sendError)
        alert(
          `⚠️ Listing created but failed to send deposit to escrow:\n\n` +
          `${sendError?.message || sendError}\n\n` +
          `Please try listing again.`
        )
        return
      }
    }

    // Refresh gallery to update punk state
    console.log('🔄 Refreshing gallery to sync punk state...')
    await loadPunksSmartly()
    console.log('✅ Gallery refreshed')

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
  // Load punks (smart: checks registration and migrates if needed)
  await loadPunksSmartly()
  updateWalletAddress()
  await loadEscrowPubkey()

  // Reload punks when switching wallets
  const walletCheckInterval = setInterval(() => {
    const currentAddress = walletConnectRef.value?.getWallet?.()?.address
    if (currentAddress !== currentWalletAddress.value) {
      updateWalletAddress()
    }
  }, 1000)

  // Auto-refresh punks every 60 seconds (only when tab is visible)
  const punksRefreshInterval = setInterval(async () => {
    if (document.visibilityState === 'visible' && currentView.value === 'gallery') {
      console.log('🔄 Auto-refreshing punks...')
      await loadPunksSmartly()
    }
  }, 60000)

  // Cleanup intervals on unmount
  onBeforeUnmount(() => {
    clearInterval(walletCheckInterval)
    clearInterval(punksRefreshInterval)
  })
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

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.6);
}

.btn-action:disabled:hover {
  transform: none;
  box-shadow: none;
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

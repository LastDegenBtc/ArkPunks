<template>
  <div class="marketplace">
    <h2>Marketplace</h2>
    <p class="subtitle">List and browse ArkPunks</p>

    <!-- Maintenance mode warning -->
    <div v-if="isMaintenanceMode" class="marketplace-notice warning">
      <strong>🔧 MARKETPLACE MAINTENANCE</strong>
      <p>The escrow marketplace is temporarily under maintenance while we upgrade the system.</p>
      <p><strong>Current Status:</strong></p>
      <ul>
        <li>✅ Viewing listings is still available</li>
        <li>⚠️ New listings are disabled</li>
        <li>⚠️ Buying is disabled</li>
        <li>✅ Cancelling your listings is available</li>
      </ul>
      <p><em>We're testing a new system that removes VTXO dependencies. Thank you for your patience!</em></p>
    </div>

    <!-- Marketplace features notice -->
    <div v-if="!isMaintenanceMode" class="marketplace-notice success">
      <strong>🛡️ Escrow Mode Available!</strong> You can now list punks for sale using our secure escrow system.
      Sell your punks even while offline - the server handles everything automatically!
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading listings from escrow...</p>
    </div>

    <div v-else-if="listedPunks.length === 0" class="empty-state">
      <p>No punks for sale yet. Be the first to list one!</p>
    </div>

    <div v-else>
      <!-- Pagination info -->
      <div class="pagination-info">
        <span>{{ paginationText }}</span>
      </div>

      <!-- Grid -->
      <div class="marketplace-grid">
        <div v-for="punk in paginatedPunks" :key="punk.punkId" class="marketplace-card">
        <div class="punk-image">
          <img :src="punk.metadata.imageUrl" :alt="punk.metadata.name" />
          <div v-if="punk.isOfficial" class="official-badge" title="Official ArkPunk">
            ✓
          </div>
        </div>

        <div class="punk-info">
          <h3>{{ punk.metadata.name }}</h3>

          <div class="punk-type">
            <span v-if="punk.metadata.traits?.type" class="badge" :class="`type-${punk.metadata.traits.type.toLowerCase()}`">
              {{ punk.metadata.traits.type }}
            </span>
            <span v-if="punk.isOfficial && punk.officialIndex !== undefined" class="official-index">
              #{{ punk.officialIndex }}
            </span>
            <span v-if="punk.saleMode === 'escrow'" class="sale-mode-badge escrow" title="Escrow Mode - Seller can go offline">
              🛡️ ESCROW
            </span>
            <span v-else class="sale-mode-badge p2p" title="P2P Mode - Direct peer-to-peer">
              🤝 P2P
            </span>
          </div>

          <div v-if="punk.metadata.traits?.attributes" class="punk-attributes">
            <span v-for="attr in punk.metadata.traits.attributes" :key="attr" class="attribute-badge">
              {{ attr }}
            </span>
          </div>

          <div class="punk-seller">
            <small>Seller: {{ formatPubkey(punk.owner) }}</small>
          </div>

          <div class="punk-price">
            <div class="price-info">
              <span class="price-label">Price:</span>
              <span class="price-value">{{ formatSats(punk.listingPrice) }} sats</span>
            </div>
            <div class="fee-info">
              <small>
                + 1% marketplace fee ({{ formatSats(calculateFee(punk.listingPrice, 1)) }} sats)
              </small>
            </div>
          </div>

          <!-- Buy button (escrow mode) or disabled (P2P mode/maintenance) -->
          <div v-if="!isOwnPunk(punk)">
            <button
              v-if="punk.saleMode === 'escrow' && !isMaintenanceMode"
              @click="buyPunk(punk)"
              :disabled="buying || executing"
              class="btn btn-buy"
            >
              {{ buying ? '⏳ Buying...' : executing ? '⚡ Executing...' : '💰 Buy Now' }}
            </button>
            <div v-else-if="isMaintenanceMode" class="buy-disabled-label">
              <span>🔧 Maintenance</span>
              <small>Buying temporarily disabled</small>
            </div>
            <div v-else class="buy-disabled-label">
              <span>💱 P2P mode</span>
              <small>Coming soon</small>
            </div>
          </div>

          <div v-else>
            <!-- Cancel button for escrow listings -->
            <button
              v-if="punk.saleMode === 'escrow'"
              @click="cancelListing(punk)"
              :disabled="cancelling"
              class="btn btn-cancel"
            >
              {{ cancelling ? '⏳ Cancelling...' : '🔴 Cancel Listing' }}
            </button>
            <!-- Own punk label for P2P listings -->
            <div v-else class="own-punk-label">
              <span>🎨 Your punk</span>
            </div>
          </div>
        </div>
        </div>
      </div>

      <!-- Pagination controls -->
      <div class="pagination-controls">
        <button
          @click="previousPage"
          :disabled="currentPage === 1"
          class="btn-pagination"
        >
          ← Previous
        </button>

        <div class="page-numbers">
          <button
            v-for="page in visiblePages"
            :key="page"
            @click="goToPage(page)"
            :class="['btn-page', { active: page === currentPage }]"
            :disabled="page === '...'"
          >
            {{ page }}
          </button>
        </div>

        <button
          @click="nextPage"
          :disabled="currentPage === totalPages"
          class="btn-pagination"
        >
          Next →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue'
import type { ArkadeWalletInterface } from '@/utils/arkadeWallet'
import { delistPunk } from '@/utils/marketplaceUtils'
import { buyPunkFromEscrow, executeEscrowSwap, cancelEscrowListing } from '@/utils/escrowApi'
import { decompressPunkMetadata, hexToCompressed } from '@/utils/compression'
import { generatePunkImage, generatePunkMetadata } from '@/utils/generator'
import { getPublicKey } from 'nostr-tools'
import { hex } from '@scure/base'

// API URL - Use local server for development, or window.location.origin for production
const API_URL = import.meta.env.VITE_API_URL || ''

// Maintenance mode - set to true to enable maintenance banner
const isMaintenanceMode = import.meta.env.VITE_MARKETPLACE_MAINTENANCE === 'true'

const wallet = inject<() => ArkadeWalletInterface | null>('getWallet')
const reloadPunks = inject<(() => Promise<void>) | undefined>('reloadPunks')

interface MarketplaceListing {
  punkId: string
  owner: string // Nostr pubkey
  ownerArkAddress: string // Arkade address for payment
  listingPrice: bigint
  metadata: any
  vtxoOutpoint: string
  isOfficial: boolean
  officialIndex?: number
  saleMode?: 'escrow' | 'p2p'
  escrowAddress?: string
}

const listedPunks = ref<MarketplaceListing[]>([])
const loading = ref(true)
const buying = ref(false)
const executing = ref(false)
const cancelling = ref(false)

// Pagination
const currentPage = ref(1)
const itemsPerPage = 24

function calculateFee(price: bigint, feePercent: number = 1): bigint {
  // Convert fee percent to basis points (0.5% = 50 basis points)
  const basisPoints = Math.floor(feePercent * 100)
  return (price * BigInt(basisPoints)) / 10000n
}

function calculateTotal(price: bigint, feePercent: number = 1): bigint {
  return price + calculateFee(price, feePercent)
}

function formatPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`
}

function formatSats(sats: bigint): string {
  return sats.toLocaleString()
}

function isOwnPunk(punk: MarketplaceListing): boolean {
  // Compare Nostr pubkeys instead of Bitcoin addresses
  const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
  if (!privateKeyHex) return false

  const myPubkey = getPublicKey(hex.decode(privateKeyHex))
  return myPubkey === punk.owner
}

// Pagination computed properties
const totalPages = computed(() => {
  return Math.ceil(listedPunks.value.length / itemsPerPage)
})

const paginatedPunks = computed(() => {
  // Sort by price (lowest first)
  const sorted = [...listedPunks.value].sort((a, b) => {
    const priceA = Number(a.price)
    const priceB = Number(b.price)
    return priceA - priceB
  })
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return sorted.slice(start, end)
})

const paginationText = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage + 1
  const end = Math.min(currentPage.value * itemsPerPage, listedPunks.value.length)
  return `Showing ${start}-${end} of ${listedPunks.value.length} punks`
})

const visiblePages = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const pages: (number | string)[] = []

  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // Always show first page
    pages.push(1)

    if (current > 3) {
      pages.push('...')
    }

    // Show pages around current page
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)

    for (let i = start; i <= end; i++) {
      pages.push(i)
    }

    if (current < total - 2) {
      pages.push('...')
    }

    // Always show last page
    pages.push(total)
  }

  return pages
})

// Pagination functions
function goToPage(page: number | string) {
  if (typeof page === 'number') {
    currentPage.value = page
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

async function loadListings() {
  loading.value = true
  try {
    console.log('📋 Loading listings from escrow database...')

    // Get all active listings from escrow database
    const response = await fetch(`${API_URL}/api/escrow/listings`)
    if (!response.ok) {
      throw new Error(`Failed to fetch listings: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch listings')
    }

    console.log(`✅ Loaded ${data.listings.length} active listings from marketplace server`)

    // Convert escrow listings to marketplace format
    const listings: MarketplaceListing[] = []

    for (const listing of data.listings) {
      // Decompress metadata from database (same as gallery does)
      let metadata
      try {
        if (listing.compressedMetadata) {
          // Use compressed metadata from database
          // Convert hex string to bytes first, then decompress
          const compressedBytes = hexToCompressed(listing.compressedMetadata)
          metadata = decompressPunkMetadata(compressedBytes, listing.punkId)
          console.log(`✅ Decompressed metadata for punk #${listing.punkId.slice(0, 8)}`)
        } else {
          // Fallback: generate from punkId if no compressed metadata
          metadata = generatePunkMetadata(listing.punkId)
          console.log(`⚠️  Generated metadata from punkId for #${listing.punkId.slice(0, 8)} (no compressed data)`)
        }
      } catch (error) {
        console.warn(`Failed to process metadata for punk ${listing.punkId}:`, error)
        continue // Skip this listing if metadata can't be generated
      }

      listings.push({
        punkId: listing.punkId,
        owner: listing.sellerPubkey,
        ownerArkAddress: listing.seller,
        listingPrice: BigInt(listing.price),
        vtxoOutpoint: listing.punkVtxoOutpoint,
        saleMode: 'escrow',
        escrowAddress: listing.escrowAddress,
        metadata,
        isOfficial: !!listing.serverSignature, // Official if server signature exists
        officialIndex: undefined
      })
    }

    listedPunks.value = listings
    console.log(`📊 Final marketplace listings: ${listings.length}`)

    // Reset to page 1 when listings are reloaded
    currentPage.value = 1
  } catch (error) {
    console.error('Failed to load marketplace listings:', error)
  } finally {
    loading.value = false
  }
}

/**
 * Buy a punk using escrow system
 * The server handles the atomic swap automatically
 */
async function buyPunk(punk: MarketplaceListing) {
  const currentWallet = wallet?.()
  if (!currentWallet) {
    alert('Please connect your wallet first!')
    return
  }

  if (isOwnPunk(punk)) {
    alert('You cannot buy your own punk!')
    return
  }

  // Only escrow mode is supported for now
  if (punk.saleMode !== 'escrow') {
    alert('P2P mode is not yet available. Only escrow purchases are supported.')
    return
  }

  if (!punk.escrowAddress) {
    alert('Escrow address not found for this listing.')
    return
  }

  const fee = calculateFee(punk.listingPrice)
  const total = calculateTotal(punk.listingPrice)

  const confirmed = confirm(
    `🛡️ Buy ${punk.metadata.name} via Escrow?\n\n` +
    `Price: ${formatSats(punk.listingPrice)} sats\n` +
    `Marketplace fee (1%): ${formatSats(fee)} sats\n` +
    `Total: ${formatSats(total)} sats\n\n` +
    `How it works:\n` +
    `1. You send payment to escrow address\n` +
    `2. Server automatically transfers punk to you\n` +
    `3. Server pays seller (minus 1% fee)\n\n` +
    `Continue?`
  )

  if (!confirmed) return

  buying.value = true

  try {
    console.log('🔐 Starting escrow purchase...')

    // Check balance
    const balance = await currentWallet.getBalance()
    if (balance.available < Number(total)) {
      throw new Error(
        `Insufficient balance.\n\n` +
        `Need: ${formatSats(total)} sats\n` +
        `Have: ${balance.available.toLocaleString()} sats`
      )
    }

    // Get user's Nostr pubkey and Arkade address
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      throw new Error('Wallet private key not found')
    }

    const buyerPubkey = getPublicKey(hex.decode(privateKeyHex))
    const buyerArkAddress = currentWallet.arkadeAddress

    if (!buyerArkAddress) {
      throw new Error('Arkade address not available')
    }

    // Initiate escrow purchase
    console.log(`📋 Requesting purchase for punk ${punk.punkId}`)
    const purchaseResponse = await buyPunkFromEscrow({
      punkId: punk.punkId,
      buyerPubkey,
      buyerArkAddress
    })

    console.log('✅ Purchase instructions received:', purchaseResponse)

    // Send payment to escrow address
    console.log(`💰 Sending ${formatSats(total)} sats to escrow: ${purchaseResponse.escrowAddress}`)
    const txid = await currentWallet.send(purchaseResponse.escrowAddress, total)

    console.log(`✅ Payment sent! TXID: ${txid}`)

    // Now execute the swap with retry logic
    console.log('⚡ Executing atomic swap...')

    const executeConfirm = confirm(
      `✅ Payment sent!\n\n` +
      `Now we'll execute the atomic swap.\n\n` +
      `The server will:\n` +
      `1. Verify both deposits (seller's punk + your payment)\n` +
      `2. Transfer the punk to you\n` +
      `3. Pay the seller (minus 1% fee)\n\n` +
      `This may take a few seconds...\n\n` +
      `Ready to execute?`
    )

    if (!executeConfirm) {
      alert(
        `Payment was sent but swap not executed.\n\n` +
        `You can execute it later from the marketplace page.`
      )
      await loadListings()
      return
    }

    // Execute the swap with retry logic
    executing.value = true
    const MAX_RETRIES = 5
    const RETRY_DELAY = 2000 // 2 seconds

    try {
      let lastError: any = null

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`🔄 Calling execute endpoint (attempt ${attempt}/${MAX_RETRIES})...`)

          const executeResponse = await executeEscrowSwap({
            punkId: punk.punkId,
            buyerPubkey,
            buyerArkAddress
          })

          console.log('✅ Swap executed:', executeResponse)

          alert(
            `🎉 Purchase complete!\n\n` +
            `${punk.metadata.name} is now yours!\n\n` +
            `Payment Transfer: ${executeResponse.paymentTxid.slice(0, 16)}...\n\n` +
            `Seller will send you the punk VTXO shortly.\n` +
            `Refresh the page to see your new punk!`
          )

          // Reload listings and gallery
          await loadListings()
          if (reloadPunks) {
            await reloadPunks()
          }

          return // Success - exit the function

        } catch (executeError: any) {
          lastError = executeError
          console.warn(`⚠️ Attempt ${attempt}/${MAX_RETRIES} failed:`, executeError.message)

          // If this is the last attempt, throw the error
          if (attempt === MAX_RETRIES) {
            throw executeError
          }

          // Wait before retrying
          console.log(`⏳ Waiting ${RETRY_DELAY/1000}s before retry...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      }

    } catch (executeError: any) {
      console.error('❌ Failed to execute swap after retries:', executeError)

      // Check if it's a "deposits not complete" error
      const isDepositError = executeError?.message?.includes('Deposits not complete')

      const retry = confirm(
        `⚠️ Swap execution failed:\n\n` +
        `${executeError?.message || executeError}\n\n` +
        `${isDepositError ?
          'Your payment may still be processing on Arkade.\n' +
          'Typically takes 1-5 seconds.\n\n' :
          'There may be an issue with the escrow.\n\n'
        }` +
        `Your payment (${formatSats(total)} sats) is safe in escrow.\n\n` +
        `Would you like to try again?`
      )

      if (retry) {
        // Recursive call - try the whole process again
        executing.value = false
        buying.value = false
        await buyPunk(punk)
        return
      }

      alert(
        `Don't worry - your funds are safe!\n\n` +
        `Your payment is held in escrow.\n` +
        `You can try executing the swap again from the marketplace.\n\n` +
        `If the problem persists, contact support with:\n` +
        `Punk ID: ${punk.punkId.slice(0, 16)}...\n` +
        `Payment TXID: ${txid.slice(0, 16)}...`
      )

      await loadListings()
    } finally {
      executing.value = false
    }

  } catch (error: any) {
    console.error('❌ Failed to buy punk:', error)
    alert(`Purchase failed:\n\n${error?.message || error}`)
  } finally {
    buying.value = false
  }
}

/**
 * Cancel an escrow listing and return the punk to seller
 */
async function cancelListing(punk: MarketplaceListing) {
  const currentWallet = wallet?.()
  if (!currentWallet) {
    alert('Please connect your wallet first!')
    return
  }

  if (!isOwnPunk(punk)) {
    alert('You can only cancel your own listings!')
    return
  }

  if (punk.saleMode !== 'escrow') {
    alert('Only escrow listings can be cancelled.')
    return
  }

  const confirmed = confirm(
    `Cancel listing for ${punk.metadata.name}?\n\n` +
    `Your punk will be returned to your wallet.\n\n` +
    `Continue?`
  )

  if (!confirmed) return

  cancelling.value = true

  try {
    console.log('🔴 Cancelling escrow listing...')

    // Get seller credentials
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (!privateKeyHex) {
      throw new Error('Wallet private key not found')
    }

    const sellerPubkey = getPublicKey(hex.decode(privateKeyHex))
    const sellerArkAddress = currentWallet.arkadeAddress

    if (!sellerArkAddress) {
      throw new Error('Arkade address not available')
    }

    // Cancel the listing
    const response = await cancelEscrowListing({
      punkId: punk.punkId,
      sellerAddress: sellerArkAddress
    })

    console.log('✅ Listing cancelled:', response)

    alert(
      `✅ Listing cancelled!\n\n` +
      `${response.message}\n\n` +
      `${response.txid ? `Transfer TXID: ${response.txid.slice(0, 16)}...\n\n` : ''}` +
      `Refresh the page to see your punk back in your gallery!`
    )

    // Reload listings and gallery
    await loadListings()
    if (reloadPunks) {
      await reloadPunks()
    }

  } catch (error: any) {
    console.error('❌ Failed to cancel listing:', error)

    // If listing not found in escrow, offer to delist from Nostr
    if (error?.message?.includes('Listing not found')) {
      const delistConfirm = confirm(
        `Escrow listing not found in system.\n\n` +
        `This can happen if the listing wasn't properly saved.\n\n` +
        `Would you like to delist this punk from Nostr?\n` +
        `This will remove it from the marketplace.`
      )

      if (delistConfirm) {
        try {
          const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
          if (!privateKeyHex) throw new Error('Wallet private key not found')

          console.log('📤 Delisting punk from Nostr...')
          await delistPunk(punk.punkId, privateKeyHex)

          alert(
            `✅ Punk delisted from Nostr!\n\n` +
            `The punk should disappear from the marketplace shortly.\n\n` +
            `Refresh the page to see the change.`
          )

          await loadListings()
          if (reloadPunks) await reloadPunks()

        } catch (delistError: any) {
          console.error('❌ Failed to delist from Nostr:', delistError)
          alert(`Failed to delist:\n\n${delistError?.message || delistError}`)
        }
      }
    } else {
      alert(`Cancellation failed:\n\n${error?.message || error}`)
    }
  } finally {
    cancelling.value = false
  }
}

onMounted(() => {
  loadListings()
})
</script>

<style scoped>
.marketplace {
  max-width: 1200px;
  margin: 0 auto;
}

h2 {
  font-size: 36px;
  margin: 0 0 8px 0;
  color: #fff;
}

.subtitle {
  color: #888;
  margin: 0 0 32px 0;
  font-size: 18px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #888;
}

.spinner {
  width: 50px;
  height: 50px;
  margin: 0 auto 20px;
  border: 4px solid #333;
  border-top-color: #ff6b35;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.marketplace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.marketplace-card {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
}

.marketplace-card:hover {
  border-color: #ff6b35;
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.punk-image {
  width: 100%;
  aspect-ratio: 1;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
  position: relative;
}

.punk-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.official-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.punk-info h3 {
  margin: 0 0 8px 0;
  color: #fff;
  font-size: 18px;
}

.punk-type {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.official-index {
  display: inline-block;
  padding: 3px 6px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid #10b981;
  border-radius: 3px;
  font-size: 10px;
  color: #10b981;
  font-weight: bold;
}

.sale-mode-badge {
  display: inline-block;
  padding: 3px 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
}

.sale-mode-badge.escrow {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid #3b82f6;
  color: #3b82f6;
}

.sale-mode-badge.p2p {
  background: rgba(168, 85, 247, 0.2);
  border: 1px solid #a855f7;
  color: #a855f7;
}

.type-alien { background: #88ff88; color: #000; }
.type-ape { background: #8b4513; color: #fff; }
.type-zombie { background: #88cc88; color: #000; }
.type-male { background: #4a9eff; color: #fff; }
.type-female { background: #ff69b4; color: #fff; }

.punk-attributes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.attribute-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: #333;
  color: #aaa;
  border-radius: 3px;
}

.punk-seller {
  margin-bottom: 12px;
  color: #888;
  font-size: 12px;
}

.punk-price {
  background: #2a2a2a;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.price-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.price-label {
  color: #aaa;
  font-size: 12px;
}

.price-value {
  color: #ff6b35;
  font-weight: bold;
  font-size: 16px;
}

.fee-info {
  color: #666;
  font-size: 11px;
  text-align: right;
}

.btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-buy {
  background: #10b981;
  color: #fff;
}

.btn-buy:hover:not(:disabled) {
  background: #059669;
}

.btn-cancel {
  background: #ef4444;
  color: #fff;
}

.btn-cancel:hover:not(:disabled) {
  background: #dc2626;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.own-punk-label {
  text-align: center;
  padding: 12px;
  background: rgba(255, 107, 53, 0.1);
  border: 2px solid #ff6b35;
  border-radius: 6px;
  color: #ff6b35;
  font-size: 14px;
  font-weight: 600;
}

.marketplace-notice {
  background: rgba(255, 193, 7, 0.1);
  border: 2px solid #ffc107;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  color: #ffc107;
  text-align: center;
}

.marketplace-notice.success {
  background: rgba(16, 185, 129, 0.1);
  border-color: #10b981;
  color: #10b981;
}

.marketplace-notice.warning {
  background: rgba(239, 68, 68, 0.1);
  border-color: #ef4444;
  color: #ef4444;
  text-align: left;
}

.marketplace-notice.warning ul {
  margin: 12px 0;
  padding-left: 20px;
}

.marketplace-notice.warning li {
  margin: 6px 0;
}

.marketplace-notice.warning p {
  margin: 8px 0;
}

.marketplace-notice.warning em {
  color: #ff8888;
}

.marketplace-notice strong {
  display: block;
  margin-bottom: 4px;
  font-size: 16px;
}

.buy-disabled-label {
  text-align: center;
  padding: 12px;
  background: rgba(136, 136, 136, 0.1);
  border: 2px solid #666;
  border-radius: 6px;
  color: #888;
  font-size: 14px;
  font-weight: 600;
}

.buy-disabled-label span {
  display: block;
  margin-bottom: 4px;
}

.buy-disabled-label small {
  font-size: 11px;
  color: #666;
  font-weight: normal;
}

/* Pagination */
.pagination-info {
  margin-bottom: 16px;
  color: #888;
  font-size: 14px;
  text-align: center;
}

.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
  padding: 24px 0;
}

.btn-pagination {
  padding: 10px 20px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-pagination:hover:not(:disabled) {
  background: #333;
  border-color: #ff6b35;
  transform: translateY(-2px);
}

.btn-pagination:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-numbers {
  display: flex;
  gap: 8px;
}

.btn-page {
  min-width: 40px;
  height: 40px;
  padding: 8px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-page:hover:not(:disabled):not(.active) {
  background: #333;
  border-color: #ff6b35;
}

.btn-page.active {
  background: #ff6b35;
  border-color: #ff6b35;
  color: #fff;
}

.btn-page:disabled {
  cursor: default;
  opacity: 0.5;
  background: transparent;
  border-color: transparent;
}

@media (max-width: 768px) {
  .pagination-controls {
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn-pagination {
    padding: 8px 16px;
    font-size: 12px;
  }

  .btn-page {
    min-width: 36px;
    height: 36px;
    font-size: 12px;
  }
}
</style>

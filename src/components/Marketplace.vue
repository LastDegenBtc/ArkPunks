<template>
  <div class="marketplace">
    <h2>Marketplace</h2>
    <p class="subtitle">Buy and sell ArkPunks</p>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading listings from Nostr...</p>
    </div>

    <div v-else-if="listedPunks.length === 0" class="empty-state">
      <p>No punks for sale yet. Be the first to list one!</p>
    </div>

    <div v-else class="marketplace-grid">
      <div v-for="punk in listedPunks" :key="punk.punkId" class="marketplace-card">
        <div class="punk-image">
          <img :src="punk.metadata.imageUrl" :alt="punk.metadata.name" />
          <div v-if="punk.isOfficial" class="official-badge" title="Official ArkPunk - First 1000 on relay.damus.io">
            ✓ OFFICIAL
          </div>
        </div>

        <div class="punk-info">
          <h3>{{ punk.metadata.name }}</h3>

          <div class="punk-type">
            <span class="badge" :class="`type-${punk.metadata.traits.type.toLowerCase()}`">
              {{ punk.metadata.traits.type }}
            </span>
            <span v-if="punk.isOfficial && punk.officialIndex !== undefined" class="official-index">
              #{{ punk.officialIndex }}
            </span>
          </div>

          <div class="punk-attributes">
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
              <small>+ 1% marketplace fee ({{ formatSats(calculateFee(punk.listingPrice)) }} sats)</small>
            </div>
          </div>

          <button
            v-if="!isOwnPunk(punk)"
            @click="buyPunk(punk)"
            :disabled="buying"
            class="btn btn-buy"
          >
            {{ buying ? 'Processing...' : `Buy for ${formatSats(calculateTotal(punk.listingPrice))} sats` }}
          </button>

          <div v-else class="own-punk-label">
            <span>🎨 Your punk</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject, computed } from 'vue'
import type { ArkadeWalletInterface } from '@/utils/arkadeWallet'
import { getMarketplaceListings, publishPunkSold } from '@/utils/marketplaceUtils'
import { getOfficialPunksList } from '@/utils/officialPunkValidator'
import { getPublicKey } from 'nostr-tools'
import { hex } from '@scure/base'

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
}

const listedPunks = ref<MarketplaceListing[]>([])
const loading = ref(true)
const buying = ref(false)

// 1% marketplace fee
const MARKETPLACE_FEE_PERCENT = 1

function calculateFee(price: bigint): bigint {
  return (price * BigInt(MARKETPLACE_FEE_PERCENT)) / 100n
}

function calculateTotal(price: bigint): bigint {
  return price + calculateFee(price)
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

async function loadListings() {
  loading.value = true
  try {
    // Get all listed punks from Nostr
    const listings = await getMarketplaceListings()

    // Get official punks list
    const { punkIds: officialIds } = await getOfficialPunksList()
    const officialMap = new Map<string, number>()
    officialIds.forEach((id, index) => {
      officialMap.set(id, index)
    })

    // Add official status to listings
    listedPunks.value = listings.map(listing => ({
      ...listing,
      isOfficial: officialMap.has(listing.punkId),
      officialIndex: officialMap.get(listing.punkId)
    }))
  } catch (error) {
    console.error('Failed to load marketplace listings:', error)
  } finally {
    loading.value = false
  }
}

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

  const total = calculateTotal(punk.listingPrice)
  const fee = calculateFee(punk.listingPrice)

  const confirmed = confirm(
    `Buy ${punk.metadata.name}?\n\n` +
    `Price: ${formatSats(punk.listingPrice)} sats\n` +
    `Marketplace fee (1%): ${formatSats(fee)} sats\n` +
    `Total: ${formatSats(total)} sats\n\n` +
    `This will transfer the punk to your wallet off-chain.`
  )

  if (!confirmed) return

  buying.value = true

  try {
    // Check balance
    const balance = await currentWallet.getBalance()

    if (balance.available < Number(total)) {
      throw new Error(`Insufficient balance. You need ${formatSats(total)} sats but only have ${balance.available.toLocaleString()} sats available.`)
    }

    // Send payment to seller via Arkade off-chain transfer
    const txid = await currentWallet.send(
      punk.ownerArkAddress,
      total
    )

    // Publish "punk sold" event to Nostr to remove from marketplace
    const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
    if (privateKeyHex) {
      try {
        await publishPunkSold(punk.punkId, punk.owner, txid, privateKeyHex)
      } catch (publishError) {
        console.error('Failed to publish sold event:', publishError)
        // Don't fail the entire purchase if sold event fails
      }
    }

    // Update punk ownership in localStorage
    const punksJson = localStorage.getItem('arkade_punks')
    if (punksJson) {
      const punks = JSON.parse(punksJson)
      const punkIndex = punks.findIndex((p: any) => p.punkId === punk.punkId)

      if (punkIndex !== -1) {
        // Update existing punk owner
        punks[punkIndex].owner = currentWallet.address
      } else {
        // Add punk to buyer's collection
        punks.push({
          punkId: punk.punkId,
          owner: currentWallet.address,
          ...punk.metadata,
          vtxoOutpoint: punk.vtxoOutpoint
        })
      }

      localStorage.setItem('arkade_punks', JSON.stringify(punks))
    } else {
      // First punk for this wallet
      const punks = [{
        punkId: punk.punkId,
        owner: currentWallet.address,
        ...punk.metadata,
        vtxoOutpoint: punk.vtxoOutpoint
      }]
      localStorage.setItem('arkade_punks', JSON.stringify(punks))
    }

    // Reload listings to remove purchased punk
    await loadListings()

    // Reload user's punk gallery
    if (reloadPunks) {
      await reloadPunks()
    }

    alert(
      `✅ Purchase successful!\n\n` +
      `${punk.metadata.name} is now in your gallery!\n` +
      `Transaction ID: ${txid.slice(0, 16)}...`
    )

  } catch (error: any) {
    console.error('❌ Failed to buy punk:', error)
    alert(`Failed to buy punk: ${error?.message || error}`)
  } finally {
    buying.value = false
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
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
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
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
</style>

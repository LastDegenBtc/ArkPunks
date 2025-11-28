<template>
  <div class="stats-container">
    <h2>Market Statistics</h2>
    <p class="subtitle">Live ArkPunks marketplace data</p>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading market data from escrow...</p>
    </div>

    <!-- Stats Grid -->
    <div v-else class="stats-grid">
      <!-- Floor Price -->
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-label">Floor Price</div>
          <div class="stat-value">{{ formatSats(stats.floorPrice) }}</div>
          <div class="stat-hint">Lowest listed price</div>
        </div>
      </div>

      <!-- Highest Sale -->
      <div class="stat-card">
        <div class="stat-icon">🏆</div>
        <div class="stat-content">
          <div class="stat-label">Highest Sale</div>
          <div class="stat-value">{{ formatSats(stats.highestSale) }}</div>
          <div class="stat-hint">All-time high</div>
        </div>
      </div>

      <!-- Total Volume -->
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <div class="stat-label">Total Volume</div>
          <div class="stat-value">{{ formatSats(stats.totalVolume) }}</div>
          <div class="stat-hint">{{ stats.totalSales }} sales</div>
        </div>
      </div>

      <!-- Average Price -->
      <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-content">
          <div class="stat-label">Average Sale</div>
          <div class="stat-value">{{ formatSats(stats.averagePrice) }}</div>
          <div class="stat-hint">Mean sale price</div>
        </div>
      </div>
    </div>

    <!-- Sales History -->
    <div v-if="!loading" class="sales-history">
      <div class="section-header">
        <h3>Recent Sales</h3>
        <button @click="refreshStats" class="btn-refresh" :disabled="refreshing">
          {{ refreshing ? '🔄 Refreshing...' : '🔄 Refresh' }}
        </button>
      </div>

      <div v-if="recentSales.length === 0" class="empty-state">
        <p>No sales yet. Be the first to buy an ArkPunk!</p>
      </div>

      <div v-else class="sales-table">
        <div class="table-header">
          <div class="col-punk">Punk</div>
          <div class="col-price">Price</div>
          <div class="col-buyer">Buyer</div>
          <div class="col-time">Time</div>
        </div>

        <div
          v-for="sale in recentSales"
          :key="sale.id"
          class="table-row"
        >
          <div class="col-punk">
            <div class="punk-info">
              <div class="punk-id clickable" @click="viewPunk(sale.punkId)">
                {{ sale.punkId.slice(0, 8) }}...
              </div>
              <div v-if="sale.punkIndex !== undefined" class="punk-number">
                #{{ sale.punkIndex }}
              </div>
            </div>
          </div>
          <div class="col-price">
            <span class="price-badge">{{ formatSats(sale.price) }}</span>
          </div>
          <div class="col-buyer">
            <span class="address-short" :title="sale.buyer">
              {{ shortenAddress(sale.buyer) }}
            </span>
          </div>
          <div class="col-time">
            <span class="time-ago">{{ formatTimeAgo(sale.timestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="recentSales.length > 0 && totalSalesCount > salesPerPage" class="pagination">
        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          class="btn-page"
        >
          ← Previous
        </button>
        <span class="page-info">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <button
          @click="nextPage"
          :disabled="currentPage === totalPages"
          class="btn-page"
        >
          Next →
        </button>
      </div>
    </div>

    <!-- Punk Detail Modal -->
    <div v-if="selectedPunk" class="modal-overlay" @click="closePunkModal">
      <div class="modal-content" @click.stop>
        <button class="modal-close" @click="closePunkModal">×</button>

        <div class="punk-detail">
          <div class="punk-image-large">
            <img :src="selectedPunk.imageUrl" :alt="selectedPunk.name" />
          </div>

          <div class="punk-info-detail">
            <h3>{{ selectedPunk.name }}</h3>

            <div class="punk-type-badge" :class="`type-${selectedPunk.traits.type.toLowerCase()}`">
              {{ selectedPunk.traits.type }}
            </div>

            <div class="punk-attributes">
              <h4>Attributes:</h4>
              <div class="attributes-list">
                <span
                  v-for="attr in selectedPunk.traits.attributes"
                  :key="attr"
                  class="attr-badge"
                >
                  {{ attr }}
                </span>
              </div>
            </div>

            <div class="punk-details-grid">
              <div class="detail-item">
                <span class="detail-label">Punk ID:</span>
                <span class="detail-value">{{ selectedPunkId.slice(0, 16) }}...</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Rarity Score:</span>
                <span class="detail-value">{{ calculateRarity(selectedPunk) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { decompressPunkMetadata } from '@/utils/compression'
import { generatePunkImage, calculateRarityScore } from '@/utils/generator'
import type { PunkMetadata } from '@/types/punk'

// API URL - Use local server for development, or window.location.origin for production
const API_URL = import.meta.env.VITE_API_URL || ''

interface Sale {
  id: string
  punkId: string
  punkIndex?: number
  price: bigint
  buyer: string
  seller: string
  timestamp: number
  compressedMetadata?: string // Compressed punk metadata (hex)
}

interface MarketStats {
  floorPrice: bigint
  highestSale: bigint
  totalVolume: bigint
  totalSales: number
  averagePrice: bigint
}

const loading = ref(true)
const refreshing = ref(false)
const currentPage = ref(1)
const salesPerPage = 20

const recentSales = ref<Sale[]>([])
const allSales = ref<Sale[]>([])
const stats = ref<MarketStats>({
  floorPrice: 0n,
  highestSale: 0n,
  totalVolume: 0n,
  totalSales: 0,
  averagePrice: 0n
})

// Modal state
const selectedPunk = ref<PunkMetadata | null>(null)
const selectedPunkId = ref('')

const totalSalesCount = computed(() => allSales.value.length)
const totalPages = computed(() => Math.ceil(totalSalesCount.value / salesPerPage))

const paginatedSales = computed(() => {
  const start = (currentPage.value - 1) * salesPerPage
  const end = start + salesPerPage
  return allSales.value.slice(start, end)
})

function formatSats(sats: bigint): string {
  if (sats === 0n) return '—'
  const num = Number(sats)
  if (num >= 100000000) {
    return `₿ ${(num / 100000000).toFixed(2)}`
  }
  return `${num.toLocaleString()} sats`
}

function shortenAddress(address: string): string {
  if (address.length <= 16) return address
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    recentSales.value = paginatedSales.value
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    recentSales.value = paginatedSales.value
  }
}

async function loadStats() {
  try {
    loading.value = true
    console.log('📊 Loading market statistics from marketplace server...')

    // Fetch sales history and stats from marketplace server
    const response = await fetch(`${API_URL}/api/marketplace/sales`)
    if (!response.ok) {
      throw new Error(`Failed to fetch sales: ${response.statusText}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch sales')
    }

    // Convert API sales to internal format
    const sales: Sale[] = data.sales.map((s: any) => ({
      id: s.punkId,
      punkId: s.punkId,
      price: BigInt(s.price),
      buyer: s.buyer,
      seller: s.seller,
      timestamp: s.timestamp,
      compressedMetadata: s.compressedMetadata
    }))

    allSales.value = sales
    recentSales.value = paginatedSales.value

    // Convert API stats to internal format
    stats.value = {
      floorPrice: BigInt(data.stats.floorPrice),
      highestSale: BigInt(data.stats.highestSale),
      totalVolume: BigInt(data.stats.totalVolume),
      totalSales: data.stats.totalSales,
      averagePrice: BigInt(data.stats.averagePrice)
    }

    console.log('✅ Market stats loaded from escrow:')
    console.log('   Floor:', formatSats(stats.value.floorPrice))
    console.log('   Highest:', formatSats(stats.value.highestSale))
    console.log('   Volume:', formatSats(stats.value.totalVolume))
    console.log('   Sales:', stats.value.totalSales)

  } catch (error) {
    console.error('Failed to load market stats:', error)
  } finally {
    loading.value = false
  }
}

async function refreshStats() {
  refreshing.value = true
  await loadStats()
  refreshing.value = false
}

async function viewPunk(punkId: string) {
  try {
    console.log('📷 Loading punk details:', punkId.slice(0, 16) + '...')

    // First, try to find punk in localStorage (local gallery)
    const punksJson = localStorage.getItem('arkade_punks')
    if (punksJson) {
      try {
        const localPunks = JSON.parse(punksJson)
        const localPunk = localPunks.find((p: any) => p.punkId === punkId)

        if (localPunk && localPunk.metadata) {
          console.log('✅ Found punk in local gallery')

          // Generate image from local metadata
          const imageUrl = generatePunkImage(
            localPunk.metadata.traits.type,
            localPunk.metadata.traits.attributes,
            localPunk.metadata.traits.background
          )

          selectedPunk.value = {
            ...localPunk.metadata,
            imageUrl
          }
          selectedPunkId.value = punkId
          console.log('✅ Punk loaded from localStorage:', localPunk.metadata.name)
          return
        }
      } catch (err) {
        console.warn('Failed to parse localStorage punks:', err)
      }
    }

    // Second fallback: Use compressed metadata from sales history (escrow)
    const sale = allSales.value.find(s => s.punkId === punkId)

    if (sale && sale.compressedMetadata) {

      // Convert compressed hex to Uint8Array
      const compressedData = new Uint8Array(
        sale.compressedMetadata.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      )

      // Decompress metadata
      const metadata = decompressPunkMetadata({ data: compressedData }, punkId)

      // Generate image URL from traits
      const imageUrl = generatePunkImage(
        metadata.traits.type,
        metadata.traits.attributes,
        metadata.traits.background
      )

      selectedPunk.value = {
        ...metadata,
        imageUrl
      }
      selectedPunkId.value = punkId

      console.log('✅ Punk loaded from escrow sales:', metadata.name)
      return
    }

    // No metadata found anywhere
    console.error('❌ Could not find punk metadata in localStorage or sales history')
    alert('Unable to load punk details. The punk data is not available.')

  } catch (error) {
    console.error('Failed to load punk details:', error)
    alert('Unable to load punk details. An error occurred while fetching the data.')
  }
}

function closePunkModal() {
  selectedPunk.value = null
  selectedPunkId.value = ''
}

function calculateRarity(punk: PunkMetadata): number {
  return calculateRarityScore(punk)
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.stats-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

h2 {
  color: #fff;
  margin-bottom: 8px;
}

.subtitle {
  color: #aaa;
  margin-bottom: 32px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #aaa;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #333;
  border-top-color: #ff6b35;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 48px;
}

.stat-card {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 2px solid #333;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  transition: all 0.3s ease;
}

.stat-card:hover {
  border-color: #ff6b35;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.2);
}

.stat-icon {
  font-size: 32px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  color: #888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.stat-value {
  color: #fff;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-hint {
  color: #666;
  font-size: 12px;
}

.sales-history {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h3 {
  color: #fff;
  margin: 0;
}

.btn-refresh {
  padding: 8px 16px;
  background: #333;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.btn-refresh:hover:not(:disabled) {
  background: #444;
  border-color: #ff6b35;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.sales-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 2fr 1.5fr;
  gap: 16px;
  padding: 16px;
  align-items: center;
}

.table-header {
  background: #0a0a0a;
  border-radius: 8px 8px 0 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #888;
}

.table-row {
  background: #2a2a2a;
  border-bottom: 1px solid #333;
  transition: background 0.2s ease;
}

.table-row:hover {
  background: #333;
}

.table-row:last-child {
  border-radius: 0 0 8px 8px;
  border-bottom: none;
}

.punk-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.punk-id {
  color: #fff;
  font-weight: 600;
  font-family: monospace;
}

.punk-number {
  color: #ff6b35;
  font-size: 12px;
  font-weight: 600;
}

.price-badge {
  display: inline-block;
  padding: 6px 12px;
  background: rgba(255, 107, 53, 0.1);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 6px;
  color: #ff6b35;
  font-weight: 600;
  font-size: 14px;
}

.address-short {
  color: #aaa;
  font-family: monospace;
  font-size: 13px;
}

.time-ago {
  color: #888;
  font-size: 13px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #333;
}

.btn-page {
  padding: 8px 16px;
  background: #333;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
}

.btn-page:hover:not(:disabled) {
  background: #444;
  border-color: #ff6b35;
}

.btn-page:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.page-info {
  color: #aaa;
  font-size: 14px;
}

/* Clickable Punk ID */
.punk-id.clickable {
  cursor: pointer;
  transition: color 0.2s ease;
}

.punk-id.clickable:hover {
  color: #ff6b35;
  text-decoration: underline;
}

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: #1a1a1a;
  border: 2px solid #ff6b35;
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: #333;
  border: 1px solid #444;
  border-radius: 50%;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
}

.modal-close:hover {
  background: #ff6b35;
  border-color: #ff6b35;
  transform: scale(1.1);
}

.punk-detail {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 32px;
  padding: 32px;
}

.punk-image-large {
  width: 300px;
  height: 300px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #333;
}

.punk-image-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.punk-info-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.punk-info-detail h3 {
  margin: 0;
  color: #fff;
  font-size: 28px;
}

.punk-type-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
  width: fit-content;
}

.type-alien { background: #88ff88; color: #000; }
.type-ape { background: #8b4513; color: #fff; }
.type-zombie { background: #88cc88; color: #000; }
.type-male { background: #4a9eff; color: #fff; }
.type-female { background: #ff69b4; color: #fff; }

.punk-attributes h4 {
  margin: 0 0 12px 0;
  color: #aaa;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.attributes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attr-badge {
  padding: 6px 12px;
  background: #333;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
}

.punk-details-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: #2a2a2a;
  border-radius: 8px;
  border: 1px solid #444;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  color: #888;
  font-size: 14px;
}

.detail-value {
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  font-family: monospace;
}

@media (max-width: 768px) {
  .stats-container {
    padding: 16px;
  }

  h2 {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .subtitle {
    font-size: 14px;
    margin-bottom: 20px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }

  .stat-card {
    padding: 12px;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
  }

  .stat-icon {
    font-size: 24px;
  }

  .stat-label {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 16px;
  }

  .stat-hint {
    font-size: 11px;
  }

  .sales-history {
    padding: 16px;
  }

  .section-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .section-header h3 {
    font-size: 18px;
  }

  .btn-refresh {
    width: 100%;
    padding: 10px;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1.5fr 1fr;
    gap: 8px;
    padding: 12px;
  }

  .col-buyer,
  .col-time {
    display: none;
  }

  .punk-id {
    font-size: 14px;
  }

  .price-badge {
    padding: 4px 8px;
    font-size: 12px;
  }

  .table-header {
    font-size: 11px;
  }

  .pagination {
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
  }

  .btn-page {
    padding: 8px 12px;
    font-size: 13px;
  }

  .page-info {
    font-size: 13px;
    width: 100%;
    text-align: center;
  }

  .punk-detail {
    grid-template-columns: 1fr;
    padding: 20px;
    gap: 20px;
  }

  .punk-image-large {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    max-width: 280px;
    margin: 0 auto;
  }

  .punk-info-detail h3 {
    font-size: 22px;
  }

  .modal-content {
    width: 95%;
  }

  .modal-close {
    width: 32px;
    height: 32px;
    font-size: 20px;
  }
}
</style>

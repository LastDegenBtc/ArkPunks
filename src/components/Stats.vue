<template>
  <div class="stats-container">
    <h2>Market Statistics</h2>
    <p class="subtitle">Live ArkPunks marketplace data</p>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading market data from Nostr...</p>
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
              <div class="punk-id">{{ sale.punkId.slice(0, 8) }}...</div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getSalesHistory, getMarketStats } from '@/utils/nostrRegistry'

interface Sale {
  id: string
  punkId: string
  punkIndex?: number
  price: bigint
  buyer: string
  timestamp: number
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
    console.log('📊 Loading market statistics...')

    // Fetch sales history
    const sales = await getSalesHistory()
    allSales.value = sales
    recentSales.value = paginatedSales.value

    // Fetch market stats
    const marketStats = await getMarketStats()
    stats.value = marketStats

    console.log('✅ Market stats loaded:')
    console.log('   Floor:', formatSats(marketStats.floorPrice))
    console.log('   Highest:', formatSats(marketStats.highestSale))
    console.log('   Volume:', formatSats(marketStats.totalVolume))
    console.log('   Sales:', marketStats.totalSales)

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

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .table-header,
  .table-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .col-buyer,
  .col-time {
    display: none;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-value {
    font-size: 20px;
  }
}
</style>

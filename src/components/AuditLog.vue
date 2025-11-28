<template>
  <div class="audit-container">
    <h2>Admin Panel</h2>
    <p class="subtitle">Audit log & Support requests</p>

    <!-- Password gate -->
    <div v-if="!authenticated" class="password-gate">
      <div class="gate-card">
        <p>Admin access required</p>
        <div class="password-input">
          <input
            v-model="password"
            type="password"
            placeholder="Enter admin password"
            @keyup.enter="authenticate"
          />
          <button @click="authenticate" class="btn btn-primary">
            Enter
          </button>
        </div>
        <p v-if="authError" class="error-msg">{{ authError }}</p>
      </div>
    </div>

    <!-- Admin content -->
    <div v-else class="audit-content">
      <!-- Tabs -->
      <div class="tabs">
        <button
          :class="{ active: activeTab === 'audit' }"
          @click="activeTab = 'audit'"
        >
          Audit Log
        </button>
        <button
          :class="{ active: activeTab === 'support' }"
          @click="activeTab = 'support'; loadSupportRequests()"
        >
          Support Requests
          <span v-if="pendingCount > 0" class="badge">{{ pendingCount }}</span>
        </button>
      </div>

      <!-- AUDIT TAB -->
      <div v-if="activeTab === 'audit'">
        <!-- Filters -->
        <div class="filters">
          <select v-model="filterAction" @change="loadAuditLog">
            <option value="">All Actions</option>
            <option value="LIST_CREATED">LIST_CREATED</option>
            <option value="DEPOSIT_CONFIRMED">DEPOSIT_CONFIRMED</option>
            <option value="SALE_COMPLETED">SALE_COMPLETED</option>
            <option value="PAYMENT_FAILED">PAYMENT_FAILED</option>
            <option value="LISTING_CANCELLED">LISTING_CANCELLED</option>
            <option value="REFUND_FAILED">REFUND_FAILED</option>
          </select>
          <input
            v-model="filterPunkId"
            type="text"
            placeholder="Filter by punk ID..."
            @keyup.enter="loadAuditLog"
          />
          <button @click="loadAuditLog" class="btn btn-refresh">
            Refresh
          </button>
        </div>

        <!-- Stats summary -->
        <div class="stats-row">
          <div class="stat-box">
            <span class="stat-value">{{ stats.total }}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat-box success">
            <span class="stat-value">{{ stats.success }}</span>
            <span class="stat-label">Success</span>
          </div>
          <div class="stat-box failed">
            <span class="stat-value">{{ stats.failed }}</span>
            <span class="stat-label">Failed</span>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="loading">Loading...</div>

        <!-- Table -->
        <div v-else class="table-wrapper">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Punk</th>
                <th>Seller</th>
                <th>Buyer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>TXID</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id" :class="log.status?.toLowerCase()">
                <td class="time">{{ formatTime(log.timestamp) }}</td>
                <td>
                  <span class="action-badge" :class="log.action.toLowerCase()">
                    {{ formatAction(log.action) }}
                  </span>
                </td>
                <td class="mono">{{ log.punk_id?.slice(0, 8) || '-' }}</td>
                <td class="mono">{{ formatAddress(log.seller_address) }}</td>
                <td class="mono">{{ formatAddress(log.buyer_address) }}</td>
                <td class="amount">{{ log.amount_sats ? log.amount_sats.toLocaleString() : '-' }}</td>
                <td>
                  <span class="status-badge" :class="log.status?.toLowerCase()">
                    {{ log.status || '-' }}
                  </span>
                </td>
                <td class="mono txid">{{ log.txid?.slice(0, 12) || '-' }}</td>
              </tr>
            </tbody>
          </table>

          <div v-if="logs.length === 0" class="empty">
            No audit logs found
          </div>
        </div>

        <!-- Pagination info -->
        <div class="pagination-info">
          Showing {{ logs.length }} entries (limit: {{ limit }})
        </div>
      </div>

      <!-- SUPPORT TAB -->
      <div v-if="activeTab === 'support'">
        <!-- Filters -->
        <div class="filters">
          <select v-model="supportFilter" @change="loadSupportRequests">
            <option value="all">All Requests</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
          <button @click="loadSupportRequests" class="btn btn-refresh">
            Refresh
          </button>
        </div>

        <!-- Loading -->
        <div v-if="supportLoading" class="loading">Loading...</div>

        <!-- Support requests list -->
        <div v-else class="support-list">
          <div
            v-for="req in supportRequests"
            :key="req.id"
            class="support-card"
            :class="req.status"
          >
            <div class="support-header">
              <span class="request-id">#{{ req.id }}</span>
              <span class="request-time">{{ formatTime(req.created_at) }}</span>
              <span class="status-badge" :class="req.status">{{ req.status }}</span>
            </div>

            <div class="support-body">
              <div class="info-row">
                <span class="label">Ark Address:</span>
                <span class="mono">{{ req.ark_address || '-' }}</span>
              </div>
              <div v-if="req.contact_handle" class="info-row">
                <span class="label">Contact:</span>
                <span>{{ req.contact_handle }}</span>
              </div>
              <div class="info-row">
                <span class="label">Punks in export:</span>
                <span>{{ req.punks_in_export ?? '-' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Records found:</span>
                <span :class="{ 'found': req.punks_found > 0 }">{{ req.punks_found }}</span>
              </div>
            </div>

            <div class="support-actions">
              <button
                v-if="req.punks_found > 0"
                @click="lookupDetails(req.ark_address)"
                class="btn btn-small"
              >
                View Details
              </button>
              <button
                v-if="req.status === 'pending'"
                @click="updateRequest(req.id, 'resolved')"
                class="btn btn-small btn-success"
              >
                Mark Resolved
              </button>
              <button
                v-if="req.status === 'resolved'"
                @click="updateRequest(req.id, 'pending')"
                class="btn btn-small"
              >
                Reopen
              </button>
            </div>
          </div>

          <div v-if="supportRequests.length === 0" class="empty">
            No support requests found
          </div>
        </div>

        <!-- Lookup modal -->
        <div v-if="lookupModal" class="modal-overlay" @click.self="lookupModal = false">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Punk Details</h3>
              <button @click="lookupModal = false" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <p><strong>Address:</strong> {{ lookupAddress }}</p>
              <p><strong>Total found:</strong> {{ lookupResults?.totalPunksFound || 0 }}</p>

              <div v-for="source in lookupResults?.sources" :key="source.source" class="source-section">
                <h4>{{ source.description }} ({{ source.count }})</h4>
              </div>

              <div class="punks-list">
                <div v-for="punk in lookupResults?.punks" :key="`${punk.punkId}-${punk.source}`" class="punk-item">
                  <span class="mono">{{ punk.punkId.slice(0, 16) }}...</span>
                  <span class="source-tag">{{ punk.source }}</span>
                  <span v-if="punk.price" class="price">{{ punk.price.toLocaleString() }} sats</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || ''

const password = ref('')
const authenticated = ref(false)
const authError = ref('')
const activeTab = ref('audit')

// Audit log state
const loading = ref(false)
const logs = ref<any[]>([])
const limit = ref(100)
const filterAction = ref('')
const filterPunkId = ref('')

const stats = reactive({
  total: 0,
  success: 0,
  failed: 0
})

// Support requests state
const supportLoading = ref(false)
const supportRequests = ref<any[]>([])
const supportFilter = ref('all')
const pendingCount = ref(0)

// Lookup modal
const lookupModal = ref(false)
const lookupAddress = ref('')
const lookupResults = ref<any>(null)

async function authenticate() {
  if (!password.value) {
    authError.value = 'Password required'
    return
  }
  await loadAuditLog()
  if (authenticated.value) {
    loadPendingCount()
  }
}

async function loadAuditLog() {
  if (!password.value) {
    authError.value = 'Password required'
    return
  }

  loading.value = true
  authError.value = ''

  try {
    let url = `${API_URL}/api/admin/audit?password=${encodeURIComponent(password.value)}&limit=${limit.value}`

    if (filterAction.value) {
      url += `&action=${filterAction.value}`
    }
    if (filterPunkId.value) {
      url += `&punkId=${filterPunkId.value}`
    }

    const response = await fetch(url)
    const data = await response.json()

    if (!response.ok) {
      if (response.status === 401) {
        authError.value = 'Invalid password'
        authenticated.value = false
      } else {
        authError.value = data.error || 'Failed to load audit log'
      }
      return
    }

    authenticated.value = true
    logs.value = data.logs || []

    // Calculate stats
    stats.total = logs.value.length
    stats.success = logs.value.filter(l => l.status === 'SUCCESS').length
    stats.failed = logs.value.filter(l => l.status === 'FAILED').length

  } catch (err: any) {
    authError.value = err.message || 'Network error'
  } finally {
    loading.value = false
  }
}

async function loadSupportRequests() {
  supportLoading.value = true

  try {
    const url = `${API_URL}/api/admin/support-requests?password=${encodeURIComponent(password.value)}&status=${supportFilter.value}`
    const response = await fetch(url)
    const data = await response.json()

    if (response.ok) {
      supportRequests.value = data.requests || []
    }
  } catch (err) {
    console.error('Failed to load support requests:', err)
  } finally {
    supportLoading.value = false
  }
}

async function loadPendingCount() {
  try {
    const url = `${API_URL}/api/admin/support-requests?password=${encodeURIComponent(password.value)}&status=pending`
    const response = await fetch(url)
    const data = await response.json()
    if (response.ok) {
      pendingCount.value = data.count || 0
    }
  } catch (err) {
    console.error('Failed to load pending count:', err)
  }
}

async function updateRequest(id: number, status: string) {
  try {
    const response = await fetch(`${API_URL}/api/admin/support-requests/${id}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value, status })
    })

    if (response.ok) {
      loadSupportRequests()
      loadPendingCount()
    }
  } catch (err) {
    console.error('Failed to update request:', err)
  }
}

async function lookupDetails(arkAddress: string) {
  if (!arkAddress) return

  lookupAddress.value = arkAddress

  try {
    const url = `${API_URL}/api/admin/support-lookup?password=${encodeURIComponent(password.value)}&arkAddress=${encodeURIComponent(arkAddress)}`
    const response = await fetch(url)
    const data = await response.json()

    if (response.ok) {
      lookupResults.value = data
      lookupModal.value = true
    }
  } catch (err) {
    console.error('Failed to lookup:', err)
  }
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('fr-FR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ')
}

function formatAddress(addr: string | null): string {
  if (!addr) return '-'
  return addr.slice(0, 12) + '...'
}
</script>

<style scoped>
.audit-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

h2 {
  color: #fff;
  margin-bottom: 8px;
}

.subtitle {
  color: #aaa;
  margin-bottom: 24px;
}

.password-gate {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.gate-card {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  max-width: 400px;
}

.gate-card p {
  color: #aaa;
  margin-bottom: 20px;
}

.password-input {
  display: flex;
  gap: 12px;
}

.password-input input {
  flex: 1;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid #333;
  padding-bottom: 12px;
}

.tabs button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  position: relative;
}

.tabs button:hover {
  color: #fff;
  background: #2a2a2a;
}

.tabs button.active {
  color: #ff6b35;
  background: rgba(255, 107, 53, 0.1);
}

.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff4444;
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  background: #ff6b35;
  color: #fff;
}

.btn-primary:hover {
  background: #ff8555;
}

.btn-refresh {
  background: #333;
  color: #fff;
  border: 1px solid #444;
}

.btn-refresh:hover {
  background: #444;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  background: #333;
  color: #fff;
  border: 1px solid #444;
}

.btn-small:hover {
  background: #444;
}

.btn-success {
  background: #4caf50;
  border-color: #4caf50;
}

.btn-success:hover {
  background: #5cbf60;
}

.error-msg {
  color: #ff4444;
  margin-top: 12px;
}

.filters {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filters select,
.filters input {
  padding: 10px 14px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
}

.filters select {
  min-width: 180px;
}

.filters input {
  flex: 1;
  min-width: 200px;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.stat-box {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px 20px;
  text-align: center;
}

.stat-box.success {
  border-color: #4caf50;
}

.stat-box.failed {
  border-color: #ff4444;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #fff;
}

.stat-label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #888;
}

.table-wrapper {
  overflow-x: auto;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.audit-table th {
  background: #0a0a0a;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
  padding: 12px 10px;
  text-align: left;
  border-bottom: 1px solid #333;
}

.audit-table td {
  padding: 10px;
  border-bottom: 1px solid #2a2a2a;
  color: #ccc;
}

.audit-table tr:hover {
  background: #252525;
}

.audit-table tr.failed {
  background: rgba(255, 68, 68, 0.1);
}

.mono {
  font-family: monospace;
  font-size: 12px;
}

.time {
  white-space: nowrap;
  color: #888;
}

.amount {
  text-align: right;
  color: #ff6b35;
}

.txid {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.action-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.action-badge.list_created {
  background: #2196f3;
  color: #fff;
}

.action-badge.deposit_confirmed {
  background: #9c27b0;
  color: #fff;
}

.action-badge.sale_completed {
  background: #4caf50;
  color: #fff;
}

.action-badge.payment_failed,
.action-badge.refund_failed {
  background: #ff4444;
  color: #fff;
}

.action-badge.listing_cancelled {
  background: #ff9800;
  color: #fff;
}

.status-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.status-badge.success,
.status-badge.resolved {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.status-badge.failed {
  background: rgba(255, 68, 68, 0.2);
  color: #ff4444;
}

.status-badge.pending {
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
}

.empty {
  text-align: center;
  padding: 40px;
  color: #666;
}

.pagination-info {
  margin-top: 16px;
  text-align: center;
  color: #666;
  font-size: 13px;
}

/* Support requests */
.support-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.support-card {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 16px;
}

.support-card.pending {
  border-left: 4px solid #ff9800;
}

.support-card.resolved {
  border-left: 4px solid #4caf50;
  opacity: 0.7;
}

.support-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.request-id {
  font-weight: bold;
  color: #fff;
}

.request-time {
  color: #888;
  font-size: 13px;
}

.support-body {
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.info-row .label {
  color: #888;
  min-width: 120px;
}

.info-row .found {
  color: #4caf50;
  font-weight: bold;
}

.support-actions {
  display: flex;
  gap: 8px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  color: #fff;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
}

.modal-close:hover {
  color: #fff;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

.modal-body p {
  color: #aaa;
  margin-bottom: 8px;
}

.modal-body strong {
  color: #fff;
}

.source-section {
  margin-top: 16px;
}

.source-section h4 {
  color: #4a9eff;
  font-size: 14px;
  margin-bottom: 8px;
}

.punks-list {
  margin-top: 16px;
}

.punk-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: #2a2a2a;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}

.source-tag {
  background: #333;
  padding: 2px 6px;
  border-radius: 4px;
  color: #888;
  font-size: 10px;
}

.price {
  color: #ff6b35;
  margin-left: auto;
}

@media (max-width: 768px) {
  .audit-container {
    padding: 16px;
  }

  .filters {
    flex-direction: column;
  }

  .filters select,
  .filters input {
    width: 100%;
  }

  .stats-row {
    flex-wrap: wrap;
  }

  .stat-box {
    flex: 1;
    min-width: 80px;
  }

  .audit-table {
    font-size: 11px;
  }

  .audit-table th,
  .audit-table td {
    padding: 8px 6px;
  }

  .support-header {
    flex-wrap: wrap;
  }

  .support-actions {
    flex-wrap: wrap;
  }
}
</style>

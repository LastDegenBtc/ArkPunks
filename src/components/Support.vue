<template>
  <div class="support-container">
    <h2>Support - Punk Recovery</h2>
    <p class="subtitle">Lost your punks? Submit a recovery request!</p>

    <!-- Success message -->
    <div v-if="submitted" class="success-card">
      <h3>Request Submitted!</h3>
      <p>We've received your recovery request and will investigate.</p>
      <p>Follow <strong>@ArkPunks</strong> on X or Nostr for updates.</p>
      <button @click="resetForm" class="btn btn-secondary">Submit Another Request</button>
    </div>

    <!-- Form -->
    <div v-else class="support-interface">
      <div class="search-card">
        <h3>Submit Recovery Request</h3>
        <p class="hint">
          Enter your Ark address or paste your wallet export (without private key!).
          We'll search our database and contact you if we find your punks.
        </p>

        <div class="input-group">
          <label>Ark Address (ark1...)</label>
          <input
            v-model="arkAddress"
            type="text"
            placeholder="ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kl..."
          />
        </div>

        <div class="input-group">
          <label>Or paste wallet export JSON (without your private key!)</label>
          <textarea
            v-model="jsonExport"
            placeholder='{"wallet": {"address": "ark1..."}, ...}'
            rows="4"
            @input="parseJsonExport"
          ></textarea>
        </div>

        <div v-if="parsedInfo" class="parsed-info">
          <strong>Parsed from JSON:</strong>
          <ul>
            <li v-if="parsedInfo.arkAddress">Ark Address: {{ shortenAddress(parsedInfo.arkAddress) }}</li>
            <li v-if="parsedInfo.publicKey">Public Key: {{ parsedInfo.publicKey.slice(0, 16) }}...</li>
            <li v-if="parsedInfo.boardingAddress">Boarding: {{ shortenAddress(parsedInfo.boardingAddress) }}</li>
            <li v-if="parsedInfo.punksInExport !== undefined">Punks in export: {{ parsedInfo.punksInExport }}</li>
          </ul>
        </div>

        <div class="input-group">
          <label>Contact (X/Nostr handle - optional)</label>
          <input
            v-model="contactHandle"
            type="text"
            placeholder="@yourhandle or npub..."
          />
        </div>

        <button
          @click="submitRequest"
          :disabled="submitting || (!arkAddress && !parsedInfo)"
          class="btn btn-search"
        >
          {{ submitting ? 'Submitting...' : 'Submit Recovery Request' }}
        </button>
      </div>

      <div v-if="error" class="error-card">
        <p>{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || ''

const arkAddress = ref('')
const jsonExport = ref('')
const contactHandle = ref('')
const parsedInfo = ref<{
  arkAddress?: string
  publicKey?: string
  boardingAddress?: string
  punksInExport?: number
} | null>(null)

const submitting = ref(false)
const submitted = ref(false)
const error = ref('')

function parseJsonExport() {
  if (!jsonExport.value.trim()) {
    parsedInfo.value = null
    return
  }

  try {
    const data = JSON.parse(jsonExport.value)
    parsedInfo.value = {
      arkAddress: data.wallet?.address,
      publicKey: data.wallet?.publicKey,
      boardingAddress: data.wallet?.boardingAddress,
      punksInExport: data.punks?.length || data.totalPunksMinted
    }

    // Auto-fill arkAddress if found
    if (parsedInfo.value.arkAddress && !arkAddress.value) {
      arkAddress.value = parsedInfo.value.arkAddress
    }
  } catch {
    parsedInfo.value = null
  }
}

async function submitRequest() {
  if (!arkAddress.value && !parsedInfo.value?.arkAddress) {
    error.value = 'Please enter an Ark address or paste wallet export'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const response = await fetch(`${API_URL}/api/support/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        arkAddress: arkAddress.value || parsedInfo.value?.arkAddress,
        nostrPubkey: parsedInfo.value?.publicKey,
        boardingAddress: parsedInfo.value?.boardingAddress,
        punksInExport: parsedInfo.value?.punksInExport,
        contactHandle: contactHandle.value
      })
    })

    const data = await response.json()

    if (!response.ok) {
      error.value = data.error || 'Failed to submit request'
      return
    }

    submitted.value = true
  } catch (err: any) {
    error.value = err.message || 'Network error'
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  arkAddress.value = ''
  jsonExport.value = ''
  contactHandle.value = ''
  parsedInfo.value = null
  submitted.value = false
  error.value = ''
}

function shortenAddress(addr: string): string {
  if (addr.length <= 20) return addr
  return addr.slice(0, 12) + '...' + addr.slice(-8)
}
</script>

<style scoped>
.support-container {
  max-width: 800px;
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

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-search {
  width: 100%;
  background: #4a9eff;
  color: #fff;
  margin-top: 16px;
}

.btn-search:hover:not(:disabled) {
  background: #6ab0ff;
}

.btn-search:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}

.btn-secondary {
  background: #333;
  color: #fff;
  border: 1px solid #444;
  margin-top: 16px;
}

.btn-secondary:hover {
  background: #444;
}

.search-card,
.success-card,
.error-card {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
}

.success-card {
  border-color: #4caf50;
  text-align: center;
}

.success-card h3 {
  color: #4caf50;
  margin-bottom: 16px;
}

.success-card p {
  color: #aaa;
  margin-bottom: 12px;
}

.success-card strong {
  color: #ff6b35;
}

.search-card h3 {
  color: #fff;
  margin-bottom: 16px;
}

.hint {
  color: #888;
  font-size: 14px;
  margin-bottom: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  color: #aaa;
  font-size: 14px;
  margin-bottom: 8px;
}

.input-group input,
.input-group textarea {
  width: 100%;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-family: monospace;
}

.input-group textarea {
  resize: vertical;
}

.parsed-info {
  background: #2a2a2a;
  border: 1px solid #4a9eff;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.parsed-info strong {
  color: #4a9eff;
}

.parsed-info ul {
  margin: 8px 0 0 20px;
  color: #aaa;
  font-size: 13px;
}

.error-card {
  border-color: #ff4444;
  color: #ff4444;
}

@media (max-width: 600px) {
  .support-container {
    padding: 16px;
  }
}
</style>

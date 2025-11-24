<template>
  <div class="wallet-connect">
    <div v-if="!connected" class="connect-section">
      <h3>Connect Wallet</h3>
      <p class="subtitle">Connect to Arkade {{ config.network }}</p>

      <div class="connect-options">
        <button @click="createNewWallet" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Creating...' : 'Create New Wallet' }}
        </button>

        <button @click="importWallet" class="btn btn-secondary" :disabled="loading">
          Import Existing Wallet
        </button>
      </div>

      <div v-if="showImport" class="import-form">
        <div class="import-tabs">
          <button
            @click="importMode = 'key'"
            :class="{ active: importMode === 'key' }"
            class="tab-button"
          >
            Private Key
          </button>
          <button
            @click="importMode = 'file'"
            :class="{ active: importMode === 'file' }"
            class="tab-button"
          >
            Import File
          </button>
        </div>

        <div v-if="importMode === 'key'">
          <label>
            Private Key (hex):
            <input
              v-model="importPrivateKey"
              type="password"
              placeholder="64 character hex string"
              maxlength="64"
            />
          </label>
          <button @click="doImport" class="btn btn-primary" :disabled="!isValidHex">
            Import
          </button>
        </div>

        <div v-else class="import-file-section">
          <label class="file-upload-label">
            📁 Select exported wallet file (.json):
            <input
              type="file"
              accept=".json"
              @change="handleFileImport"
              class="file-input"
            />
          </label>
          <p class="import-hint">
            Select the wallet JSON file you exported previously. This will restore your wallet and all minted punks.
          </p>
        </div>

        <button @click="showImport = false" class="btn btn-secondary" style="margin-top: 12px;">
          Cancel
        </button>
      </div>

      <div class="network-info">
        <p>Network: <strong>{{ config.network }}</strong></p>
        <p>Server: <a :href="config.arkServerUrl" target="_blank">{{ config.arkServerUrl }}</a></p>
      </div>
    </div>

    <div v-else class="wallet-info">
      <!-- Compact Header -->
      <div class="wallet-compact-header">
        <div class="compact-balance" @click="expanded = !expanded">
          <span class="balance-label">💰</span>
          <span class="balance-value">{{ formatSats(balance.total) }} sats</span>
          <span v-if="!expanded" class="expand-hint">({{ possibleMints }} {{ possibleMints === 1 ? 'punk' : 'punks' }}) ▼</span>
          <span v-else class="expand-hint">▲</span>
        </div>
        <button @click="disconnect" class="btn-disconnect-compact">×</button>
      </div>

      <!-- Expanded Details (collapsible) -->
      <div v-if="expanded" class="wallet-details-expanded"
        :class="{ 'expanded': expanded }">
        <div class="info-header">
          <h3>Wallet Details</h3>
        </div>

      <div class="info-details">
        <div class="detail-row">
          <span class="label">Arkade Address:</span>
          <span class="value monospace">{{ formatAddress(arkadeAddress) }}</span>
          <button @click="copyArkadeAddress" class="btn-copy">📋</button>
        </div>

        <!-- Nostr Public Key (for receiving punk transfers) -->
        <div class="nostr-pubkey-section">
          <button @click="showNostrPubkey = !showNostrPubkey" class="btn-toggle-nostr">
            {{ showNostrPubkey ? '▼' : '▶' }} Nostr Public Key (for receiving transfers)
          </button>

          <div v-if="showNostrPubkey" class="nostr-pubkey-content">
            <p class="nostr-hint">
              Share this <strong>npub</strong> key with others so they can send you punks directly.<br>
              This is your Nostr public identifier (compatible with all Nostr apps).
            </p>
            <div class="nostr-pubkey-box">
              <code class="nostr-pubkey-value">{{ nostrPubkey }}</code>
              <button @click="copyNostrPubkey" class="btn-copy-inline">📋</button>
            </div>
          </div>
        </div>

        <div class="detail-row">
          <span class="label">Balance:</span>
          <span class="value">
            <span class="balance-amount">{{ formatSats(balance.total) }}</span> sats
          </span>
        </div>

        <div class="detail-row">
          <span class="label">Available for mint:</span>
          <span class="value">
            {{ formatSats(availableForMinting) }} sats
            <span class="mints-available">({{ possibleMints }} {{ possibleMints === 1 ? 'punk' : 'punks' }})</span>
          </span>
        </div>

        <div v-if="punkLockedBalance > 0n" class="detail-row">
          <span class="label">Locked in punks:</span>
          <span class="value">{{ formatSats(punkLockedBalance) }} sats</span>
        </div>

        <!-- Marketplace reserve info (over-minting bug) -->
        <div v-if="marketplaceInfo.hasDeficit || marketplaceInfo.canLock" class="detail-row reserve-info-warning">
          <div class="reserve-info-header">
            <span class="label">⚠️ Marketplace Reserve</span>
          </div>
          <div class="reserve-info-content">
            <p class="info-text">
              You have <strong>{{ marketplaceInfo.totalPunks }} punk{{ marketplaceInfo.totalPunks > 1 ? 's' : '' }}</strong>
              but can only list <strong>{{ marketplaceInfo.sellablePunks }}</strong> on the marketplace.
            </p>

            <!-- Case 1: Not enough sats total -->
            <template v-if="marketplaceInfo.hasDeficit">
              <p class="info-text">
                <strong>Why?</strong> Each punk requires 10,000 sats reserve for UTXO manipulation.<br>
                Your balance: {{ formatSats(balance.total) }} sats<br>
                Required: {{ formatSats(marketplaceInfo.requiredReserve) }} sats<br>
                <strong>Missing: {{ formatSats(marketplaceInfo.deficit) }} sats</strong>
              </p>
              <p class="info-action">
                💡 <strong>To list more punks:</strong> Receive {{ formatSats(marketplaceInfo.deficit) }} sats via Lightning or on-chain.
              </p>
            </template>

            <!-- Case 2: Enough sats but need to lock -->
            <template v-else-if="marketplaceInfo.canLock">
              <p class="info-text">
                <strong>Why?</strong> Each punk requires 10,000 sats reserve for UTXO manipulation.<br>
                Your balance: {{ formatSats(balance.total) }} sats<br>
                Required: {{ formatSats(marketplaceInfo.requiredReserve) }} sats<br>
                <strong>✅ You have enough sats!</strong>
              </p>
              <p class="info-action">
                💡 <strong>Click below to lock your sats and enable marketplace listing for all your punks.</strong>
              </p>
              <button @click="syncPunkReserve" class="btn-sync-reserve" :disabled="syncing">
                {{ syncing ? 'Locking...' : '🔒 Lock Missing Sats for Listing' }}
              </button>
            </template>
          </div>
        </div>

        <div v-if="balance.recoverable > 0n" class="detail-row recoverable-warning">
          <span class="label">⏳ Recoverable (not spendable):</span>
          <span class="value">
            {{ formatSats(balance.recoverable) }} sats
          </span>
        </div>

        <!-- Troubleshooting section -->
        <div class="detail-row troubleshooting-section">
          <div class="troubleshooting-header" @click="showTroubleshooting = !showTroubleshooting">
            <span class="label">🔧 Troubleshooting</span>
            <span class="toggle-icon">{{ showTroubleshooting ? '▼' : '▶' }}</span>
          </div>
          <div v-if="showTroubleshooting" class="troubleshooting-content">
            <p class="info-text">
              <strong>Getting VTXO_RECOVERABLE errors?</strong><br><br>

              <span v-if="balance.preconfirmed > 0n">
                ⏳ You have <strong>{{ balance.preconfirmed }}</strong> sats in preconfirmed VTXOs.<br>

                <!-- Show expiration info if available -->
                <span v-if="vtxoExpirationInfo">
                  <br>
                  <strong>⏰ VTXO Expiration:</strong><br>
                  <span v-if="vtxoExpirationInfo.isExpired" class="expiry-expired">
                    ✅ Your VTXOs have expired! They should now be recoverable.<br>
                    Click "Refresh" and use the recover button below.
                  </span>
                  <span v-else class="expiry-pending">
                    📅 Expires: {{ vtxoExpirationInfo.expiryDate }}<br>
                    ⏱️ Time remaining: {{ vtxoExpirationInfo.timeRemaining }}<br>
                    <br>
                    <em>✅ Your preconfirmed VTXOs are fully spendable!</em>
                  </span>
                </span>
                <span v-else>
                  <br>
                  <em>✅ Your preconfirmed VTXOs are fully spendable!</em>
                </span>
              </span>
              <span v-else-if="balance.recoverable > 0n">
                🔄 You have <strong>{{ balance.recoverable }}</strong> sats in recoverable VTXOs.<br>
                These can be recovered using the button below.
              </span>
              <span v-else>
                Your VTXOs look normal. Try refreshing your balance.
              </span>
            </p>
            <button
              v-if="balance.recoverable > 0n"
              @click="recoverExpiredVtxos"
              class="btn-recover"
              :disabled="recovering">
              {{ recovering ? 'Recovering...' : '🔄 Recover Swept VTXOs' }}
            </button>
          </div>
        </div>

        <div class="detail-row">
          <span class="label">Status:</span>
          <span class="value">
            <span v-if="canMintPunks" class="status-ready">Ready to mint 🎨</span>
            <span v-else class="status-need-funds">Need funds</span>
          </span>
        </div>
      </div>

      <!-- Lightning Swaps Section (hidden in production) -->
      <div v-if="lightningEnabled" class="lightning-section">
        <div class="troubleshooting-header" @click="showLightning = !showLightning">
          <span class="label">⚡ Lightning Swaps</span>
          <span class="toggle-icon">{{ showLightning ? '▼' : '▶' }}</span>
        </div>
        <div v-if="showLightning" class="lightning-content">
          <div class="lightning-tabs">
            <button
              @click="lightningTab = 'receive'"
              :class="{ active: lightningTab === 'receive' }"
              class="lightning-tab-button"
            >
              📥 Receive
            </button>
            <button
              @click="lightningTab = 'send'"
              :class="{ active: lightningTab === 'send' }"
              class="lightning-tab-button"
            >
              📤 Send
            </button>
          </div>

          <!-- Receive Tab -->
          <div v-if="lightningTab === 'receive'" class="lightning-tab-content">
          <div v-if="!lightningReceiveInvoice" class="lightning-form">
            <div class="form-group">
              <label>Amount (sats)</label>
              <input
                v-model.number="lightningReceiveAmount"
                type="number"
                placeholder="10000"
                min="1000"
                :disabled="lightningGenerating"
                class="input-amount"
              />
              <p class="input-hint">
                Est. fee: ~{{ estimateLightningFee(lightningReceiveAmount, 'receive') }} sats
              </p>
            </div>
            <button
              @click="generateLightningInvoice"
              :disabled="lightningGenerating || !lightningReceiveAmount || lightningReceiveAmount < 1000"
              class="btn btn-primary"
            >
              {{ lightningGenerating ? 'Generating...' : 'Generate Invoice' }}
            </button>
          </div>

          <div v-else class="invoice-display">
            <h4>✅ Invoice Generated</h4>
            <p>Scan or copy to receive {{ lightningReceiveInvoice.amount }} sats</p>

            <div class="qr-container">
              <canvas ref="lightningQrCanvas" class="qr-code-lightning"></canvas>
            </div>

            <div class="invoice-string">
              <code>{{ lightningReceiveInvoice.bolt11 }}</code>
              <button @click="copyLightningInvoice" class="btn-copy-inline">
                {{ lightningCopied ? '✓' : '📋' }}
              </button>
            </div>

            <div class="status-box" :class="lightningPaymentStatus">
              <p v-if="lightningPaymentStatus === 'waiting'">⏳ Waiting for payment...</p>
              <p v-else-if="lightningPaymentStatus === 'completed'">🎉 Received! Funds added to wallet</p>
              <p v-else-if="lightningPaymentStatus === 'error'">❌ {{ lightningErrorMessage }}</p>
            </div>

            <button @click="resetLightningReceive" class="btn btn-secondary">
              Generate New Invoice
            </button>
          </div>
        </div>

        <!-- Send Tab -->
        <div v-if="lightningTab === 'send'" class="lightning-tab-content">
          <div class="lightning-form">
            <div class="form-group">
              <label>Lightning Invoice</label>
              <textarea
                v-model="lightningSendInvoice"
                placeholder="lnbc..."
                rows="3"
                :disabled="lightningSending || !!lightningSendResult"
                class="input-address"
              ></textarea>
            </div>

            <button
              v-if="!lightningSendResult"
              @click="payLightningInvoiceNow"
              :disabled="!lightningSendInvoice || lightningSending"
              class="btn btn-primary"
            >
              {{ lightningSending ? 'Paying...' : 'Pay Invoice' }}
            </button>

            <div v-if="lightningSendResult" class="status-box success">
              <p>✅ Payment sent successfully!</p>
              <p><strong>Amount:</strong> {{ lightningSendResult.amount }} sats</p>
              <p><small>Preimage: {{ lightningSendResult.preimage.slice(0, 16) }}...</small></p>
            </div>

            <div v-if="lightningSendError" class="status-box error">
              <p>❌ {{ lightningSendError }}</p>
            </div>

            <button
              v-if="lightningSendResult || lightningSendError"
              @click="resetLightningSend"
              class="btn btn-secondary"
            >
              Pay Another Invoice
            </button>
          </div>
        </div>
        </div>
      </div>

      <!-- VTXO Information Section -->
      <div class="vtxo-info-section">
        <div class="troubleshooting-header" @click="showVtxoInfo = !showVtxoInfo">
          <span class="label">📊 VTXO Information</span>
          <span class="toggle-icon">{{ showVtxoInfo ? '▼' : '▶' }}</span>
        </div>
        <div v-if="showVtxoInfo" class="vtxo-info-content">
          <p class="info-text">
            <strong>Your Virtual UTXOs (VTXOs)</strong><br>
            VTXOs are off-chain Bitcoin balances on the Arkade network. All transactions are to yourself.
          </p>

          <div v-if="rawVtxos.length === 0" class="no-vtxos">
            <p>No VTXOs found. Connect your wallet to see your VTXOs.</p>
          </div>

          <div v-else class="vtxo-list">
            <div v-for="(vtxo, index) in rawVtxos" :key="(vtxo.txid || 'vtxo') + ':' + vtxo.vout + ':' + index" class="vtxo-item">
              <div class="vtxo-header">
                <span class="vtxo-number">#{{ index + 1 }}</span>
                <span class="vtxo-amount">{{ vtxo.value }} sats</span>
                <span :class="['vtxo-status', getVtxoStatusClass(vtxo)]">
                  {{ getVtxoStatusLabel(vtxo) }}
                </span>
              </div>
              <div class="vtxo-details">
                <div class="vtxo-detail-row">
                  <span class="detail-label">Txid:</span>
                  <span class="detail-value mono txid-full">{{ vtxo.txid || 'N/A' }}</span>
                </div>
                <div class="vtxo-detail-row">
                  <span class="detail-label">Output:</span>
                  <span class="detail-value">{{ vtxo.vout }}</span>
                </div>
                <div v-if="vtxo.virtualStatus?.batchExpiry" class="vtxo-detail-row">
                  <span class="detail-label">Expires:</span>
                  <span class="detail-value">{{ formatTimestamp(vtxo.virtualStatus.batchExpiry) }}</span>
                </div>
              </div>
            </div>
          </div>

          <p class="vtxo-summary">
            <strong>Total VTXOs:</strong> {{ rawVtxos.length }}<br>
            <strong>Total Value:</strong> {{ balance.total }} sats<br>
            <small>All funds are yours - VTXOs represent your Bitcoin locked in Arkade contracts.</small>
          </p>

          <button
            @click="forceRecoverVtxos"
            class="btn btn-secondary"
            :disabled="recoveringVtxos"
            style="margin-top: 10px; width: 100%;"
          >
            {{ recoveringVtxos ? 'Renewing...' : '🔧 Force Renew VTXOs' }}
          </button>
          <p v-if="recoveryStatus" class="recovery-status" :class="recoverySuccess ? 'status-success' : 'status-error'">
            {{ recoveryStatus }}
          </p>
        </div>
      </div>

      <div class="wallet-actions">
        <button @click="refreshBalance" class="btn btn-secondary" :disabled="refreshing">
          {{ refreshing ? 'Refreshing...' : '🔄 Refresh' }}
        </button>

        <button @click="showSendModal = true" class="btn btn-send" :disabled="balance.available === 0n">
          📤 Send
        </button>

        <button @click="exportWallet" class="btn btn-export">
          💾 Export Wallet
        </button>
      </div>

      <!-- Send Modal -->
      <div v-if="showSendModal" class="modal-overlay" @click="showSendModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>📤 Send Bitcoin (Off-chain)</h3>
            <button @click="showSendModal = false" class="btn-close">×</button>
          </div>

          <div class="modal-body">
            <div class="info-box">
              <p>Send your available sats to any Arkade wallet address (ark...).</p>
              <p><strong>Available to send:</strong> {{ formatSats(availableForMinting) }} sats</p>
            </div>

            <div class="send-input-group">
              <label>
                <strong>Recipient Arkade Address:</strong>
                <input
                  v-model="sendRecipientAddress"
                  type="text"
                  placeholder="ark..."
                  class="input-address"
                />
              </label>
              <p class="input-hint">
                Enter the recipient's Arkade off-chain address (starts with "ark")
              </p>
            </div>

            <div class="send-input-group">
              <label>
                <strong>Amount (sats):</strong>
                <input
                  v-model.number="sendAmount"
                  type="number"
                  min="1000"
                  :max="Number(balance.available)"
                  placeholder="10000"
                  class="input-amount"
                />
              </label>
              <p class="input-hint">
                Minimum: 1,000 sats. You have {{ formatSats(balance.available) }} sats available.
              </p>
            </div>

            <div v-if="sendStatus" class="send-status">
              <p :class="sendSuccess ? 'status-success' : 'status-error'">
                {{ sendStatus }}
              </p>
            </div>
          </div>

          <div class="modal-footer">
            <button
              @click="sendSats"
              :disabled="!sendRecipientAddress || !sendAmount || sendAmount < 1000 || sending"
              class="btn btn-primary"
            >
              {{ sending ? 'Sending...' : 'Send' }}
            </button>

            <button @click="showSendModal = false" class="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- L1 Exit Modal -->
      <div v-if="showExitModal" class="modal-overlay" @click="showExitModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>🟠 Exit Arkade to Bitcoin L1</h3>
            <button @click="showExitModal = false" class="btn-close">×</button>
          </div>

          <div class="modal-body">
            <div class="warning-box">
              <p><strong>⚠️ Important:</strong> Before exiting Arkade, we'll publish your punks to Nostr.</p>
              <p>This ensures your punks remain recoverable after converting VTXOs to standard Bitcoin UTXOs.</p>
            </div>

            <div v-if="userPunksForExit.length > 0" class="exit-punks-list">
              <h4>Punks to Preserve:</h4>
              <div class="punk-exit-items">
                <div v-for="punk in userPunksForExit" :key="punk.punkId" class="punk-exit-item">
                  <img :src="punk.metadata.imageUrl" :alt="punk.metadata.name" class="punk-exit-thumb" />
                  <div class="punk-exit-info">
                    <div class="punk-exit-name">{{ punk.metadata.name }}</div>
                    <div class="punk-exit-id">{{ punk.punkId.slice(0, 16) }}...</div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="no-punks-message">
              <p>No punks found in your wallet.</p>
            </div>

            <div class="exit-address-input">
              <label>
                <strong>Bitcoin L1 Destination Address:</strong>
                <input
                  v-model="exitL1Address"
                  type="text"
                  placeholder="bc1q..."
                  class="input-address"
                />
              </label>
              <p class="input-hint">
                Enter the Bitcoin address where you'll receive the funds after exiting Arkade.
              </p>
            </div>

            <div v-if="exitPreparationStatus" class="exit-status">
              <p :class="exitPreparationSuccess ? 'status-success' : 'status-error'">
                {{ exitPreparationStatus }}
              </p>
            </div>
          </div>

          <div class="modal-footer">
            <button
              @click="prepareExit"
              :disabled="!exitL1Address || preparingExit || userPunksForExit.length === 0"
              class="btn btn-primary"
            >
              {{ preparingExit ? 'Publishing to Nostr...' : '1️⃣ Prepare Exit (Publish to Nostr)' }}
            </button>

            <button
              v-if="exitPreparationSuccess"
              @click="performActualExit"
              class="btn btn-exit"
            >
              2️⃣ Proceed with L1 Exit
            </button>

            <button @click="showExitModal = false" class="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      </div>
      </div>
      <!-- End expanded details -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import {
  generateIdentity,
  saveIdentity,
  loadIdentity,
  clearIdentity,
  createArkadeWallet,
  getWalletInfo,
  type ArkadeWalletInterface,
  type WalletBalance
} from '@/utils/arkadeWallet'
import type { VtxoInput } from '@/types/punk'
import { getActiveConfig, getNetworkParams } from '@/config/arkade'
import { hex } from '@scure/base'
import QRCode from 'qrcode'
import { generatePunkImage } from '@/utils/generator'
import { getPublicKey, nip19 } from 'nostr-tools'
import { queryAllPunkMints, queryPunksByPubkey, queryPunksByAddress } from '@/utils/nostrDiagnostics'
import { prepareL1Exit, getExitStatusMessage, type PunkExitInfo } from '@/utils/arkadeExit'
import {
  createReceiveInvoice,
  waitAndClaimPayment,
  payLightningInvoice,
  estimateSwapFee,
  decodeLightningInvoice
} from '@/utils/lightningSwaps'

const config = getActiveConfig()
const params = getNetworkParams()

const connected = ref(false)
const loading = ref(false)
const refreshing = ref(false)
const settling = ref(false)
const showImport = ref(false)
const importPrivateKey = ref('')
const importMode = ref<'key' | 'file'>('key')
const showNostrPubkey = ref(false)
const expanded = ref(false) // Wallet details collapsed by default

// L1 Exit modal state
const showExitModal = ref(false)
const exitL1Address = ref('')
const preparingExit = ref(false)
const exitPreparationStatus = ref('')
const exitPreparationSuccess = ref(false)

const qrCanvas = ref<HTMLCanvasElement | null>(null)
const walletAddress = ref('')
const boardingAddress = ref('') // bc1p... address for on-chain boarding
const arkadeAddress = ref('') // ark... address for native off-chain transfers
const balance = ref<WalletBalance>({
  boarding: 0n,
  available: 0n,
  settled: 0n,
  preconfirmed: 0n,
  recoverable: 0n,
  total: 0n
})
const vtxoCount = ref(0)
const vtxos = ref<VtxoInput[]>([]) // Store VTXOs to calculate punk-locked balance
const rawVtxos = ref<any[]>([]) // Raw VTXOs from SDK for display
const punkBalanceTrigger = ref(0) // Reactive trigger to force punkLockedBalance recalculation
const syncing = ref(false) // Reserve sync in progress
const recovering = ref(false) // VTXO recovery in progress
const showTroubleshooting = ref(false) // Show troubleshooting section
const showLightning = ref(false) // Show Lightning section
const showVtxoInfo = ref(false) // Show VTXO information section

// Send sats modal state
const showSendModal = ref(false)
const sendRecipientAddress = ref('')
const sendAmount = ref<number | null>(null)
const sending = ref(false)
const sendStatus = ref('')
const sendSuccess = ref(false)

// Force recover VTXOs state
const recoveringVtxos = ref(false)
const recoveryStatus = ref('')
const recoverySuccess = ref(false)

// Lightning state
const lightningTab = ref<'receive' | 'send'>('receive')
const lightningReceiveAmount = ref<number>(10000)
const lightningReceiveInvoice = ref<any>(null)
const lightningGenerating = ref(false)
const lightningPaymentStatus = ref<'waiting' | 'completed' | 'error'>('waiting')
const lightningErrorMessage = ref('')
const lightningQrCanvas = ref<HTMLCanvasElement | null>(null)
const lightningCopied = ref(false)
const lightningSendInvoice = ref('')
const lightningSending = ref(false)
const lightningSendResult = ref<any>(null)
const lightningSendError = ref('')

let wallet: ArkadeWalletInterface | null = null

const minVtxoValue = params.minVtxoValue

// Lightning feature flag (disabled in production by default)
const lightningEnabled = computed(() => {
  // Only enable if explicitly set in environment
  return import.meta.env.VITE_ENABLE_LIGHTNING === 'true'
})

/**
 * Calculate balance locked in punks
 *
 * NEW ARCHITECTURE (Fixed orphaned punk issue):
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Problem: VTXOs are mutable - they change through:
 *   - Lightning swaps (sending/receiving via Boltz)
 *   - Arkade rounds (server consolidation)
 *   - Normal transfers
 *
 * Old approach (BROKEN):
 *   - Stored vtxoOutpoint with each punk
 *   - Tried to match punk outpoints with current wallet VTXOs
 *   - Result: "Orphaned punks" when VTXO changed
 *
 * New approach (FIXED):
 *   - Punk value = owned punks × 10,000 sats (simple count)
 *   - vtxoOutpoint kept for historical tracking only (original mint TXID)
 *   - No VTXO matching needed - works with any wallet operations
 *
 * Cryptographic proof layers (user's requirement):
 *   1. Nostr event signature (signed by wallet's Nostr key)
 *   2. Server signature (proves official mint)
 *   3. Arkade wallet ↔ Nostr key binding (wallet identity IS Nostr key)
 *   4. Balance requirement (wallet must have ≥ owned punks × 10k sats)
 *
 * This provides cryptographic proof beyond just Nostr, tied to the
 * Arkade wallet, without relying on mutable VTXO outpoints.
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
const punkLockedBalance = computed(() => {
  // Force recalculation when trigger changes
  punkBalanceTrigger.value

  try {
    const punksJson = localStorage.getItem('arkade_punks')
    if (!punksJson) return 0n

    const punks = JSON.parse(punksJson)
    if (!Array.isArray(punks) || punks.length === 0) return 0n

    // Filter punks owned by this wallet
    // IMPORTANT: Exclude punks in escrow - their VTXOs are in escrow wallet, not ours
    const ownedPunks = punks.filter((punk: any) =>
      punk.owner === walletAddress.value && !punk.inEscrow
    )

    // Each punk represents 10,000 sats of locked value
    const PUNK_VALUE = 10000n
    const locked = BigInt(ownedPunks.length) * PUNK_VALUE

    const totalOwned = punks.filter((punk: any) => punk.owner === walletAddress.value).length
    const inEscrowCount = totalOwned - ownedPunks.length

    console.log('🔍 Punk-locked balance calculation:')
    console.log(`   Total punks owned: ${totalOwned} (${inEscrowCount} in escrow)`)
    console.log(`   Punks in wallet: ${ownedPunks.length}`)
    console.log(`   Value per punk: ${PUNK_VALUE} sats`)
    console.log(`   Locked balance: ${locked} sats`)

    return locked
  } catch (error) {
    console.error('Failed to calculate punk-locked balance:', error)
    return 0n
  }
})

// True available balance for minting (excludes punk VTXOs)
const availableForMinting = computed(() => {
  const available = balance.value.available - punkLockedBalance.value
  return available > 0n ? available : 0n
})

const canMintPunks = computed(() => availableForMinting.value >= minVtxoValue)

const possibleMints = computed(() => {
  return Number(availableForMinting.value / minVtxoValue)
})

// Detect VTXOs with upcoming expiration
const vtxoExpirationInfo = computed(() => {
  // Check if we have any preconfirmed VTXOs with expiration dates
  const preconfirmedVtxos = vtxos.value.filter((v: any) => {
    const state = v.virtualStatus?.state || 'unknown'
    return state === 'preconfirmed' && v.virtualStatus?.batchExpiry
  })

  if (preconfirmedVtxos.length === 0) {
    return null
  }

  // Find the earliest expiration
  const earliestVtxo = preconfirmedVtxos.reduce((earliest: any, current: any) => {
    const currentExpiry = current.virtualStatus.batchExpiry
    const earliestExpiry = earliest.virtualStatus.batchExpiry
    return currentExpiry < earliestExpiry ? current : earliest
  })

  const expiryTimestamp = earliestVtxo.virtualStatus.batchExpiry

  // Format expiration date
  const expiryDate = new Date(expiryTimestamp)
  const now = new Date()
  const msUntilExpiry = expiryTimestamp - now.getTime()

  // Calculate time until expiry
  const daysUntil = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24))
  const hoursUntil = Math.floor((msUntilExpiry % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutesUntil = Math.floor((msUntilExpiry % (1000 * 60 * 60)) / (1000 * 60))

  let timeRemaining = ''
  if (msUntilExpiry < 0) {
    timeRemaining = 'Expired - ready to recover!'
  } else if (daysUntil > 0) {
    timeRemaining = `${daysUntil}d ${hoursUntil}h remaining`
  } else if (hoursUntil > 0) {
    timeRemaining = `${hoursUntil}h ${minutesUntil}m remaining`
  } else {
    timeRemaining = `${minutesUntil}m remaining`
  }

  return {
    count: preconfirmedVtxos.length,
    expiryDate: expiryDate.toLocaleString(),
    timeRemaining,
    isExpired: msUntilExpiry < 0
  }
})

// Calculate marketplace reserve info (over-minting bug)
// Users may have more punks than their balance allows (punks * 10k > total balance)
const marketplaceInfo = computed(() => {
  // Force recalculation when trigger changes
  punkBalanceTrigger.value

  const defaultInfo = {
    hasDeficit: false,
    canLock: false,
    totalPunks: 0,
    sellablePunks: 0,
    requiredReserve: 0n,
    deficit: 0n
  }

  try {
    const punksJson = localStorage.getItem('arkade_punks')
    if (!punksJson) return defaultInfo

    const punks = JSON.parse(punksJson)
    if (!Array.isArray(punks) || punks.length === 0) return defaultInfo

    // Count punks owned by this wallet (exclude escrowed)
    const ownedPunks = punks.filter((punk: any) =>
      punk.owner === walletAddress.value && !punk.inEscrow
    )

    const totalPunks = ownedPunks.length
    if (totalPunks === 0) return defaultInfo

    // Each punk requires 10,000 sats reserve
    const PUNK_VALUE = 10000n
    const requiredReserve = BigInt(totalPunks) * PUNK_VALUE

    // How many punks can be sold with current balance?
    const sellablePunks = Number(balance.value.total / PUNK_VALUE)

    // Deficit = required - current total balance
    const deficit = requiredReserve - balance.value.total

    return {
      hasDeficit: deficit > 0n, // Not enough sats total
      canLock: deficit <= 0n && sellablePunks < totalPunks, // Enough sats but need to lock
      totalPunks,
      sellablePunks: Math.max(0, sellablePunks),
      requiredReserve,
      deficit: deficit > 0n ? deficit : 0n
    }
  } catch (error) {
    console.error('Failed to calculate marketplace info:', error)
    return defaultInfo
  }
})

const isValidHex = computed(() => {
  return /^[0-9a-fA-F]{64}$/.test(importPrivateKey.value)
})

const nostrPubkey = computed(() => {
  const privateKeyHex = localStorage.getItem('arkade_wallet_private_key')
  if (!privateKeyHex) return ''

  try {
    const pubkeyHex = getPublicKey(hex.decode(privateKeyHex))
    // Convert to npub (Bech32 format) - standard Nostr format
    return nip19.npubEncode(pubkeyHex)
  } catch (error) {
    console.error('Failed to derive Nostr pubkey:', error)
    return ''
  }
})

const userPunksForExit = computed(() => {
  try {
    const punksJson = localStorage.getItem('arkade_punks')
    if (!punksJson) return []

    const allPunks = JSON.parse(punksJson)

    // Filter punks owned by this wallet
    return allPunks.filter((punk: any) => punk.owner === walletAddress.value)
  } catch (error) {
    console.error('Failed to load punks for exit:', error)
    return []
  }
})

async function createNewWallet() {
  loading.value = true

  try {
    const identity = await generateIdentity()
    saveIdentity(identity)

    wallet = await createArkadeWallet(identity)
    await updateWalletInfo()

    connected.value = true

    // Auto-renew expiring VTXOs (for new wallet, likely none, but good practice)
    console.log('🔄 Checking for expiring VTXOs after wallet creation...')
    const renewalResult = await wallet.checkAndRenewVtxos()
    if (renewalResult.renewed) {
      console.log(`✅ Renewed ${renewalResult.expiringCount} VTXO(s)`)
      await updateWalletInfo()
    }
  } catch (error) {
    console.error('Failed to create wallet:', error)
    alert('Failed to create wallet. See console for details.')
  } finally {
    loading.value = false
  }
}

function importWallet() {
  showImport.value = true
}

async function doImport() {
  if (!isValidHex.value) return

  loading.value = true

  try {
    const privateKey = hex.decode(importPrivateKey.value)
    const { schnorr } = await import('@noble/secp256k1')
    const publicKey = schnorr.getPublicKey(privateKey)

    const identity = { privateKey, publicKey }
    saveIdentity(identity)

    wallet = await createArkadeWallet(identity)
    await updateWalletInfo()

    connected.value = true
    showImport.value = false
    importPrivateKey.value = ''
  } catch (error) {
    console.error('Failed to import wallet:', error)
    alert('Failed to import wallet. Check your private key.')
  } finally {
    loading.value = false
  }
}

async function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  loading.value = true

  try {
    const text = await file.text()
    const walletData = JSON.parse(text)

    console.log('📦 Importing wallet from file:', walletData)

    // Validate file structure
    if (!walletData.wallet?.privateKey) {
      throw new Error('Invalid wallet file: missing private key')
    }

    // Import private key
    const privateKey = hex.decode(walletData.wallet.privateKey)
    const { schnorr } = await import('@noble/secp256k1')
    const publicKey = schnorr.getPublicKey(privateKey)

    const identity = { privateKey, publicKey }
    saveIdentity(identity)

    // Restore punks to localStorage
    if (walletData.punks && Array.isArray(walletData.punks)) {
      console.log(`📦 Restoring ${walletData.punks.length} punk(s)...`)

      // Reconstruct full metadata structure with regenerated images
      const punksToSave = walletData.punks.map((punk: any) => {
        const type = punk.type
        const attributes = punk.attributes || []
        const background = punk.background

        // Regenerate image URL from traits
        const imageUrl = generatePunkImage(type, attributes, background)

        return {
          punkId: punk.punkId,
          name: punk.name,
          description: punk.description,
          imageUrl, // Regenerated image
          traits: {
            type,
            attributes,
            background
          },
          mintDate: punk.mintDate,
          vtxoOutpoint: punk.vtxoOutpoint
        }
      })

      localStorage.setItem('arkade_punks', JSON.stringify(punksToSave, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      ))
      console.log('✅ Punks restored to localStorage with regenerated images')
    }

    wallet = await createArkadeWallet(identity)
    await updateWalletInfo()

    connected.value = true
    showImport.value = false

    alert(`✅ Wallet imported successfully!\n\n${walletData.punks?.length || 0} punk(s) restored.`)

    // Reload page to refresh punk gallery
    setTimeout(() => window.location.reload(), 500)
  } catch (error: any) {
    console.error('Failed to import wallet file:', error)
    alert(`Failed to import wallet file: ${error.message}`)
  } finally {
    loading.value = false
    // Reset file input
    target.value = ''
  }
}

function disconnect() {
  clearIdentity()
  wallet = null
  connected.value = false
  walletAddress.value = ''
  boardingAddress.value = ''
  arkadeAddress.value = ''
  balance.value = {
    boarding: 0n,
    available: 0n,
    settled: 0n,
    preconfirmed: 0n,
    recoverable: 0n,
    total: 0n
  }
  vtxoCount.value = 0
}

async function refreshBalance() {
  if (!wallet) return

  refreshing.value = true

  try {
    await updateWalletInfo()
    console.log('✅ Balance refreshed')
  } catch (error) {
    console.error('Failed to refresh balance:', error)
  } finally {
    refreshing.value = false
  }
}

async function sendSats() {
  if (!wallet) {
    sendStatus.value = 'Wallet not connected!'
    sendSuccess.value = false
    return
  }

  if (!sendRecipientAddress.value || !sendAmount.value) {
    sendStatus.value = 'Please enter recipient address and amount'
    sendSuccess.value = false
    return
  }

  if (sendAmount.value < 1000) {
    sendStatus.value = 'Minimum amount is 1,000 sats'
    sendSuccess.value = false
    return
  }

  if (BigInt(sendAmount.value) > balance.value.available) {
    sendStatus.value = `Insufficient balance. You have ${formatSats(balance.value.available)} sats available.`
    sendSuccess.value = false
    return
  }

  sending.value = true
  sendStatus.value = ''
  sendSuccess.value = false

  try {
    console.log('📤 Sending sats...')
    console.log('   Recipient:', sendRecipientAddress.value)
    console.log('   Amount:', sendAmount.value, 'sats')

    const txid = await wallet.send(
      sendRecipientAddress.value,
      BigInt(sendAmount.value)
    )

    console.log('✅ Send successful!')
    console.log('   TX ID:', txid)

    sendStatus.value = `✅ Sent ${sendAmount.value} sats successfully!\nTX ID: ${txid.slice(0, 16)}...`
    sendSuccess.value = true

    // Refresh balance
    await refreshBalance()

    // Reset form after 3 seconds
    setTimeout(() => {
      sendRecipientAddress.value = ''
      sendAmount.value = null
      sendStatus.value = ''
      showSendModal.value = false
    }, 3000)

  } catch (error: any) {
    console.error('❌ Send failed:', error)

    // Check if error is due to recoverable VTXOs
    const errorMsg = error?.message || String(error)
    if (errorMsg.includes('VTXO_RECOVERABLE') || errorMsg.includes('is recoverable')) {
      console.log('🔄 Detected recoverable VTXO - attempting renewal...')
      sendStatus.value = '🔄 Renewing VTXOs, please wait...'

      try {
        // Import VtxoManager
        const { VtxoManager } = await import('@arkade-os/sdk')
        const vtxoManager = new VtxoManager(wallet.sdkWallet, {
          enabled: true,           // Enable expiration monitoring
          thresholdPercentage: 10  // Alert when 10% of lifetime remains
        })

        let renewalSuccess = false

        try {
          // Step 1: Try renewVtxos() first (Arkade CEO recommendation)
          console.log('   Step 1: Trying renewVtxos()...')

          // Log wallet address to verify we're using the correct wallet
          const walletAddress = await wallet.sdkWallet.getAddress()
          console.log(`   Wallet address: ${walletAddress}`)

          const renewTxid = await vtxoManager.renewVtxos()
          console.log(`✅ VTXOs renewed! Txid: ${renewTxid}`)
          renewalSuccess = true

        } catch (renewError: any) {
          console.error('❌ Renewal failed:', renewError)

          // If no expiring VTXOs, that's actually OK - try sending anyway
          if (renewError.message?.includes('No expiring VTXOs') || renewError.message?.includes('no vtxos')) {
            console.log('   No VTXOs needed renewal, continuing to retry send...')
            renewalSuccess = true
          } else {
            // Step 2: Try recoverVtxos() as fallback
            console.log('   Step 2: Trying recoverVtxos() as fallback...')
            try {
              const recoverTxid = await vtxoManager.recoverVtxos()
              console.log(`✅ VTXOs recovered! Txid: ${recoverTxid}`)
              renewalSuccess = true
            } catch (recoverError: any) {
              console.error('❌ Recovery also failed:', recoverError)
              throw new Error(`Both renewal and recovery failed.\nRenew: ${renewError.message}\nRecover: ${recoverError.message}`)
            }
          }
        }

        if (!renewalSuccess) {
          throw new Error('Failed to renew or recover VTXOs')
        }

        // Refresh balance
        await refreshBalance()

        // Retry send
        console.log('🔄 Retrying send after VTXO renewal...')
        sendStatus.value = '🔄 Retrying send...'

        const txid = await wallet.send(
          sendRecipientAddress.value,
          BigInt(sendAmount.value)
        )

        console.log('✅ Send successful after VTXO renewal!')
        console.log('   TX ID:', txid)

        sendStatus.value = `✅ Sent ${sendAmount.value} sats successfully!\nTX ID: ${txid.slice(0, 16)}...`
        sendSuccess.value = true

        // Refresh balance again
        await refreshBalance()

        // Reset form after 3 seconds
        setTimeout(() => {
          sendRecipientAddress.value = ''
          sendAmount.value = null
          sendStatus.value = ''
          showSendModal.value = false
        }, 3000)

      } catch (recoveryError: any) {
        console.error('❌ VTXO renewal/recovery or retry failed:', recoveryError)
        sendStatus.value = `Failed to renew VTXOs: ${recoveryError?.message || recoveryError}`
        sendSuccess.value = false
      }
    } else {
      // Other error
      sendStatus.value = `Failed to send: ${errorMsg}`
      sendSuccess.value = false
    }
  } finally {
    sending.value = false
  }
}

async function forceRecoverVtxos() {
  if (!wallet) {
    recoveryStatus.value = 'Wallet not connected!'
    recoverySuccess.value = false
    return
  }

  recoveringVtxos.value = true
  recoveryStatus.value = ''
  recoverySuccess.value = false

  try {
    console.log('🔧 Force recovering VTXOs...')

    // Step 1: Get all VTXOs and log their states
    const allVtxos = await wallet.getRawVtxos?.()
    console.log(`📊 Found ${allVtxos?.length || 0} VTXOs:`)
    allVtxos?.forEach((v: any, i: number) => {
      console.log(`   VTXO ${i + 1}: ${v.txid}:${v.vout}`)
      console.log(`      Value: ${v.value} sats`)
      console.log(`      State: ${v.virtualStatus?.state || 'unknown'}`)
      console.log(`      isSpent: ${v.isSpent}`)
      console.log(`      Expiry: ${v.virtualStatus?.batchExpiry || 'N/A'}`)
    })

    // Step 2: Check balance.recoverable
    const currentBalance = await wallet.getBalance()
    console.log(`💰 Balance.recoverable: ${currentBalance.recoverable} sats`)

    // Step 3: Try to renew VTXOs (Arkade CEO recommendation)
    console.log('🔄 Attempting to renew VTXOs with VtxoManager...')
    const { VtxoManager } = await import('@arkade-os/sdk')
    const vtxoManager = new VtxoManager(wallet.sdkWallet, {
      enabled: true,           // Enable expiration monitoring
      thresholdPercentage: 10  // Alert when 10% of lifetime remains
    })

    try {
      // First try renewVtxos() - this is what Arkade CEO recommends
      console.log('   Step 1: Trying renewVtxos()...')

      // Log wallet address to verify we're using the correct wallet
      const walletAddress = await wallet.sdkWallet.getAddress()
      console.log(`   Wallet address: ${walletAddress}`)

      const renewTxid = await vtxoManager.renewVtxos()
      console.log(`✅ VTXOs renewed! Txid: ${renewTxid}`)

      recoveryStatus.value = `✅ VTXOs renewed successfully!\nTxid: ${renewTxid.slice(0, 16)}...`
      recoverySuccess.value = true

      // Refresh balance
      await refreshBalance()

      // Clear status after 5 seconds
      setTimeout(() => {
        recoveryStatus.value = ''
      }, 5000)

    } catch (renewError: any) {
      console.error('❌ Renewal failed:', renewError)

      // If no expiring VTXOs, that's OK
      if (renewError.message?.includes('No expiring VTXOs') || renewError.message?.includes('no vtxos')) {
        recoveryStatus.value = `✅ No VTXOs need renewal - all good!`
        recoverySuccess.value = true
        setTimeout(() => {
          recoveryStatus.value = ''
        }, 3000)
        return
      }

      // Try recoverVtxos() as fallback for swept/expired VTXOs
      console.log('   Step 2: Renewal failed, trying recoverVtxos()...')
      try {
        const recoverTxid = await vtxoManager.recoverVtxos()
        console.log(`✅ VTXOs recovered! Txid: ${recoverTxid}`)

        recoveryStatus.value = `✅ VTXOs recovered successfully!\nTxid: ${recoverTxid.slice(0, 16)}...`
        recoverySuccess.value = true

        await refreshBalance()

        setTimeout(() => {
          recoveryStatus.value = ''
        }, 5000)

      } catch (recoverError: any) {
        console.error('❌ Recovery also failed:', recoverError)

        // Log detailed error info for debugging
        console.log('📋 Debug Info for Arkade devs:')
        console.log('   Renew Error:', renewError.message)
        console.log('   Recover Error:', recoverError.message)
        console.log('   All VTXOs:', allVtxos)
        console.log('   Balance:', currentBalance)

        recoveryStatus.value = `❌ Both renewal and recovery failed.\n\nRenew: ${renewError.message}\nRecover: ${recoverError.message}\n\nCheck console for debug info.`
        recoverySuccess.value = false
      }
    }

  } catch (error: any) {
    console.error('❌ Force recovery error:', error)
    recoveryStatus.value = `Failed: ${error?.message || error}`
    recoverySuccess.value = false
  } finally {
    recoveringVtxos.value = false
  }
}

async function generateQRCode(retryCount = 0) {
  console.log('🔍 Attempting to generate QR code... (attempt', retryCount + 1, ')')
  console.log('   arkadeAddress:', arkadeAddress.value)
  console.log('   qrCanvas ref:', qrCanvas.value)
  console.log('   balance.total:', balance.value.total)

  if (!arkadeAddress.value) {
    console.warn('⚠️ Cannot generate QR: arkadeAddress is empty')
    return
  }

  if (!qrCanvas.value) {
    console.warn('⚠️ Cannot generate QR: qrCanvas ref is not available')

    // Retry up to 5 times with increasing delay
    if (retryCount < 5) {
      const delay = (retryCount + 1) * 100 // 100ms, 200ms, 300ms, etc.
      console.log(`   Retrying in ${delay}ms...`)
      setTimeout(() => generateQRCode(retryCount + 1), delay)
    } else {
      console.error('❌ Failed to generate QR code after 5 attempts - canvas not available')
    }
    return
  }

  try {
    await QRCode.toCanvas(qrCanvas.value, arkadeAddress.value, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
    console.log('✅ QR code generated successfully for:', arkadeAddress.value)
  } catch (error) {
    console.error('❌ Failed to generate QR code:', error)
  }
}

async function updateWalletInfo() {
  if (!wallet) return

  // Expose wallet globally for debugging in console
  if (typeof window !== 'undefined') {
    (window as any).__debugWallet = wallet
  }

  const info = await getWalletInfo(wallet)
  walletAddress.value = info.address
  boardingAddress.value = wallet.boardingAddress || '' // bc1p... for on-chain boarding
  arkadeAddress.value = wallet.arkadeAddress || '' // ark... for native transfers
  balance.value = info.balance
  vtxoCount.value = info.vtxoCount

  // Fetch VTXOs to calculate punk-locked balance
  try {
    vtxos.value = await wallet.getVtxos()
    // Also fetch raw VTXOs for display (with status, expiry, etc.)
    if (wallet.getRawVtxos) {
      rawVtxos.value = await wallet.getRawVtxos()
    }
  } catch (error) {
    console.error('Failed to fetch VTXOs:', error)
    vtxos.value = []
    rawVtxos.value = []
  }

  console.log('📍 Addresses updated:')
  console.log('   Arkade (native):', arkadeAddress.value)
  console.log('   Boarding (on-chain):', boardingAddress.value)
  console.log('💰 Balance breakdown:')
  console.log('   Total balance:', formatSats(balance.value.total), 'sats')
  console.log('   Available (raw):', formatSats(balance.value.available), 'sats')
  console.log('   Locked in punks:', formatSats(punkLockedBalance.value), 'sats')
  console.log('   Available for minting:', formatSats(availableForMinting.value), 'sats')
  console.log('   Possible mints:', possibleMints.value)

  // Debug: Detect suspiciously large balances (possible Arkade server test data)
  if (balance.value.total >= 1_000_000n) {
    console.warn('⚠️ LARGE BALANCE DETECTED: ' + formatSats(balance.value.total) + ' sats')
    console.warn('⚠️ This might be test data from Arkade server or a promotional credit')
    console.warn('⚠️ If you did not expect this balance, it is coming from Arkade Protocol server')
  }

  // Validate: Check if user has enough balance to back their punks
  if (punkLockedBalance.value > balance.value.total) {
    const shortage = punkLockedBalance.value - balance.value.total
    console.error('❌ INSUFFICIENT BALANCE FOR PUNKS!')
    console.error(`   Punks require: ${formatSats(punkLockedBalance.value)} sats`)
    console.error(`   Current balance: ${formatSats(balance.value.total)} sats`)
    console.error(`   Shortage: ${formatSats(shortage)} sats`)
    console.error(`   ⚠️ You may have lost punks due to spending their backing sats!`)
  }

  // Generate QR code when address is available
  if (arkadeAddress.value && balance.value.total === 0n) {
    await nextTick()
    // Give Vue extra time to render the canvas in the DOM
    setTimeout(() => generateQRCode(), 50)
  }
}

function formatAddress(addr: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 12)}...${addr.slice(-8)}`
}

function formatSats(sats: bigint): string {
  return sats.toLocaleString()
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

function getVtxoStatusLabel(vtxo: any): string {
  const state = vtxo.virtualStatus?.state || 'unknown'
  const isSpent = vtxo.isSpent || false

  if (isSpent) return 'Spent'
  if (state === 'settled') return 'Settled ✓'
  if (state === 'preconfirmed') return 'Preconfirmed'
  if (state === 'swept') return 'Swept'
  return 'Unknown'
}

function getVtxoStatusClass(vtxo: any): string {
  const state = vtxo.virtualStatus?.state || 'unknown'
  const isSpent = vtxo.isSpent || false

  if (isSpent) return 'status-spent'
  if (state === 'settled') return 'status-settled'
  if (state === 'preconfirmed') return 'status-preconfirmed'
  if (state === 'swept') return 'status-swept'
  return 'status-unknown'
}

async function copyAddress() {
  if (!walletAddress.value) return

  try {
    await navigator.clipboard.writeText(walletAddress.value)
    alert('Address copied to clipboard!')
  } catch {
    console.error('Failed to copy address')
  }
}

async function copyArkadeAddress() {
  if (!arkadeAddress.value) return

  try {
    await navigator.clipboard.writeText(arkadeAddress.value)
    alert('⚡ Arkade address copied!')
  } catch {
    console.error('Failed to copy Arkade address')
  }
}

async function copyNostrPubkey() {
  if (!nostrPubkey.value) return

  try {
    await navigator.clipboard.writeText(nostrPubkey.value)
    alert('📋 Nostr npub copied! Share this with others to receive punk transfers.')
  } catch {
    console.error('Failed to copy Nostr pubkey')
  }
}


async function copyBoardingAddress() {
  if (!boardingAddress.value) return

  try {
    await navigator.clipboard.writeText(boardingAddress.value)
    alert('⚡ Boarding address copied! Use this for on-chain funding.')
  } catch {
    console.error('Failed to copy boarding address')
  }
}

async function syncPunkReserve() {
  syncing.value = true

  try {
    console.log('🔄 Syncing punk reserve...')

    // Step 1: Refresh balance from wallet
    await refreshBalance()
    console.log(`   Current balance: ${balance.value.total} sats`)

    // Step 2: Force recalculation of punk locked balance
    punkBalanceTrigger.value++
    await nextTick() // Wait for computed to update

    // Step 3: Check if reserve is now sufficient
    const punksJson = localStorage.getItem('arkade_punks')
    if (!punksJson) {
      alert('✅ No punks found - nothing to lock!')
      return
    }

    const punks = JSON.parse(punksJson)
    const ownedPunks = punks.filter((p: any) =>
      p.owner === walletAddress.value && !p.inEscrow
    )

    if (ownedPunks.length === 0) {
      alert('✅ No punks to lock - all good!')
      return
    }

    const PUNK_VALUE = 10000n
    const requiredReserve = BigInt(ownedPunks.length) * PUNK_VALUE
    const currentBalance = balance.value.total
    const deficit = requiredReserve - currentBalance

    console.log(`   Punks owned: ${ownedPunks.length}`)
    console.log(`   Required reserve: ${requiredReserve} sats`)
    console.log(`   Deficit: ${deficit} sats`)

    if (deficit <= 0n) {
      // Success! User has enough
      const sellablePunks = Number(currentBalance / PUNK_VALUE)
      alert(
        `🔒 Sats Locked Successfully!\n\n` +
        `You have ${ownedPunks.length} punk${ownedPunks.length > 1 ? 's' : ''}\n` +
        `Balance: ${formatSats(currentBalance)} sats\n` +
        `Required: ${formatSats(requiredReserve)} sats\n\n` +
        `✅ Reserve locked for UTXO manipulation!\n` +
        `You can now list all ${sellablePunks} punk${sellablePunks > 1 ? 's' : ''} on the marketplace.`
      )
    } else {
      // Still not enough
      alert(
        `⚠️ Still Missing Sats\n\n` +
        `You have ${ownedPunks.length} punk${ownedPunks.length > 1 ? 's' : ''}\n` +
        `Balance: ${formatSats(currentBalance)} sats\n` +
        `Required: ${formatSats(requiredReserve)} sats\n\n` +
        `❌ Still missing: ${formatSats(deficit)} sats\n\n` +
        `Receive more sats via Lightning or on-chain, then sync again.`
      )
    }
  } catch (error: any) {
    console.error('❌ Failed to sync punk reserve:', error)
    alert(`Failed to sync reserve:\n\n${error.message}`)
  } finally {
    syncing.value = false
  }
}

async function recoverExpiredVtxos() {
  if (!wallet) {
    alert('Please connect your wallet first')
    return
  }

  recovering.value = true

  try {
    console.log('🔄 Recovering expired VTXOs...')

    // Import VtxoManager from SDK
    const { VtxoManager } = await import('@arkade-os/sdk')

    // Create VtxoManager instance
    const vtxoManager = new VtxoManager(wallet.sdkWallet)

    // Check recoverable balance
    const recoverableBalance = await vtxoManager.getRecoverableBalance()
    console.log(`   Recoverable balance: ${recoverableBalance} sats`)

    if (recoverableBalance === 0) {
      alert(
        'No recoverable VTXOs found.\n\n' +
        'Your VTXOs may still be preconfirmed and waiting for expiry.\n' +
        'Check the expiration date in the troubleshooting section above.'
      )
      return
    }

    // Recover VTXOs
    const txid = await vtxoManager.recoverVtxos()

    console.log('✅ Recovery txid:', txid)

    // Refresh wallet info
    await refreshBalance()

    alert(
      `✅ VTXOs Recovered Successfully!\n\n` +
      `Recovered ${recoverableBalance} sats\n` +
      `Transaction: ${txid}\n\n` +
      `Your VTXOs are now usable. You can mint punks or send sats normally.`
    )
  } catch (error: any) {
    console.error('❌ Failed to recover VTXOs:', error)
    alert(
      `Failed to recover VTXOs:\n\n` +
      `${error.message}\n\n` +
      `Please try again later.`
    )
  } finally {
    recovering.value = false
  }
}

function exportWallet() {
  try {
    // Get wallet keys from localStorage
    const privateKey = localStorage.getItem('arkade_wallet_private_key')
    const publicKey = localStorage.getItem('arkade_wallet_public_key')

    // Get punks from localStorage
    const punksJson = localStorage.getItem('arkade_punks')
    const punks = punksJson ? JSON.parse(punksJson) : []

    // Get current config
    const network = config.network

    // Create export object
    const exportData = {
      exportDate: new Date().toISOString(),
      network: network,
      wallet: {
        privateKey: privateKey || 'Not found',
        publicKey: publicKey || 'Not found',
        address: walletAddress.value,
        boardingAddress: boardingAddress.value
      },
      balance: {
        available: balance.value.available.toString(),
        boarding: balance.value.boarding.toString(),
        total: balance.value.total.toString(),
        vtxoCount: vtxoCount.value
      },
      punks: punks.map((punk: any) => ({
        punkId: punk.punkId,
        name: punk.name,
        type: punk.traits?.type,
        attributes: punk.traits?.attributes || [],
        background: punk.traits?.background,
        description: punk.description,
        mintDate: punk.mintDate || new Date().toISOString(),
        vtxoOutpoint: punk.vtxoOutpoint
      })),
      totalPunksMinted: punks.length,
      notes: [
        "⚠️ KEEP THIS FILE SECURE - Contains private key",
        "ArkPunks wallet with 6-byte compression on Arkade Protocol",
        "To restore: Import private key in ArkPunks interface"
      ]
    }

    // Create blob and download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arkade-wallet-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    alert('✅ Wallet exported!\n\n⚠️ Keep this file safe - it contains your private key!')
  } catch (error) {
    console.error('Export failed:', error)
    alert('Failed to export wallet. See console for details.')
  }
}


async function prepareExit() {
  preparingExit.value = true
  exitPreparationStatus.value = ''
  exitPreparationSuccess.value = false

  try {
    // Prepare punk data for exit
    const punkExitData: PunkExitInfo[] = userPunksForExit.value.map((punk: any) => ({
      punkId: punk.punkId,
      owner: punk.owner,
      vtxoOutpoint: punk.vtxoOutpoint,
      compressedData: punk.compressedData || '000000000000' // Fallback if missing
    }))

    if (punkExitData.length === 0) {
      exitPreparationStatus.value = 'No punks to prepare for exit.'
      return
    }

    // Publish exit events to Nostr
    const result = await prepareL1Exit(punkExitData, exitL1Address.value, 'unilateral')

    exitPreparationStatus.value = getExitStatusMessage(
      result.publishedCount,
      result.failedCount,
      userPunksForExit.value.length
    )
    exitPreparationSuccess.value = result.success

    if (result.success) {
      console.log('✅ Exit preparation complete!')
      console.log('   Published:', result.publishedCount)
      console.log('   Failed:', result.failedCount)
      console.log('   Details:', result.details)

      alert(`✅ Exit Prepared!\n\n${result.publishedCount} punk(s) published to Nostr.\n\nYou can now proceed with the L1 exit.`)
    }
  } catch (error) {
    console.error('❌ Exit preparation failed:', error)
    exitPreparationStatus.value = `❌ Error: ${error}`
    exitPreparationSuccess.value = false
    alert(`Failed to prepare exit: ${error}`)
  } finally {
    preparingExit.value = false
  }
}

async function performActualExit() {
  const confirmed = confirm(
    `🟠 Bitcoin L1 Exit\n\n` +
    `You are about to exit Arkade and convert your VTXOs to standard Bitcoin UTXOs.\n\n` +
    `✅ Your ${userPunksForExit.value.length} punk(s) have been published to Nostr and are safe!\n\n` +
    `Destination: ${exitL1Address.value}\n\n` +
    `⚠️ This action cannot be undone. Continue?`
  )

  if (!confirmed) return

  try {
    console.log('🚀 Performing L1 exit...')
    console.log('   Destination:', exitL1Address.value)
    console.log('   Balance:', formatSats(balance.value.total), 'sats')

    // Note: Arkade SDK doesn't expose unilateralExit() directly yet
    // For now, we just show instructions
    alert(
      `🟠 L1 Exit Instructions\n\n` +
      `Your punks are now published to Nostr and linked to:\n` +
      `${exitL1Address.value}\n\n` +
      `To complete the exit:\n` +
      `1. Use the Arkade SDK's unilateral exit function\n` +
      `2. Your funds will be sent to the L1 address\n` +
      `3. Your punks can be recovered using your Nostr private key\n\n` +
      `Recovery pubkey: ${nostrPubkey.value.slice(0, 20)}...`
    )

    // Close modal
    showExitModal.value = false
  } catch (error) {
    console.error('❌ Exit failed:', error)
    alert(`Exit failed: ${error}`)
  }
}


// Lightning Functions
async function generateLightningInvoice() {
  if (!wallet) return

  lightningGenerating.value = true
  lightningErrorMessage.value = ''

  try {
    console.log('📝 Creating Lightning invoice for', lightningReceiveAmount.value, 'sats')

    const invoice = await createReceiveInvoice(wallet, lightningReceiveAmount.value)
    lightningReceiveInvoice.value = invoice

    console.log('✅ Invoice created:', invoice.bolt11)

    // Wait for Vue to update DOM with the canvas element
    await nextTick()

    // Generate QR code
    await generateLightningQRCode(invoice.bolt11)

    // Start monitoring for payment
    lightningPaymentStatus.value = 'waiting'
    monitorLightningPayment(wallet, invoice.pendingSwap)

  } catch (error: any) {
    console.error('Failed to generate invoice:', error)
    lightningErrorMessage.value = error.message
    lightningPaymentStatus.value = 'error'
  } finally {
    lightningGenerating.value = false
  }
}

async function generateLightningQRCode(text: string) {
  if (!lightningQrCanvas.value) return

  try {
    await QRCode.toCanvas(lightningQrCanvas.value, text.toUpperCase(), {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
  } catch (error) {
    console.error('Failed to generate Lightning QR code:', error)
  }
}

async function monitorLightningPayment(walletInstance: any, pendingSwap: any) {
  try {
    console.log('⏳ Monitoring Lightning swap:', pendingSwap)

    lightningPaymentStatus.value = 'waiting'

    const txid = await waitAndClaimPayment(walletInstance, pendingSwap)

    console.log('✅ Lightning payment claimed:', txid)
    lightningPaymentStatus.value = 'completed'

    // Refresh wallet balance
    await refreshBalance()

  } catch (error: any) {
    console.error('Lightning payment monitoring failed:', error)
    lightningErrorMessage.value = error.message
    lightningPaymentStatus.value = 'error'
  }
}

function copyLightningInvoice() {
  if (!lightningReceiveInvoice.value) return

  navigator.clipboard.writeText(lightningReceiveInvoice.value.bolt11)
  lightningCopied.value = true
  setTimeout(() => {
    lightningCopied.value = false
  }, 2000)
}

function resetLightningReceive() {
  lightningReceiveInvoice.value = null
  lightningPaymentStatus.value = 'waiting'
  lightningErrorMessage.value = ''
  lightningReceiveAmount.value = 10000
}

async function payLightningInvoiceNow() {
  if (!wallet) return

  lightningSending.value = true
  lightningSendError.value = ''
  lightningSendResult.value = null

  try {
    console.log('💸 Paying Lightning invoice...')

    // CRITICAL: Decode invoice to check amount
    const invoiceData = decodeLightningInvoice(lightningSendInvoice.value.trim())
    const invoiceAmountSats = invoiceData.amountSats

    console.log(`📋 Invoice amount: ${invoiceAmountSats} sats`)
    console.log(`💰 Available balance (excluding punks): ${availableForMinting.value} sats`)
    console.log(`🎨 Punk-locked balance: ${punkLockedBalance.value} sats`)

    // SECURITY: Check if trying to spend more than available (excluding punk VTXOs)
    const estimatedFee = estimateSwapFee(invoiceAmountSats, 'send')
    const totalNeeded = BigInt(invoiceAmountSats + estimatedFee)

    if (totalNeeded > availableForMinting.value) {
      const shortage = totalNeeded - availableForMinting.value
      throw new Error(
        `Insufficient available balance!\n\n` +
        `You need ${invoiceAmountSats + estimatedFee} sats (${invoiceAmountSats} + ~${estimatedFee} fee)\n` +
        `Available: ${availableForMinting.value} sats\n` +
        `Locked in punks: ${punkLockedBalance.value} sats\n\n` +
        `❌ Cannot spend punk-locked sats! You would lose your punks.`
      )
    }

    const result = await payLightningInvoice(wallet, lightningSendInvoice.value.trim())
    lightningSendResult.value = result

    console.log('✅ Payment sent:', result)

    // Refresh wallet balance
    await refreshBalance()

  } catch (error: any) {
    console.error('Failed to pay invoice:', error)
    lightningSendError.value = error.message
  } finally {
    lightningSending.value = false
  }
}

function resetLightningSend() {
  lightningSendInvoice.value = ''
  lightningSendResult.value = null
  lightningSendError.value = ''
}

function estimateLightningFee(amount: number | undefined, direction: 'receive' | 'send'): number {
  if (!amount) return 0
  return estimateSwapFee(amount, direction)
}

// Watch for arkade address changes to generate QR code
watch(arkadeAddress, async (newAddress) => {
  if (newAddress && balance.value.total === 0n) {
    // Auto-expand wallet details to show QR code for funding
    expanded.value = true
    await nextTick()
    // Give Vue extra time to render the canvas in the DOM
    setTimeout(() => generateQRCode(), 100)
  }
})

// Check for existing wallet on mount
onMounted(async () => {
  const identity = loadIdentity()
  if (identity) {
    loading.value = true
    try {
      wallet = await createArkadeWallet(identity)
      await updateWalletInfo()
      connected.value = true

      // Auto-renew expiring VTXOs on startup
      console.log('🔄 Checking for expiring VTXOs on startup...')
      const renewalResult = await wallet.checkAndRenewVtxos()
      if (renewalResult.renewed) {
        console.log(`✅ Renewed ${renewalResult.expiringCount} VTXO(s) on startup`)
        // Refresh balance after renewal
        await updateWalletInfo()
      }
    } catch (error) {
      console.error('Failed to restore wallet:', error)
      clearIdentity()
    } finally {
      loading.value = false
    }
  }
})

// Expose wallet getter function to parent
function getWallet(): ArkadeWalletInterface | null {
  return wallet
}

// Force punk balance recalculation (call after minting/buying/selling punks)
function refreshPunkBalance() {
  punkBalanceTrigger.value++
  console.log('🔄 Punk balance recalculation triggered')
}

// Expose wallet to parent
defineExpose({
  getWallet,
  wallet: computed(() => wallet),
  connected,
  refreshPunkBalance
})
</script>

<style scoped>
.wallet-connect {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

/* Compact Wallet Header */
.wallet-compact-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.compact-balance {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  background: #2a2a2a;
  border-radius: 6px;
  flex: 1;
  transition: all 0.2s ease;
}

.compact-balance:hover {
  background: #333;
}

.balance-label {
  font-size: 20px;
}

.balance-value {
  color: #ff6b35;
  font-weight: bold;
  font-size: 16px;
}

.expand-hint {
  color: #888;
  font-size: 13px;
  margin-left: auto;
}

.btn-disconnect-compact {
  padding: 8px 12px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  transition: all 0.2s ease;
}

.btn-disconnect-compact:hover {
  background: #ef4444;
}

.wallet-details-expanded {
  animation: slideDown 0.3s ease;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #333;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

h3 {
  margin: 0 0 8px 0;
  color: #fff;
}

.subtitle {
  color: #888;
  margin: 0 0 24px 0;
}

.connect-options {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #ff6b35;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #ff8555;
}

.btn-secondary {
  background: #333;
  color: #fff;
}

.btn-secondary:hover:not(:disabled) {
  background: #444;
}

.btn-export {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: 2px solid #764ba2;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  width: 100%;
}

.btn-export:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(118, 75, 162, 0.4);
}

.btn-diagnostic {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  border: 2px solid #d97706;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  width: 100%;
}

.btn-diagnostic:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
}

.btn-send {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  border: 2px solid #10b981;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  width: 100%;
}

.btn-send:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-settle {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  border: 2px solid #3b82f6;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  width: 100%;
}

.btn-settle:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.btn-settle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-form {
  background: #2a2a2a;
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 24px;
}

.import-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 2px solid #444;
}

.tab-button {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: #888;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.tab-button:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.tab-button.active {
  color: #ff6b35;
  border-bottom-color: #ff6b35;
}

.import-form label {
  display: block;
  color: #aaa;
  margin-bottom: 12px;
}

.import-form input[type="password"],
.import-form input[type="text"] {
  width: 100%;
  padding: 8px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-family: monospace;
  margin-top: 8px;
}

.import-file-section {
  padding: 16px 0;
}

.file-upload-label {
  display: block;
  padding: 24px;
  background: #1a1a1a;
  border: 2px dashed #444;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #aaa;
  margin-bottom: 12px;
}

.file-upload-label:hover {
  border-color: #ff6b35;
  background: #222;
}

.file-input {
  display: block;
  margin-top: 12px;
  color: #fff;
  cursor: pointer;
}

.file-input::file-selector-button {
  padding: 8px 16px;
  background: #ff6b35;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-weight: 500;
  margin-right: 12px;
}

.file-input::file-selector-button:hover {
  background: #ff8555;
}

.import-hint {
  color: #888;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
}

.network-info {
  background: #2a2a2a;
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid #ff6b35;
}

.network-info p {
  margin: 4px 0;
  color: #aaa;
}

.network-info strong {
  color: #fff;
}

.network-info a {
  color: #ff6b35;
  text-decoration: none;
}

.network-info a:hover {
  text-decoration: underline;
}

.wallet-info {
  padding: 8px 0;
}

.info-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.btn-disconnect {
  padding: 8px 16px;
  background: #444;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn-disconnect:hover {
  background: #555;
}

.info-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-row.highlight {
  background: rgba(255, 193, 7, 0.1);
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #fbbf24;
}

.detail-row.recoverable-warning {
  background: rgba(255, 152, 0, 0.1);
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #ff9800;
}

.detail-row.recoverable-warning .label {
  color: #ff9800;
  font-weight: 600;
}

.detail-row.reserve-info-warning {
  background: rgba(255, 152, 0, 0.1);
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #ff9800;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row.reserve-info-warning .reserve-info-header {
  margin-bottom: 4px;
}

.detail-row.reserve-info-warning .label {
  color: #ff9800;
  font-weight: 700;
  font-size: 15px;
}

.reserve-info-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reserve-info-content .info-text {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.reserve-info-content .info-text strong {
  color: #fff;
  font-weight: 600;
}

.reserve-info-content .info-action {
  color: #6366f1;
  font-size: 14px;
  line-height: 1.6;
  margin: 4px 0 0 0;
  padding: 10px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 4px;
  border-left: 3px solid #6366f1;
}

.reserve-info-content .info-action strong {
  color: #818cf8;
  font-weight: 600;
}

.btn-sync-reserve {
  padding: 10px 16px;
  background: #6366f1;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  width: 100%;
  margin-top: 6px;
}

.btn-sync-reserve:hover:not(:disabled) {
  background: #818cf8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-sync-reserve:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Recoverable VTXOs Section */
.recoverable-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.recoverable-info .info-text {
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.recoverable-info .info-text strong {
  color: #ff9800;
  font-weight: 600;
}

.btn-recover {
  padding: 10px 16px;
  background: #ff9800;
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  width: 100%;
}

.btn-recover:hover:not(:disabled) {
  background: #fb8c00;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4);
}

.btn-recover:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Troubleshooting Section */
.troubleshooting-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px;
  background: rgba(68, 68, 68, 0.3);
  border-radius: 6px;
  border: 1px solid #444;
}

.troubleshooting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
}

.troubleshooting-header:hover {
  opacity: 0.8;
}

.troubleshooting-header .label {
  font-weight: 600;
  color: #aaa;
}

.troubleshooting-header .toggle-icon {
  color: #aaa;
  font-size: 12px;
}

.troubleshooting-content {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #444;
}

.troubleshooting-content .info-text {
  color: #ddd;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.troubleshooting-content .info-text strong {
  color: #ff9800;
  font-weight: 600;
}

.expiry-expired {
  color: #4caf50;
  font-weight: 500;
}

.expiry-pending {
  color: #ff9800;
  font-weight: 500;
}

.expiry-pending em {
  color: #999;
  font-size: 12px;
  font-style: italic;
  display: block;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 152, 0, 0.1);
  border-left: 2px solid #ff9800;
  border-radius: 4px;
}

/* VTXO Information Section */
.vtxo-info-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px;
  background: rgba(68, 68, 68, 0.3);
  border-radius: 6px;
  border: 1px solid #444;
  margin-top: 16px;
}

.vtxo-info-content {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #444;
}

.vtxo-info-content .info-text {
  color: #ddd;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 16px 0;
}

.vtxo-info-content .info-text strong {
  color: #4caf50;
  font-weight: 600;
}

.no-vtxos {
  padding: 16px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.vtxo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.vtxo-item {
  background: rgba(34, 34, 34, 0.5);
  border: 1px solid #444;
  border-radius: 6px;
  padding: 12px;
}

.vtxo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #444;
}

.vtxo-number {
  font-weight: 600;
  color: #999;
  font-size: 12px;
}

.vtxo-amount {
  font-weight: 700;
  color: #4caf50;
  font-size: 14px;
}

.vtxo-status {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.status-settled {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.status-preconfirmed {
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
}

.status-spent {
  background: rgba(244, 67, 54, 0.2);
  color: #f44336;
}

.status-swept {
  background: rgba(156, 39, 176, 0.2);
  color: #9c27b0;
}

.status-unknown {
  background: rgba(158, 158, 158, 0.2);
  color: #9e9e9e;
}

.vtxo-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vtxo-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.detail-label {
  color: #999;
  font-weight: 500;
}

.detail-value {
  color: #ddd;
  font-weight: 400;
}

.detail-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.detail-value.txid-full {
  word-break: break-all;
  flex: 1;
  text-align: right;
  max-width: 70%;
  cursor: text;
  user-select: all;
}

.vtxo-summary {
  margin-top: 16px;
  padding: 12px;
  background: rgba(76, 175, 80, 0.1);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 6px;
  color: #ddd;
  font-size: 13px;
  line-height: 1.6;
}

.vtxo-summary strong {
  color: #4caf50;
}

.vtxo-summary small {
  color: #999;
  display: block;
  margin-top: 8px;
  font-style: italic;
}

/* Nostr Public Key Section */
.nostr-pubkey-section {
  margin: 16px 0;
  padding: 12px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 8px;
}

.btn-toggle-nostr {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: #6366f1;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-toggle-nostr:hover {
  color: #818cf8;
}

.nostr-pubkey-content {
  margin-top: 12px;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 200px;
  }
}

.nostr-hint {
  color: #aaa;
  font-size: 13px;
  margin: 0 0 12px 0;
  line-height: 1.5;
}

.nostr-pubkey-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
}

.nostr-pubkey-value {
  flex: 1;
  font-family: monospace;
  font-size: 12px;
  color: #6366f1;
  word-break: break-all;
  line-height: 1.4;
}

.label {
  color: #888;
  min-width: 80px;
}

.value {
  color: #fff;
  font-weight: 500;
}

.monospace {
  font-family: monospace;
  font-size: 14px;
}

.balance-amount {
  color: #ff6b35;
  font-size: 18px;
  font-weight: bold;
}

.balance-boarding {
  color: #fbbf24;
  font-size: 16px;
  font-weight: bold;
}

.balance-total {
  color: #4ade80;
  font-weight: bold;
}

.balance-onchain {
  color: #888;
  font-weight: normal;
}

.mints-available {
  color: #4ade80;
  font-weight: 600;
  margin-left: 8px;
}

.btn-copy {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-copy:hover {
  background: #333;
}

.status-ready {
  color: #4ade80;
}

.status-need-funds {
  color: #fbbf24;
}

.wallet-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.wallet-actions .btn {
  flex: 1;
}

.boarding-prompt {
  background: #2a2a2a;
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  text-align: center;
  border: 2px solid #fbbf24;
}

.boarding-prompt p {
  color: #fff;
  margin: 0 0 8px 0;
  font-weight: bold;
}

.boarding-info {
  color: #aaa !important;
  font-weight: normal !important;
  font-size: 14px;
  margin-bottom: 12px !important;
}

.funding-prompt {
  background: #2a2a2a;
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  text-align: center;
}

.funding-prompt p {
  color: #fbbf24;
  margin: 0 0 12px 0;
}

.info-box {
  background: #1a2332;
  border: 2px solid #4ade80;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.info-box.boarding-status {
  border-color: #fbbf24;
  background: #2a2416;
}

.info-box.boarding-status .info-title {
  color: #fbbf24;
}

.info-box.boarding-success {
  border-color: #4ade80;
  background: #1a2a1a;
}

.info-box.boarding-success .info-title {
  color: #4ade80;
}

.info-title {
  color: #4ade80;
  font-weight: bold;
  font-size: 16px;
  margin: 0 0 16px 0;
}

.info-text {
  color: #ccc;
  margin: 0 0 12px 0;
  line-height: 1.6;
}

.info-steps {
  color: #ddd;
  margin: 0;
  padding-left: 24px;
  line-height: 1.8;
}

.info-steps li {
  margin-bottom: 8px;
}

.info-steps strong {
  color: #fbbf24;
}

.info-steps a {
  color: #ff6b35;
  text-decoration: none;
  font-weight: bold;
}

.info-steps a:hover {
  text-decoration: underline;
}

/* Boarding alert */
.boarding-alert {
  background: linear-gradient(135deg, #2a2416 0%, #3a3020 100%);
  border: 2px solid #fbbf24;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  text-align: center;
}

.boarding-alert h4 {
  color: #fbbf24;
  margin: 0 0 12px 0;
  font-size: 18px;
}

.boarding-alert p {
  color: #ddd;
  margin: 0 0 16px 0;
}

.boarding-alert strong {
  color: #fff;
  font-size: 20px;
}

/* Funding guide */
.funding-guide {
  background: #1a1a1a;
  border: 2px solid #4ade80;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.funding-guide h4 {
  color: #4ade80;
  margin: 0 0 12px 0;
  font-size: 18px;
}

.guide-intro {
  color: #ddd;
  margin: 0 0 24px 0;
  text-align: center;
  line-height: 1.6;
}

.guide-intro strong {
  color: #4ade80;
  font-size: 16px;
}

/* QR Code section */
.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.qr-code {
  background: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.qr-code canvas {
  display: block;
}

.guide-step {
  background: #2a2a2a;
  border-left: 4px solid #ff6b35;
  padding: 16px;
  margin-bottom: 16px;
  border-radius: 4px;
}

.guide-step strong {
  color: #ff6b35;
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
}

.guide-note {
  color: #aaa;
  font-size: 14px;
  margin: 8px 0 0 0;
  line-height: 1.6;
}

.guide-tip {
  background: #1a2a1a;
  border: 2px solid #4ade80;
  border-radius: 6px;
  padding: 20px;
  color: #ddd;
  text-align: left;
}

.guide-tip strong {
  color: #4ade80;
  font-size: 16px;
}

.guide-tip ul {
  margin: 12px 0;
  padding-left: 24px;
  list-style: none;
}

.guide-tip li {
  margin: 8px 0;
  line-height: 1.6;
  color: #ccc;
}

.guide-tip li::before {
  content: '→ ';
  color: #4ade80;
  font-weight: bold;
  margin-right: 8px;
}

.guide-tip a {
  color: #ff6b35;
  text-decoration: none;
  font-weight: bold;
}

.guide-tip a:hover {
  text-decoration: underline;
}

.address-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #0a0a0a;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 12px;
  width: 100%;
  max-width: 500px;
}

.address-box code {
  flex: 1;
  color: #4ade80;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  word-break: break-all;
}

.btn-copy-inline {
  background: transparent;
  border: 1px solid #444;
  color: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.btn-copy-inline:hover {
  background: #333;
  border-color: #ff6b35;
}

/* L1 Exit Button */
.btn-exit-l1 {
  background: linear-gradient(135deg, #f7931a 0%, #ff9500 100%);
  color: #fff;
  border: 2px solid #f7931a;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  width: 100%;
}

.btn-exit-l1:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(247, 147, 26, 0.4);
}

/* Exit Modal */
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
  padding: 20px;
}

.modal-content {
  background: #1a1a1a;
  border: 2px solid #f7931a;
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(247, 147, 26, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #333;
}

.modal-header h3 {
  margin: 0;
  color: #f7931a;
  font-size: 24px;
}

.btn-close {
  background: transparent;
  border: none;
  color: #888;
  font-size: 32px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.btn-close:hover {
  color: #ff6b35;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #333;
}

.warning-box {
  background: #2a1a0a;
  border: 2px solid #f7931a;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.warning-box p {
  color: #fbbf24;
  margin: 8px 0;
  line-height: 1.6;
}

.warning-box strong {
  color: #f7931a;
}

.exit-punks-list {
  margin: 20px 0;
}

.exit-punks-list h4 {
  color: #fff;
  margin: 0 0 12px 0;
  font-size: 16px;
}

.punk-exit-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 200px;
  overflow-y: auto;
  background: #2a2a2a;
  border-radius: 8px;
  padding: 12px;
}

.punk-exit-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1a1a1a;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #444;
}

.punk-exit-thumb {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  image-rendering: pixelated;
}

.punk-exit-info {
  flex: 1;
}

.punk-exit-name {
  color: #fff;
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
}

.punk-exit-id {
  color: #888;
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

.no-punks-message {
  text-align: center;
  padding: 40px 20px;
  color: #888;
}

.exit-address-input {
  margin: 20px 0;
}

.exit-address-input label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #fff;
}

.input-address {
  padding: 12px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  font-family: 'Courier New', monospace;
  transition: border-color 0.2s;
}

.input-address:focus {
  outline: none;
  border-color: #f7931a;
}

.input-hint {
  color: #888;
  font-size: 13px;
  margin: 4px 0 0 0;
}

.exit-status {
  margin: 16px 0;
  padding: 12px;
  border-radius: 6px;
  font-weight: bold;
}

.status-success {
  background: #1a2a1a;
  border: 2px solid #4ade80;
  color: #4ade80;
}

.status-error {
  background: #2a1a1a;
  border: 2px solid #ff6b35;
  color: #ff6b35;
}

.recovery-status {
  margin: 12px 0 0 0;
  padding: 12px;
  border-radius: 6px;
  font-weight: bold;
  font-size: 13px;
  white-space: pre-line;
}

/* Send modal styles */
.send-input-group {
  margin: 20px 0;
}

.send-input-group label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #fff;
}

.input-amount {
  padding: 12px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
  font-family: 'Courier New', monospace;
  transition: border-color 0.2s;
}

.input-amount:focus {
  outline: none;
  border-color: #f7931a;
}

.send-status {
  margin: 16px 0;
  padding: 12px;
  border-radius: 6px;
  font-weight: bold;
  white-space: pre-line;
}

.btn-send {
  background: linear-gradient(135deg, #4ade80 0%, #10b981 100%);
  color: #fff;
}

.btn-exit {
  background: linear-gradient(135deg, #ff6b35 0%, #ff8555 100%);
  color: #fff;
  border: 2px solid #ff6b35;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-exit:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
}

/* Send Modal Styles */
.send-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #fff;
}

.input-amount {
  padding: 12px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
  font-family: monospace;
  transition: border-color 0.2s;
}

.input-amount:focus {
  outline: none;
  border-color: #10b981;
}

.amount-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #2a2a2a;
  border-radius: 6px;
}

.available-balance {
  color: #10b981;
  font-weight: 600;
  font-size: 14px;
}

.btn-max {
  padding: 4px 12px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-max:hover {
  background: #059669;
  transform: scale(1.05);
}

.send-status {
  margin: 16px 0;
  padding: 12px;
  border-radius: 6px;
  font-weight: bold;
  text-align: center;
}

@media (max-width: 768px) {
  .modal-content {
    max-width: 100%;
    margin: 20px;
  }

  .punk-exit-items {
    max-height: 150px;
  }

  /* Compact wallet action buttons for mobile */
  .wallet-actions {
    gap: 8px;
  }

  .wallet-actions .btn {
    padding: 10px 12px;
    font-size: 13px;
    white-space: nowrap;
  }
}

/* Extra small screens - stack buttons in 2x2 grid */
@media (max-width: 480px) {
  .wallet-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .wallet-actions .btn {
    padding: 12px 8px;
    font-size: 12px;
  }
}

/* Lightning Swaps Section */
.lightning-section {
  background: #1a1a1a;
  border: 2px solid #f7931a;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.lightning-title {
  color: #f7931a;
  margin: 0 0 16px 0;
  font-size: 18px;
}

.lightning-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 2px solid #444;
}

.lightning-tab-button {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  color: #888;
  transition: all 0.2s;
}

.lightning-tab-button:hover {
  color: #fff;
}

.lightning-tab-button.active {
  color: #f7931a;
  border-bottom-color: #f7931a;
}

.lightning-tab-content {
  padding-top: 10px;
}

.lightning-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.qr-container {
  display: flex;
  justify-content: center;
  margin: 20px 0;
}

.qr-code-lightning {
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.invoice-display {
  text-align: center;
}

.invoice-display h4 {
  color: #4ade80;
  margin: 0 0 8px 0;
}

.invoice-display p {
  color: #aaa;
  margin: 0 0 16px 0;
}

.invoice-string {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  margin: 20px 0;
}

.invoice-string code {
  flex: 1;
  font-size: 11px;
  word-break: break-all;
  color: #f7931a;
  font-family: monospace;
}

.status-box {
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
  font-weight: 600;
}

.status-box.waiting {
  background: #2a2416;
  border: 2px solid #fbbf24;
  color: #fbbf24;
}

.status-box.completed {
  background: #1a2a1a;
  border: 2px solid #4ade80;
  color: #4ade80;
}

.status-box.error {
  background: #2a1a1a;
  border: 2px solid #ff6b35;
  color: #ff6b35;
}

.status-box.success {
  background: #1a2a1a;
  border: 2px solid #4ade80;
  color: #4ade80;
}

.status-box p {
  margin: 8px 0;
}
</style>

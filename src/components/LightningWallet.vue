<template>
  <div class="lightning-wallet">
    <h2>⚡ Lightning Swaps</h2>
    <p class="subtitle">Send and receive sats via Lightning Network</p>

    <!-- Tabs -->
    <div class="tabs">
      <button
        :class="{ active: activeTab === 'receive' }"
        @click="activeTab = 'receive'"
      >
        📥 Receive
      </button>
      <button
        :class="{ active: activeTab === 'send' }"
        @click="activeTab = 'send'"
      >
        📤 Send
      </button>
    </div>

    <!-- Receive Tab -->
    <div v-if="activeTab === 'receive'" class="tab-content">
      <div v-if="!receiveInvoice" class="receive-form">
        <h3>Receive via Lightning</h3>
        <p>Generate an invoice to receive sats into your Arkade wallet</p>

        <div class="form-group">
          <label>Amount (sats)</label>
          <input
            v-model.number="receiveAmount"
            type="number"
            placeholder="e.g. 10000"
            min="1000"
            :disabled="isGenerating"
          />
          <small class="fee-estimate">
            Est. fee: ~{{ estimateFee(receiveAmount, 'receive') }} sats
          </small>
        </div>

        <button
          class="btn-primary"
          @click="generateInvoice"
          :disabled="isGenerating || !receiveAmount || receiveAmount < 1000"
        >
          {{ isGenerating ? 'Generating...' : 'Generate Invoice' }}
        </button>
      </div>

      <div v-else class="invoice-display">
        <h3>✅ Invoice Generated</h3>
        <p>Scan this QR code or copy the invoice to receive {{ receiveInvoice.amount }} sats</p>

        <div class="qr-container">
          <canvas ref="qrCanvas" class="qr-code"></canvas>
        </div>

        <div class="invoice-string">
          <code>{{ receiveInvoice.bolt11 }}</code>
          <button class="btn-copy" @click="copyInvoice">
            {{ copied ? '✓ Copied' : '📋 Copy' }}
          </button>
        </div>

        <div class="status-box" :class="paymentStatus">
          <p v-if="paymentStatus === 'waiting'">
            ⏳ Waiting for payment...
          </p>
          <p v-else-if="paymentStatus === 'paid'">
            ✅ Payment received! Claiming to your wallet...
          </p>
          <p v-else-if="paymentStatus === 'completed'">
            🎉 Completed! Funds added to your Arkade wallet
          </p>
          <p v-else-if="paymentStatus === 'error'">
            ❌ {{ errorMessage }}
          </p>
        </div>

        <button class="btn-secondary" @click="resetReceive">
          Generate New Invoice
        </button>
      </div>
    </div>

    <!-- Send Tab -->
    <div v-if="activeTab === 'send'" class="tab-content">
      <div class="send-form">
        <h3>Send via Lightning</h3>
        <p>Pay a Lightning invoice from your Arkade wallet</p>

        <div class="form-group">
          <label>Lightning Invoice</label>
          <textarea
            v-model="sendInvoice"
            placeholder="lnbc..."
            rows="4"
            :disabled="isSending || !!sendResult"
          ></textarea>
        </div>

        <button
          v-if="!sendResult"
          class="btn-primary"
          @click="payInvoice"
          :disabled="!sendInvoice || isSending"
        >
          {{ isSending ? 'Paying...' : 'Pay Invoice' }}
        </button>

        <div v-if="sendResult" class="result-box success">
          <p>✅ Payment sent successfully!</p>
          <p><strong>Amount:</strong> {{ sendResult.amount }} sats</p>
          <p><small>Preimage: {{ sendResult.preimage.slice(0, 16) }}...</small></p>
        </div>

        <div v-if="sendError" class="result-box error">
          <p>❌ {{ sendError }}</p>
        </div>

        <button
          v-if="sendResult || sendError"
          class="btn-secondary"
          @click="resetSend"
        >
          Pay Another Invoice
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, inject, nextTick } from 'vue'
import QRCode from 'qrcode'
import {
  createReceiveInvoice,
  waitAndClaimPayment,
  payLightningInvoice,
  estimateSwapFee
} from '@/utils/lightningSwaps'
import type { ArkadeWalletInterface } from '@/utils/arkadeWallet'

// Get wallet from parent via injection
const getWallet = inject<() => ArkadeWalletInterface | null>('getWallet')

// Tabs
const activeTab = ref<'receive' | 'send'>('receive')

// Receive state
const receiveAmount = ref<number>(10000)
const receiveInvoice = ref<any>(null)
const isGenerating = ref(false)
const paymentStatus = ref<'waiting' | 'paid' | 'completed' | 'error'>('waiting')
const errorMessage = ref('')
const qrCanvas = ref<HTMLCanvasElement | null>(null)
const copied = ref(false)

// Send state
const sendInvoice = ref('')
const isSending = ref(false)
const sendResult = ref<any>(null)
const sendError = ref('')

/**
 * Generate Lightning invoice for receiving
 */
async function generateInvoice() {
  isGenerating.value = true
  errorMessage.value = ''

  try {
    const wallet = getWallet?.()

    if (!wallet) {
      throw new Error('No wallet connected')
    }

    console.log('📝 Creating Lightning invoice for', receiveAmount.value, 'sats')

    const invoice = await createReceiveInvoice(wallet, receiveAmount.value)
    receiveInvoice.value = invoice

    console.log('✅ Invoice created:', invoice.bolt11)

    // Wait for Vue to update DOM with the canvas element
    await nextTick()

    // Generate QR code
    await generateQRCode(invoice.bolt11)

    // Start monitoring for payment
    paymentStatus.value = 'waiting'
    monitorPayment(wallet, invoice.pendingSwap)

  } catch (error: any) {
    console.error('Failed to generate invoice:', error)
    errorMessage.value = error.message
    paymentStatus.value = 'error'
  } finally {
    isGenerating.value = false
  }
}

/**
 * Generate QR code for invoice
 */
async function generateQRCode(text: string) {
  if (!qrCanvas.value) return

  try {
    await QRCode.toCanvas(qrCanvas.value, text.toUpperCase(), {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
  } catch (error) {
    console.error('Failed to generate QR code:', error)
  }
}

/**
 * Monitor payment and claim when received
 */
async function monitorPayment(wallet: any, pendingSwap: any) {
  try {
    console.log('⏳ Monitoring swap:', pendingSwap)

    paymentStatus.value = 'waiting'

    const txid = await waitAndClaimPayment(wallet, pendingSwap)

    console.log('✅ Payment claimed:', txid)
    paymentStatus.value = 'completed'

    // Wallet balance will refresh automatically via WalletConnect polling

  } catch (error: any) {
    console.error('Payment monitoring failed:', error)
    errorMessage.value = error.message
    paymentStatus.value = 'error'
  }
}

/**
 * Copy invoice to clipboard
 */
function copyInvoice() {
  if (!receiveInvoice.value) return

  navigator.clipboard.writeText(receiveInvoice.value.bolt11)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

/**
 * Reset receive state
 */
function resetReceive() {
  receiveInvoice.value = null
  paymentStatus.value = 'waiting'
  errorMessage.value = ''
  receiveAmount.value = 10000
}

/**
 * Pay Lightning invoice
 */
async function payInvoice() {
  isSending.value = true
  sendError.value = ''
  sendResult.value = null

  try {
    const wallet = getWallet?.()

    if (!wallet) {
      throw new Error('No wallet connected')
    }

    console.log('💸 Paying Lightning invoice...')

    const result = await payLightningInvoice(wallet, sendInvoice.value.trim())
    sendResult.value = result

    console.log('✅ Payment sent:', result)

    // Wallet balance will refresh automatically via WalletConnect polling

  } catch (error: any) {
    console.error('Failed to pay invoice:', error)
    sendError.value = error.message
  } finally {
    isSending.value = false
  }
}

/**
 * Reset send state
 */
function resetSend() {
  sendInvoice.value = ''
  sendResult.value = null
  sendError.value = ''
}

/**
 * Estimate swap fee
 */
function estimateFee(amount: number | undefined, direction: 'receive' | 'send'): number {
  if (!amount) return 0
  return estimateSwapFee(amount, direction)
}
</script>

<style scoped>
.lightning-wallet {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.tabs button {
  flex: 1;
  padding: 12px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.tabs button:hover {
  color: var(--text-primary);
}

.tabs button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Tab content */
.tab-content {
  padding: 20px 0;
}

h3 {
  font-size: 20px;
  margin-bottom: 8px;
}

/* Form */
.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

input, textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  font-family: inherit;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

input:focus, textarea:focus {
  outline: none;
  border-color: var(--primary);
}

textarea {
  resize: vertical;
  font-family: monospace;
  font-size: 14px;
}

.fee-estimate, .fee-warning {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  color: var(--text-secondary);
}

.fee-warning {
  color: var(--warning);
  font-weight: 600;
}

/* Buttons */
.btn-primary, .btn-secondary, .btn-copy {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  margin-top: 8px;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-dark);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 2px solid var(--border);
}

.btn-secondary:hover {
  border-color: var(--primary);
}

.btn-copy {
  width: auto;
  padding: 8px 16px;
  font-size: 14px;
  margin-top: 0;
  margin-left: 8px;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
}

/* Invoice display */
.invoice-display {
  text-align: center;
}

.qr-container {
  margin: 24px 0;
  padding: 20px;
  background: white;
  border-radius: 12px;
  display: inline-block;
}

.qr-code {
  display: block;
}

.invoice-string {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
}

.invoice-string code {
  flex: 1;
  font-size: 12px;
  word-break: break-all;
  color: var(--text-primary);
}

/* Status box */
.status-box {
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
  font-weight: 600;
}

.status-box.waiting {
  background: #fef3c7;
  color: #92400e;
}

.status-box.completed {
  background: #d1fae5;
  color: #065f46;
}

.status-box.error {
  background: #fee2e2;
  color: #991b1b;
}

/* Invoice details */
.invoice-details {
  padding: 16px;
  background: var(--bg-secondary);
  border: 2px solid var(--border);
  border-radius: 8px;
  margin: 20px 0;
  text-align: left;
}

.invoice-details h4 {
  margin-bottom: 12px;
  font-size: 16px;
}

.invoice-details p {
  margin: 8px 0;
  font-size: 14px;
}

/* Result boxes */
.result-box {
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
}

.result-box.success {
  background: #d1fae5;
  color: #065f46;
}

.result-box.error {
  background: #fee2e2;
  color: #991b1b;
}

.result-box p {
  margin: 4px 0;
}

.result-box small {
  font-size: 12px;
  opacity: 0.8;
}

/* Responsive */
@media (max-width: 768px) {
  .lightning-wallet {
    padding: 12px;
  }

  .qr-container {
    padding: 12px;
  }

  .invoice-string {
    flex-direction: column;
  }

  .btn-copy {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }
}
</style>

<template>
  <div class="mint-punk">
    <h2>Mint a New Punk</h2>

    <!-- Supply Counter -->
    <div class="supply-counter">
      <div class="counter-bar">
        <div class="counter-fill" :style="{ width: supplyPercentage + '%' }"></div>
      </div>
      <div class="counter-text">
        <span class="minted">{{ totalMinted }}</span> / <span class="total">{{ maxPunks }}</span> Punks Minted
        <span v-if="remaining > 0" class="remaining">({{ remaining }} remaining)</span>
        <span v-else class="sold-out">SOLD OUT!</span>
      </div>
    </div>

    <div class="mint-form">
      <!-- Blind Mint Info -->
      <div v-if="!mintedPunk && !minting" class="blind-mint-info">
        <div class="mystery-box">
          <div class="mystery-icon">📦</div>
          <h3>Blind Mint</h3>
          <p class="description">
            Your punk will be <strong>randomly generated</strong> using your transaction ID as seed.<br>
            You won't know what you get until after payment!
          </p>

          <div class="rarity-odds">
            <h4>Rarity Distribution:</h4>
            <div class="odds-list">
              <div class="odds-item alien">
                <span class="type-badge">Alien</span>
                <span class="odds">1%</span>
              </div>
              <div class="odds-item ape">
                <span class="type-badge">Ape</span>
                <span class="odds">2%</span>
              </div>
              <div class="odds-item zombie">
                <span class="type-badge">Zombie</span>
                <span class="odds">3%</span>
              </div>
              <div class="odds-item male">
                <span class="type-badge">Male</span>
                <span class="odds">47%</span>
              </div>
              <div class="odds-item female">
                <span class="type-badge">Female</span>
                <span class="odds">47%</span>
              </div>
            </div>
          </div>

          <div class="mint-options">
            <label>
              Punk Value (sats):
              <input v-model.number="punkValue" type="number" min="1000" step="1000" />
            </label>

            <button
              @click="mint"
              :disabled="minting || !canMint"
              class="btn btn-primary btn-mint"
            >
              {{ !canMint ? 'All Punks Minted!' : '🎲 Mint Random Punk' }}
            </button>
          </div>

          <div v-if="!canMint" class="sold-out-message">
            <p>🎉 All {{ maxPunks }} ArkPunks have been minted!</p>
            <p>Check the marketplace to buy existing punks.</p>
          </div>
        </div>
      </div>

      <!-- Minting Animation -->
      <div v-if="minting" class="minting-animation">
        <div class="spinner-large"></div>
        <h3>Minting Your Punk...</h3>
        <p>Generating random punk from transaction...</p>
      </div>

      <!-- Reveal Animation -->
      <div v-if="mintedPunk && revealedMetadata" class="punk-reveal">
        <h3 class="reveal-title">🎉 Your Punk Has Been Minted!</h3>

        <div class="reveal-card">
          <div class="reveal-image" :class="{ 'revealed': showReveal }">
            <img :src="revealedMetadata.imageUrl" :alt="revealedMetadata.name" />
          </div>

          <div class="reveal-info">
            <h4>{{ revealedMetadata.name }}</h4>

            <div class="reveal-type">
              <span class="badge" :class="`type-${revealedMetadata.traits.type.toLowerCase()}`">
                {{ revealedMetadata.traits.type }}
              </span>
              <span v-if="isRarePunk" class="rare-badge">⭐ RARE!</span>
            </div>

            <div class="reveal-attributes">
              <span
                v-for="attr in revealedMetadata.traits.attributes"
                :key="attr"
                class="attribute-badge"
              >
                {{ attr }}
              </span>
            </div>

            <p class="reveal-description">{{ revealedMetadata.description }}</p>

            <div class="rarity-score">
              Rarity Score: {{ rarityScore }}
            </div>

            <div class="mint-details">
              <p><strong>Punk ID:</strong> {{ mintedPunk.punkId.slice(0, 16) }}...</p>
              <p><strong>VTXO:</strong> {{ mintedPunk.vtxoOutpoint }}</p>
            </div>

            <button @click="resetMint" class="btn btn-secondary">
              Mint Another Punk
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { generatePunkFromTxid, calculateRarityScore } from '@/utils/generator'
import { compressPunkMetadata } from '@/utils/compression'
import { PunkMetadata, MintEvent } from '@/types/punk'
import type { ArkadeWalletInterface } from '@/utils/arkadeWallet'
import {
  canMintMorePunks,
  getTotalMintedPunks,
  getMaxPunks,
  getRemainingPunks,
  registerPunkMint,
  refreshSupplyFromNostr
} from '@/utils/punkRegistry'
import { publishPunkMint } from '@/utils/nostrRegistry'
import { loadIdentity } from '@/utils/arkadeWallet'

// Inject wallet from parent (App.vue)
const wallet = inject<() => ArkadeWalletInterface | null>('getWallet')

const punkValue = ref(10000) // Default 10000 sats (mainnet minimum)
const minting = ref(false)
const mintedPunk = ref<MintEvent | null>(null)
const revealedMetadata = ref<PunkMetadata | null>(null)
const showReveal = ref(false)

// Supply tracking
const totalMinted = ref(0)
const maxPunks = ref(0)
const canMint = ref(true)

const rarityScore = computed(() => {
  return revealedMetadata.value ? calculateRarityScore(revealedMetadata.value) : 0
})

const isRarePunk = computed(() => {
  if (!revealedMetadata.value) return false
  const type = revealedMetadata.value.traits.type
  return type === 'Alien' || type === 'Ape' || type === 'Zombie'
})

const remaining = computed(() => maxPunks.value - totalMinted.value)
const supplyPercentage = computed(() => {
  return maxPunks.value > 0 ? (totalMinted.value / maxPunks.value) * 100 : 0
})

function resetMint() {
  mintedPunk.value = null
  revealedMetadata.value = null
  showReveal.value = false
  window.location.reload()
}

async function updateSupplyCounter() {
  // Fetch latest supply from Nostr
  try {
    const supply = await refreshSupplyFromNostr()
    totalMinted.value = supply
    maxPunks.value = getMaxPunks()
    canMint.value = supply < getMaxPunks()
    console.log(`📊 Supply updated from Nostr: ${supply} / ${getMaxPunks()}`)
  } catch (error) {
    console.error('Failed to update supply from Nostr:', error)
    // Fallback to localStorage
    totalMinted.value = getTotalMintedPunks()
    maxPunks.value = getMaxPunks()
    canMint.value = canMintMorePunks()
  }
}

onMounted(() => {
  updateSupplyCounter()
})

async function mint() {
  const currentWallet = wallet?.()
  if (!currentWallet) {
    alert('Please connect your wallet first!')
    return
  }

  // Check supply limit
  if (!canMintMorePunks()) {
    alert(`❌ All ${getMaxPunks()} ArkPunks have been minted!\n\nCheck the marketplace to buy existing punks.`)
    updateSupplyCounter()
    return
  }

  // Confirm blind mint
  const confirmed = confirm(
    `🎲 Blind Mint Confirmation\n\n` +
    `You will mint a RANDOM punk for ${punkValue.value.toLocaleString()} sats.\n` +
    `Your punk will be generated using the transaction ID as seed.\n\n` +
    `You won't know what you get until after payment!\n\n` +
    `Rarity distribution:\n` +
    `- Alien: 1% chance\n` +
    `- Ape: 2% chance\n` +
    `- Zombie: 3% chance\n` +
    `- Male/Female: 94% chance\n\n` +
    `Continue?`
  )

  if (!confirmed) return

  minting.value = true

  try {
    console.log('🎨 Minting blind punk on Arkade mainnet...')
    console.log('   Value:', punkValue.value, 'sats')
    console.log('   Supply:', getTotalMintedPunks() + 1, '/', getMaxPunks())

    // 1. Send transaction FIRST (blind mint - no preview!)
    const recipientAddress = currentWallet.arkadeAddress || currentWallet.address
    console.log('   Sending', punkValue.value, 'sats to', recipientAddress)

    const txid = await currentWallet.send(
      recipientAddress,
      BigInt(punkValue.value),
      undefined
    )

    console.log('✅ Transaction sent! TXID:', txid)
    console.log('🎲 Generating punk from TXID...')

    // 2. NOW generate punk deterministically from TXID (provably fair!)
    const generatedMetadata = generatePunkFromTxid(txid)
    console.log('   Generated punk:', generatedMetadata.name)
    console.log('   Type:', generatedMetadata.traits.type)

    // 3. Compress punk metadata to 6 bytes
    const compressed = compressPunkMetadata(generatedMetadata)
    const compressedHex = Array.from(compressed.data)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // 4. Save punk to localStorage
    const mintEvent: MintEvent = {
      type: 'mint',
      punkId: generatedMetadata.punkId,
      owner: currentWallet.address,
      metadata: {
        ...generatedMetadata,
        mintDate: new Date().toISOString()
      },
      vtxoOutpoint: `${txid}:0`,
      compressedData: compressedHex,
      timestamp: Date.now()
    }

    const punksJson = localStorage.getItem('arkade_punks')
    const punks = punksJson ? JSON.parse(punksJson) : []
    punks.push({
      ...mintEvent.metadata,
      owner: currentWallet.address,
      vtxoOutpoint: `${txid}:0`
    })
    localStorage.setItem('arkade_punks', JSON.stringify(punks))

    // 5. Publish to Nostr relays
    console.log('📡 Publishing punk mint to Nostr...')
    const identity = loadIdentity()
    if (identity) {
      const published = await publishPunkMint(
        generatedMetadata.punkId,
        currentWallet.address,
        `${txid}:0`,
        compressedHex,
        identity.privateKey
      )

      if (published) {
        console.log('✅ Punk published to Nostr!')
      } else {
        console.warn('⚠️ Failed to publish to Nostr (supply cap may be reached)')
      }
    }

    // Register punk in local supply registry
    const registered = registerPunkMint(generatedMetadata.punkId, currentWallet.address)
    if (registered) {
      console.log('✅ Punk registered in local supply:', getTotalMintedPunks(), '/', getMaxPunks())
    }

    // Refresh supply counter
    await updateSupplyCounter()

    // 6. Set minted punk and revealed metadata for animation
    mintedPunk.value = mintEvent
    revealedMetadata.value = generatedMetadata

    // Trigger reveal animation after a short delay
    setTimeout(() => {
      showReveal.value = true
    }, 500)

  } catch (error: any) {
    console.error('❌ Failed to mint punk:', error)
    alert(`Failed to mint punk: ${error?.message || error}`)
  } finally {
    minting.value = false
  }
}
</script>

<style scoped>
.mint-punk {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

h2 {
  color: #fff;
  margin-bottom: 24px;
}

.mint-form {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 24px;
}

/* Blind Mint Info */
.blind-mint-info {
  text-align: center;
}

.mystery-box {
  padding: 32px;
  background: linear-gradient(135deg, #2a2a3a 0%, #1a1a2a 100%);
  border: 3px solid #444;
  border-radius: 12px;
}

.mystery-icon {
  font-size: 80px;
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.mystery-box h3 {
  color: #fff;
  font-size: 32px;
  margin: 0 0 16px 0;
}

.description {
  color: #aaa;
  font-size: 16px;
  line-height: 1.6;
  margin-bottom: 32px;
}

.description strong {
  color: #ff6b35;
}

.rarity-odds {
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 32px;
}

.rarity-odds h4 {
  color: #fff;
  margin: 0 0 16px 0;
  font-size: 18px;
}

.odds-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.odds-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #1a1a1a;
  border-radius: 6px;
}

.type-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
}

.odds-item.alien .type-badge { background: #88ff88; color: #000; }
.odds-item.ape .type-badge { background: #8b4513; color: #fff; }
.odds-item.zombie .type-badge { background: #88cc88; color: #000; }
.odds-item.male .type-badge { background: #4a9eff; color: #fff; }
.odds-item.female .type-badge { background: #ff69b4; color: #fff; }

.odds {
  color: #ff6b35;
  font-weight: bold;
  font-size: 16px;
}

/* Buttons */
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
  background: linear-gradient(135deg, #ff6b35 0%, #ff8555 100%);
  color: #fff;
  font-size: 18px;
  padding: 16px 32px;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
}

.btn-secondary {
  background: #333;
  color: #fff;
}

.btn-secondary:hover {
  background: #444;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mint-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: stretch;
}

.mint-options label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #aaa;
  text-align: left;
}

.mint-options input {
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
}

/* Minting Animation */
.minting-animation {
  text-align: center;
  padding: 80px 40px;
}

.spinner-large {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  border: 6px solid #333;
  border-top-color: #ff6b35;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.minting-animation h3 {
  color: #fff;
  font-size: 24px;
  margin: 0 0 12px 0;
}

.minting-animation p {
  color: #aaa;
  font-size: 16px;
}

/* Punk Reveal */
.punk-reveal {
  animation: fadeIn 0.5s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.reveal-title {
  color: #fff;
  font-size: 28px;
  text-align: center;
  margin: 0 0 24px 0;
  animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 10px rgba(255, 107, 53, 0.5); }
  50% { text-shadow: 0 0 20px rgba(255, 107, 53, 0.8); }
}

.reveal-card {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 32px;
  background: linear-gradient(135deg, #2a2a3a 0%, #1a1a2a 100%);
  border: 3px solid #ff6b35;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(255, 107, 53, 0.3);
}

.reveal-image {
  width: 300px;
  height: 300px;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.reveal-image.revealed {
  opacity: 1;
  transform: scale(1);
}

.reveal-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}

.reveal-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reveal-info h4 {
  margin: 0;
  color: #fff;
  font-size: 24px;
}

.reveal-type {
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  text-transform: uppercase;
}

.type-alien { background: #88ff88; color: #000; }
.type-ape { background: #8b4513; color: #fff; }
.type-zombie { background: #88cc88; color: #000; }
.type-male { background: #4a9eff; color: #fff; }
.type-female { background: #ff69b4; color: #fff; }

.rare-badge {
  padding: 6px 12px;
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  color: #000;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  animation: sparkle 1.5s infinite;
}

@keyframes sparkle {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.reveal-attributes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attribute-badge {
  font-size: 12px;
  padding: 6px 10px;
  background: #333;
  color: #aaa;
  border-radius: 4px;
}

.reveal-description {
  color: #aaa;
  line-height: 1.6;
}

.rarity-score {
  color: #ff6b35;
  font-weight: bold;
  font-size: 20px;
}

.mint-details {
  padding: 16px;
  background: #2a2a2a;
  border-radius: 8px;
  border: 1px solid #444;
}

.mint-details p {
  margin: 8px 0;
  color: #aaa;
  font-size: 14px;
  word-break: break-all;
  overflow-wrap: break-word;
}

.mint-details strong {
  color: #fff;
}

/* Supply Counter */
.supply-counter {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
}

.counter-bar {
  width: 100%;
  height: 12px;
  background: #2a2a2a;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}

.counter-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b35 0%, #ff8555 50%, #ffa575 100%);
  transition: width 0.5s ease;
}

.counter-text {
  text-align: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.counter-text .minted {
  color: #ff6b35;
  font-size: 24px;
}

.counter-text .total {
  color: #aaa;
}

.counter-text .remaining {
  color: #4ade80;
  font-size: 14px;
  margin-left: 8px;
}

.counter-text .sold-out {
  color: #fbbf24;
  font-size: 16px;
  font-weight: bold;
  margin-left: 8px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.sold-out-message {
  background: rgba(251, 191, 36, 0.1);
  border: 2px solid #fbbf24;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  text-align: center;
}

.sold-out-message p {
  color: #fbbf24;
  font-weight: 600;
  margin: 8px 0;
  font-size: 16px;
}

.sold-out-message p:first-child {
  font-size: 20px;
  color: #fff;
}
</style>

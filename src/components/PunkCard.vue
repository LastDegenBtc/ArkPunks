<template>
  <div class="punk-card" @click="$emit('click', punk)">
    <div class="punk-image">
      <img :src="punk.metadata.imageUrl" :alt="punk.metadata.name" />
      <div v-if="isOfficial" class="official-badge" title="Official ArkPunk - Verified on relay.damus.io">
        ✓
      </div>
      <div v-if="inEscrow" class="escrow-badge" title="This punk is currently held in escrow">
        🛡️
      </div>
    </div>

    <div class="punk-info">
      <h3>{{ punk.metadata.name }}</h3>

      <div class="punk-type">
        <span class="badge" :class="`type-${punk.metadata.traits.type.toLowerCase()}`">
          {{ punk.metadata.traits.type }}
        </span>
        <span v-if="isOfficial && officialIndex !== undefined" class="official-index" title="Mint order on official relay">
          #{{ officialIndex }}
        </span>
      </div>

      <div class="punk-attributes">
        <span
          v-for="attr in punk.metadata.traits.attributes"
          :key="attr"
          class="attribute-badge"
        >
          {{ attr }}
        </span>
      </div>

      <div class="punk-owner">
        <small>Owner: {{ formatPubkey(punk.owner) }}</small>
      </div>

      <div v-if="punk.listingPrice > 0n" class="punk-price">
        <span class="price-label">Listed for:</span>
        <span class="price-value">{{ formatSats(punk.listingPrice) }} sats</span>
      </div>

      <div v-else class="punk-status">
        <span class="not-for-sale">Not for sale</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PunkState } from '@/types/punk'

interface Props {
  punk: PunkState
  isOfficial?: boolean
  officialIndex?: number
  inEscrow?: boolean
}

defineProps<Props>()
defineEmits<{
  click: [punk: PunkState]
}>()

function formatPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`
}

function formatSats(sats: bigint): string {
  return sats.toLocaleString()
}
</script>

<style scoped>
.punk-card {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.punk-card:hover {
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
  padding: 4px 6px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: help;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.escrow-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  padding: 4px 6px;
  border-radius: 50%;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: help;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  cursor: help;
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

.punk-owner {
  margin-bottom: 8px;
  color: #888;
}

.punk-price {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: #2a2a2a;
  border-radius: 4px;
}

.price-label {
  color: #aaa;
  font-size: 12px;
}

.price-value {
  color: #ff6b35;
  font-weight: bold;
  font-size: 14px;
}

.punk-status {
  text-align: center;
  padding: 8px;
}

.not-for-sale {
  color: #666;
  font-size: 12px;
  font-style: italic;
}
</style>

import { PunkMetadata } from '@/types/punk'
import { sha256 } from '@scure/btc-signer/utils'
import { hex } from '@scure/base'

// Punk traits database
const PUNK_TYPES = ['Male', 'Female', 'Zombie', 'Ape', 'Alien']

const MALE_ATTRIBUTES = [
  'Mohawk', 'Bandana', 'Beanie', 'Cap', 'Hoodie',
  'Glasses', 'Sunglasses', 'VR Headset', 'Eye Patch',
  'Cigarette', 'Pipe', 'Vape',
  'Moustache', 'Beard', 'Goatee',
  'Earring', 'Gold Chain', 'Choker'
]

const FEMALE_ATTRIBUTES = [
  'Wild Hair', 'Straight Hair', 'Messy Hair', 'Knitted Cap', 'Headband',
  'Glasses', 'Sunglasses', 'Clown Eyes',
  'Hot Lipstick', 'Purple Lipstick', 'Black Lipstick',
  'Earring', 'Choker', 'Silver Chain'
]

const ZOMBIE_ATTRIBUTES = [
  'Zombie Hair', 'Zombie Bandana',
  'Zombie Glasses', 'Zombie Eye',
  'Rotting Flesh', 'Missing Teeth'
]

const APE_ATTRIBUTES = [
  'Ape Hair', 'Ape Bandana',
  'Ape Glasses', 'Ape Earring',
  'Banana', 'Cigar'
]

const ALIEN_ATTRIBUTES = [
  'Alien Headband', 'Alien Cap',
  'Alien Glasses', 'Alien Earring',
  'UFO', 'Laser Eyes'
]

const BACKGROUNDS = [
  'Blue', 'Green', 'Orange', 'Purple', 'Red', 'Yellow',
  'Aqua', 'Gray', 'Black', 'Pink'
]

/**
 * Generates a random punk metadata
 * @param seed - Optional seed for deterministic generation
 * @returns Punk metadata
 */
export function generatePunkMetadata(seed?: string): PunkMetadata {
  const random = seed ? seededRandom(seed) : Math.random

  // Select type based on rarity
  const typeRoll = random()
  let type: string
  let attributes: string[]

  if (typeRoll < 0.01) {
    // 1% Alien (rarest)
    type = 'Alien'
    attributes = ALIEN_ATTRIBUTES
  } else if (typeRoll < 0.03) {
    // 2% Ape
    type = 'Ape'
    attributes = APE_ATTRIBUTES
  } else if (typeRoll < 0.06) {
    // 3% Zombie
    type = 'Zombie'
    attributes = ZOMBIE_ATTRIBUTES
  } else if (typeRoll < 0.53) {
    // 47% Male
    type = 'Male'
    attributes = MALE_ATTRIBUTES
  } else {
    // 47% Female
    type = 'Female'
    attributes = FEMALE_ATTRIBUTES
  }

  // Select 2-5 random attributes
  const numAttributes = Math.floor(random() * 4) + 2
  const selectedAttributes: string[] = []

  for (let i = 0; i < numAttributes; i++) {
    const attr = attributes[Math.floor(random() * attributes.length)]
    if (!selectedAttributes.includes(attr)) {
      selectedAttributes.push(attr)
    }
  }

  // Select background
  const backgroundIndex = Math.floor(random() * BACKGROUNDS.length)
  const background = BACKGROUNDS[backgroundIndex] || BACKGROUNDS[0] || 'Blue'

  // Generate punk ID
  const metadataString = JSON.stringify({ type, attributes: selectedAttributes, background })
  const punkId = hex.encode(sha256(new TextEncoder().encode(metadataString)))

  // Generate a simple pixel art representation (base64 encoded SVG)
  const imageUrl = generatePunkImage(type, selectedAttributes, background)

  return {
    punkId,
    name: `Punk #${punkId.slice(0, 8)}`,
    traits: {
      type,
      attributes: selectedAttributes.sort(),
      background
    },
    imageUrl,
    description: `A ${type} punk with ${selectedAttributes.join(', ')} on ${background} background`
  }
}

/**
 * Creates a seeded random function for deterministic generation using SHA256
 * This ensures punks cannot be predicted before the transaction is broadcast
 */
function seededRandom(seed: string): () => number {
  // Use SHA256 for cryptographically secure seeding
  const hashBytes = sha256(new TextEncoder().encode(seed))

  let index = 0

  return () => {
    // Use 4 bytes at a time from the hash
    const offset = (index * 4) % hashBytes.length
    const value = (
      (hashBytes[offset] << 24) |
      (hashBytes[(offset + 1) % hashBytes.length] << 16) |
      (hashBytes[(offset + 2) % hashBytes.length] << 8) |
      hashBytes[(offset + 3) % hashBytes.length]
    ) >>> 0 // Unsigned 32-bit integer

    index++

    // If we've used all bytes, hash again with index
    if (index * 4 >= hashBytes.length * 2) {
      const newSeed = seed + index.toString()
      const newHash = sha256(new TextEncoder().encode(newSeed))
      for (let i = 0; i < hashBytes.length; i++) {
        hashBytes[i] = newHash[i]
      }
      index = 0
    }

    // Return value between 0 and 1
    return value / 0xFFFFFFFF
  }
}

/**
 * Generates a punk deterministically from a transaction ID
 * This prevents users from cherry-picking rare punks before minting
 */
export function generatePunkFromTxid(txid: string): PunkMetadata {
  return generatePunkMetadata(txid)
}

/**
 * Generates a simple SVG representation of a punk
 * In production, you'd use actual pixel art or images
 */
export function generatePunkImage(
  type: string,
  attributes: string[],
  background: string
): string {
  const faceColor = getTypeColor(type)

  // Detect specific attributes
  const hasMohawk = attributes.some(a => a.includes('Mohawk'))
  const hasBandana = attributes.some(a => a.includes('Bandana'))
  const hasCap = attributes.some(a => a.includes('Cap') || a.includes('Beanie'))
  const hasHair = attributes.some(a => a.includes('Hair'))
  const hasGlasses = attributes.some(a => a.includes('Glasses'))
  const hasVR = attributes.some(a => a.includes('VR'))
  const hasEyePatch = attributes.some(a => a.includes('Eye Patch'))
  const hasSmoke = attributes.some(a => a.includes('Cigarette') || a.includes('Pipe') || a.includes('Vape'))
  const hasMoustache = attributes.some(a => a.includes('Moustache'))
  const hasBeard = attributes.some(a => a.includes('Beard') || a.includes('Goatee'))
  const hasEarring = attributes.some(a => a.includes('Earring'))
  const hasChain = attributes.some(a => a.includes('Chain'))

  // Generate unique colors based on attributes
  const hatColor = hashStringToColor(attributes.join(''))
  const skinVariation = hashStringToColor(type + background)

  // Add skin tone variation for human types
  let finalFaceColor = faceColor
  if (type === 'Male' || type === 'Female') {
    const variations = ['#f5c6a5', '#e0ac69', '#c68642', '#8d5524', '#ffd4c4', '#f1c27d']
    const hash = attributes.join('').split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    finalFaceColor = variations[hash % variations.length]
  }

  // Simple 24x24 pixel punk SVG with detailed variety
  const bgColor = (background || 'Blue').toLowerCase()
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240" style="image-rendering: pixelated;">
      <!-- Background -->
      <rect width="24" height="24" fill="${bgColor}" />

      <!-- Mohawk (spiky hair on top) -->
      ${hasMohawk ? `
      <rect x="10" y="1" width="4" height="3" fill="${hatColor}" />
      <rect x="11" y="0" width="2" height="1" fill="${hatColor}" />
      <rect x="9" y="2" width="6" height="1" fill="${hatColor}" opacity="0.9" />
      <rect x="9" y="3" width="2" height="1" fill="${hatColor}" opacity="0.7" />
      <rect x="13" y="3" width="2" height="1" fill="${hatColor}" opacity="0.7" />
      ` : ''}

      <!-- Bandana -->
      ${hasBandana ? `
      <rect x="6" y="5" width="12" height="2" fill="${hatColor}" />
      <rect x="7" y="4" width="10" height="1" fill="${hatColor}" opacity="0.8" />
      <rect x="18" y="6" width="2" height="2" fill="${hatColor}" />
      <rect x="19" y="7" width="1" height="2" fill="${hatColor}" opacity="0.7" />
      ` : ''}

      <!-- Cap/Beanie -->
      ${hasCap ? `
      <rect x="6" y="3" width="12" height="4" fill="${hatColor}" rx="1" />
      <rect x="5" y="4" width="14" height="2" fill="${hatColor}" opacity="0.8" />
      <rect x="7" y="2" width="10" height="1" fill="${hatColor}" opacity="0.6" />
      <ellipse cx="12" cy="4" rx="6" ry="2" fill="${hatColor}" opacity="0.4" />
      ` : ''}

      <!-- Hair (wild/messy) -->
      ${hasHair && !hasMohawk && !hasBandana && !hasCap ? `
      <rect x="5" y="4" width="3" height="4" fill="${hatColor}" />
      <rect x="16" y="4" width="3" height="4" fill="${hatColor}" />
      <rect x="6" y="3" width="12" height="3" fill="${hatColor}" />
      <rect x="4" y="5" width="2" height="2" fill="${hatColor}" opacity="0.7" />
      <rect x="18" y="5" width="2" height="2" fill="${hatColor}" opacity="0.7" />
      <rect x="7" y="2" width="10" height="1" fill="${hatColor}" opacity="0.5" />
      ` : ''}

      <!-- Neck -->
      <rect x="9" y="17" width="6" height="2" fill="${finalFaceColor}" opacity="0.8" />
      <rect x="10" y="18" width="4" height="1" fill="${finalFaceColor}" opacity="0.6" />

      <!-- Face base (rounded square head shape) -->
      <rect x="6" y="6" width="12" height="12" rx="3" ry="3" fill="${finalFaceColor}" />

      <!-- Face shading (add depth) -->
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" ry="2.5" fill="${finalFaceColor}" opacity="0.9" />
      <rect x="7" y="7" width="9" height="9" rx="2" ry="2" fill="#fff" opacity="0.05" />

      <!-- Ears -->
      <rect x="4.5" y="10" width="2" height="3" rx="1" ry="1.5" fill="${finalFaceColor}" />
      <rect x="17.5" y="10" width="2" height="3" rx="1" ry="1.5" fill="${finalFaceColor}" />
      <rect x="5" y="10.5" width="1" height="2" rx="0.5" ry="1" fill="${finalFaceColor}" opacity="0.6" />
      <rect x="18" y="10.5" width="1" height="2" rx="0.5" ry="1" fill="${finalFaceColor}" opacity="0.6" />

      <!-- Alien special effects -->
      ${type === 'Alien' ? `
      <rect x="5" y="7" width="14" height="10" fill="#88ff88" opacity="0.3" />
      <rect x="11" y="5" width="2" height="2" fill="#88ff88" />
      <circle cx="10" cy="5" r="1" fill="#00ff00" />
      <circle cx="14" cy="5" r="1" fill="#00ff00" />
      ` : ''}

      <!-- Zombie special effects -->
      ${type === 'Zombie' ? `
      <rect x="7" y="8" width="10" height="8" fill="#88cc88" opacity="0.5" />
      <rect x="9" y="7" width="1" height="3" fill="#5a5a3a" />
      <rect x="15" y="9" width="1" height="2" fill="#5a5a3a" />
      <rect x="12" y="16" width="2" height="1" fill="#3a3a2a" />
      ` : ''}

      <!-- Ape special effects -->
      ${type === 'Ape' ? `
      <rect x="5" y="8" width="2" height="6" fill="#8b4513" opacity="0.6" />
      <rect x="17" y="8" width="2" height="6" fill="#8b4513" opacity="0.6" />
      <rect x="7" y="6" width="10" height="1" fill="#6d3410" />
      ` : ''}

      <!-- Cheeks (for human types) -->
      ${type === 'Male' || type === 'Female' ? `
      <ellipse cx="8.5" cy="13.5" rx="1.5" ry="1" fill="#ff9999" opacity="0.2" />
      <ellipse cx="15.5" cy="13.5" rx="1.5" ry="1" fill="#ff9999" opacity="0.2" />
      ` : ''}

      <!-- Eyebrows (if no hat covering) -->
      ${!hasCap && !hasBandana ? `
      <rect x="8" y="9" width="3" height="0.5" fill="#000" opacity="0.3" />
      <rect x="13" y="9" width="3" height="0.5" fill="#000" opacity="0.3" />
      ` : ''}

      <!-- Nose (more defined) -->
      <ellipse cx="12" cy="13" rx="1" ry="1.5" fill="#000" opacity="0.15" />
      <rect x="11.5" y="13.5" width="1" height="0.5" fill="#000" opacity="0.2" />

      <!-- Eyes with variations -->
      ${hasVR ? `
      <rect x="6" y="9" width="6" height="4" fill="#00ffff" opacity="0.7" />
      <rect x="12" y="9" width="6" height="4" fill="#00ffff" opacity="0.7" />
      <rect x="5" y="10" width="8" height="1" fill="#0088ff" />
      <rect x="11" y="10" width="8" height="1" fill="#0088ff" />
      ` : hasEyePatch ? `
      <rect x="7" y="9" width="4" height="4" fill="#000" />
      <rect x="6" y="10" width="1" height="2" fill="#222" />
      <rect x="14" y="10" width="2" height="2" fill="black" />
      ` : hasGlasses ? `
      <rect x="7" y="9" width="3" height="3" fill="#333" opacity="0.7" />
      <rect x="14" y="9" width="3" height="3" fill="#333" opacity="0.7" />
      <rect x="6" y="10" width="6" height="1" fill="#222" />
      <rect x="12" y="10" width="6" height="1" fill="#222" />
      <circle cx="8.5" cy="10.5" r="0.8" fill="white" opacity="0.3" />
      <circle cx="15.5" cy="10.5" r="0.8" fill="white" opacity="0.3" />
      ` : `
      <rect x="8" y="10" width="2" height="2" fill="black" />
      <rect x="14" y="10" width="2" height="2" fill="black" />
      ${type === 'Alien' ? '<rect x="9" y="10" width="1" height="1" fill="#00ff00" /><rect x="15" y="10" width="1" height="1" fill="#00ff00" />' : ''}
      ${type !== 'Alien' ? '<rect x="8" y="10" width="1" height="1" fill="white" opacity="0.4" /><rect x="14" y="10" width="1" height="1" fill="white" opacity="0.4" />' : ''}
      `}

      <!-- Mouth -->
      ${type === 'Zombie' ? `
      <ellipse cx="12" cy="15.5" rx="3" ry="1.5" fill="#3a3a2a" />
      <rect x="10" y="16" width="1" height="1" fill="#fff" opacity="0.6" />
      <rect x="13" y="16" width="1" height="1" fill="#fff" opacity="0.6" />
      <rect x="11" y="15" width="2" height="1" fill="#3a3a2a" opacity="0.8" />
      ` : type === 'Ape' ? `
      <ellipse cx="12" cy="15" rx="4" ry="2" fill="#6d3410" />
      <rect x="9" y="15" width="6" height="1" fill="#3a2010" />
      <ellipse cx="12" cy="16" rx="2" ry="1" fill="#3a2010" opacity="0.5" />
      ` : type === 'Alien' ? `
      <ellipse cx="12" cy="15" rx="2" ry="0.8" fill="#00ff00" opacity="0.4" />
      <rect x="10" y="15" width="4" height="0.5" fill="#00ff00" opacity="0.3" />
      ` : `
      <ellipse cx="12" cy="15.5" rx="2" ry="0.8" fill="#ff6b8a" opacity="0.5" />
      <rect x="10.5" y="15" width="3" height="1" fill="#000" opacity="0.2" />
      `}

      <!-- Moustache -->
      ${hasMoustache ? `
      <rect x="8" y="14" width="8" height="1" fill="#3a2a1a" />
      <rect x="7" y="14" width="2" height="1" fill="#2a1a0a" opacity="0.7" />
      <rect x="15" y="14" width="2" height="1" fill="#2a1a0a" opacity="0.7" />
      ` : ''}

      <!-- Beard -->
      ${hasBeard ? `
      <rect x="8" y="15" width="8" height="2" fill="#3a2a1a" />
      <rect x="7" y="16" width="10" height="1" fill="#2a1a0a" />
      <rect x="9" y="17" width="6" height="1" fill="#3a2a1a" opacity="0.7" />
      ` : ''}

      <!-- Smoke -->
      ${hasSmoke ? `
      <rect x="5" y="13" width="3" height="1" fill="#ddd" />
      <rect x="4" y="12" width="1" height="1" fill="#aaa" opacity="0.7" />
      <rect x="3" y="11" width="1" height="1" fill="#888" opacity="0.5" />
      <circle cx="5.5" cy="13.5" r="0.5" fill="#fff" opacity="0.5" />
      ` : ''}

      <!-- Earring -->
      ${hasEarring ? `
      <circle cx="5" cy="13" r="1.2" fill="#ffd700" />
      <circle cx="19" cy="13" r="1.2" fill="#ffd700" />
      <circle cx="5" cy="13" r="0.6" fill="#ffed4e" />
      <circle cx="19" cy="13" r="0.6" fill="#ffed4e" />
      <circle cx="4.7" cy="12.7" r="0.3" fill="#fff" opacity="0.8" />
      <circle cx="18.7" cy="12.7" r="0.3" fill="#fff" opacity="0.8" />
      ` : ''}

      <!-- Chain -->
      ${hasChain ? `
      <ellipse cx="12" cy="18" rx="3" ry="0.8" fill="#ffd700" />
      <circle cx="10" cy="18" r="0.8" fill="#ffd700" />
      <circle cx="12" cy="18" r="0.8" fill="#ffd700" />
      <circle cx="14" cy="18" r="0.8" fill="#ffd700" />
      <circle cx="11" cy="17.5" r="0.5" fill="#ffed4e" opacity="0.7" />
      <circle cx="13" cy="17.5" r="0.5" fill="#ffed4e" opacity="0.7" />
      ` : ''}
    </svg>
  `.trim()

  // Convert to data URL
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/**
 * Hash a string to generate a consistent color
 */
function hashStringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
                  '#ff8800', '#88ff00', '#0088ff', '#ff0088', '#8800ff', '#00ff88',
                  '#ff6b35', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6']

  return colors[Math.abs(hash) % colors.length]
}

/**
 * Gets color for punk type
 */
function getTypeColor(type: string): string {
  switch (type) {
    case 'Alien': return '#88ff88'
    case 'Ape': return '#8b4513'
    case 'Zombie': return '#88cc88'
    case 'Male': return '#f5c6a5'
    case 'Female': return '#ffd4c4'
    default: return '#cccccc'
  }
}

/**
 * Generates a collection of punks
 * @param count - Number of punks to generate
 * @returns Array of punk metadata
 */
export function generatePunkCollection(count: number): PunkMetadata[] {
  const punks: PunkMetadata[] = []
  const seen = new Set<string>()

  let attempts = 0
  const maxAttempts = count * 10

  while (punks.length < count && attempts < maxAttempts) {
    const punk = generatePunkMetadata(`${Date.now()}-${attempts}`)

    if (!seen.has(punk.punkId)) {
      seen.add(punk.punkId)
      punks.push(punk)
    }

    attempts++
  }

  return punks
}

/**
 * Calculates rarity score for a punk
 * Lower score = more rare
 */
export function calculateRarityScore(metadata: PunkMetadata): number {
  let score = 100

  // Type rarity
  switch (metadata.traits.type) {
    case 'Alien': score -= 50; break
    case 'Ape': score -= 40; break
    case 'Zombie': score -= 30; break
    default: score -= 0
  }

  // Attribute count (fewer attributes = more rare)
  score -= (5 - metadata.traits.attributes.length) * 5

  return Math.max(0, score)
}

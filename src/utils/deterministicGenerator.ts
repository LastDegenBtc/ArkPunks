import { PunkMetadata } from '@/types/punk'
import { sha256 } from '@scure/btc-signer/utils'
import { hex } from '@scure/base'
import {
  PunkType,
  Background,
  compressPunkMetadata,
  decompressPunkMetadata,
  CompressedPunk
} from './compression'

/**
 * Deterministic punk generation from a seed
 *
 * Similar to original CryptoPunks, where punk #1234 always has the same traits.
 * This allows on-chain verification and reconstruction without storing full metadata.
 */

const TYPE_NAMES = ['Male', 'Female', 'Zombie', 'Ape', 'Alien']
const BACKGROUND_NAMES = [
  'Blue', 'Green', 'Orange', 'Purple', 'Red',
  'Yellow', 'Aqua', 'Gray', 'Black', 'Pink'
]

const ATTRIBUTES_BY_TYPE: Record<number, string[]> = {
  [PunkType.Male]: [
    'Mohawk', 'Bandana', 'Beanie', 'Cap', 'Hoodie',
    'Glasses', 'Sunglasses', 'VR Headset', 'Eye Patch',
    'Cigarette', 'Pipe', 'Vape',
    'Moustache', 'Beard', 'Goatee',
    'Earring', 'Gold Chain', 'Choker'
  ],
  [PunkType.Female]: [
    'Wild Hair', 'Straight Hair', 'Messy Hair', 'Knitted Cap', 'Headband',
    'Glasses', 'Sunglasses', 'Clown Eyes',
    'Hot Lipstick', 'Purple Lipstick', 'Black Lipstick',
    'Earring', 'Choker', 'Silver Chain'
  ],
  [PunkType.Zombie]: [
    'Zombie Hair', 'Zombie Bandana',
    'Zombie Glasses', 'Zombie Eye',
    'Rotting Flesh', 'Missing Teeth'
  ],
  [PunkType.Ape]: [
    'Ape Hair', 'Ape Bandana',
    'Ape Glasses', 'Ape Earring',
    'Banana', 'Cigar'
  ],
  [PunkType.Alien]: [
    'Alien Headband', 'Alien Cap',
    'Alien Glasses', 'Alien Earring',
    'UFO', 'Laser Eyes'
  ]
}

/**
 * Seeded random number generator (deterministic)
 */
class SeededRandom {
  private state: number

  constructor(seed: Uint8Array) {
    // Initialize state from seed
    this.state = 0
    for (let i = 0; i < seed.length; i++) {
      this.state = ((this.state << 5) - this.state) + seed[i]
      this.state = this.state & 0xFFFFFFFF
    }
    if (this.state === 0) this.state = 1
  }

  next(): number {
    // Linear congruential generator
    this.state = (this.state * 1103515245 + 12345) & 0xFFFFFFFF
    return (this.state / 0xFFFFFFFF)
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }
}

/**
 * Generates deterministic punk metadata from a seed
 * The seed can be any unique identifier (e.g., punkId, txid, etc.)
 */
export function generateDeterministicPunk(seed: string): {
  metadata: PunkMetadata
  compressed: CompressedPunk
} {
  const seedBytes = sha256(new TextEncoder().encode(seed))
  const rng = new SeededRandom(seedBytes)

  // Determine type based on rarity distribution
  const typeRoll = rng.next()
  let type: PunkType
  let typeName: string

  if (typeRoll < 0.01) {
    type = PunkType.Alien
    typeName = 'Alien'
  } else if (typeRoll < 0.03) {
    type = PunkType.Ape
    typeName = 'Ape'
  } else if (typeRoll < 0.06) {
    type = PunkType.Zombie
    typeName = 'Zombie'
  } else if (typeRoll < 0.53) {
    type = PunkType.Male
    typeName = 'Male'
  } else {
    type = PunkType.Female
    typeName = 'Female'
  }

  // Select background
  const bgIndex = rng.nextInt(BACKGROUND_NAMES.length)
  const background = BACKGROUND_NAMES[bgIndex]

  // Select 2-5 random attributes
  const availableAttributes = ATTRIBUTES_BY_TYPE[type]
  const numAttributes = rng.nextInt(4) + 2 // 2 to 5

  const selectedAttributes: string[] = []
  const usedIndices = new Set<number>()

  for (let i = 0; i < numAttributes && i < availableAttributes.length; i++) {
    let attrIndex: number
    let attempts = 0

    // Find unused attribute
    do {
      attrIndex = rng.nextInt(availableAttributes.length)
      attempts++
    } while (usedIndices.has(attrIndex) && attempts < 100)

    if (!usedIndices.has(attrIndex)) {
      usedIndices.add(attrIndex)
      selectedAttributes.push(availableAttributes[attrIndex])
    }
  }

  // Generate punk ID from seed
  const punkId = hex.encode(seedBytes)

  // Create metadata
  const metadata: PunkMetadata = {
    punkId,
    name: `Punk #${punkId.slice(0, 8)}`,
    traits: {
      type: typeName,
      attributes: selectedAttributes.sort(),
      background
    },
    imageUrl: '', // Will be generated client-side
    description: `A ${typeName} punk with ${selectedAttributes.join(', ')} on ${background} background`
  }

  // Compress metadata
  const compressed = compressPunkMetadata(metadata)

  return { metadata, compressed }
}

/**
 * Reconstructs punk metadata from compressed on-chain data
 */
export function reconstructPunkFromCompressed(
  compressedData: Uint8Array,
  punkId: string
): PunkMetadata {
  return decompressPunkMetadata({ data: compressedData }, punkId)
}

/**
 * Generates a collection of deterministic punks
 */
export function generateDeterministicCollection(
  count: number,
  basePrefix: string = 'punk'
): Array<{ metadata: PunkMetadata; compressed: CompressedPunk }> {
  const punks = []

  for (let i = 0; i < count; i++) {
    const seed = `${basePrefix}-${i}`
    punks.push(generateDeterministicPunk(seed))
  }

  return punks
}

/**
 * Verifies that a punk's metadata matches its compressed on-chain data
 */
export function verifyPunkIntegrity(
  metadata: PunkMetadata,
  compressedData: Uint8Array
): boolean {
  try {
    // Compress the metadata
    const compressed = compressPunkMetadata(metadata)

    // Compare byte by byte
    if (compressed.data.length !== compressedData.length) {
      return false
    }

    for (let i = 0; i < compressed.data.length; i++) {
      if (compressed.data[i] !== compressedData[i]) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Get punk rarity score based on compressed data
 */
export function getRarityFromCompressed(compressedData: Uint8Array): number {
  const typeIndex = (compressedData[0] >>> 5) & 0x07
  const attributeCount = compressedData[5]

  let score = 100

  // Type rarity
  switch (typeIndex) {
    case PunkType.Alien:
      score -= 50
      break
    case PunkType.Ape:
      score -= 40
      break
    case PunkType.Zombie:
      score -= 30
      break
  }

  // Attribute count (fewer = more rare)
  score -= (5 - attributeCount) * 5

  return Math.max(0, score)
}

import { PunkMetadata } from '@/types/punk'
import { hex } from '@scure/base'
import { generatePunkImage } from './generator'

/**
 * On-chain punk data compression
 *
 * Format: 6 bytes total
 * - Byte 0: [Type: 3 bits] [Background: 4 bits] [Reserved: 1 bit]
 * - Bytes 1-4: Attribute bitmap (32 bits for up to 32 attributes)
 * - Byte 5: Attribute count (for validation)
 *
 * This allows punk metadata to be stored directly in Bitcoin VTXOs
 * while using minimal space (6 bytes vs hundreds of bytes of JSON)
 */

// Type encoding (3 bits = 8 possible types)
export enum PunkType {
  Male = 0,      // 000
  Female = 1,    // 001
  Zombie = 2,    // 010
  Ape = 3,       // 011
  Alien = 4      // 100
}

// Background encoding (4 bits = 16 possible backgrounds)
export enum Background {
  Blue = 0,
  Green = 1,
  Orange = 2,
  Purple = 3,
  Red = 4,
  Yellow = 5,
  Aqua = 6,
  Gray = 7,
  Black = 8,
  Pink = 9
}

// Attribute sets per type (max 32 attributes per type)
const ATTRIBUTES_BY_TYPE: Record<PunkType, string[]> = {
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

const BACKGROUND_NAMES = [
  'Blue', 'Green', 'Orange', 'Purple', 'Red',
  'Yellow', 'Aqua', 'Gray', 'Black', 'Pink'
]

const TYPE_NAMES = ['Male', 'Female', 'Zombie', 'Ape', 'Alien']

/**
 * Compressed punk data structure (6 bytes)
 */
export interface CompressedPunk {
  data: Uint8Array // 6 bytes
}

/**
 * Encodes punk metadata into 6 bytes for on-chain storage
 */
export function compressPunkMetadata(metadata: PunkMetadata): CompressedPunk {
  const data = new Uint8Array(6)

  // Parse type
  const typeIndex = TYPE_NAMES.indexOf(metadata.traits.type)
  if (typeIndex === -1) {
    throw new Error(`Invalid punk type: ${metadata.traits.type}`)
  }

  // Parse background
  const bgIndex = BACKGROUND_NAMES.indexOf(metadata.traits.background)
  if (bgIndex === -1) {
    throw new Error(`Invalid background: ${metadata.traits.background}`)
  }

  // Byte 0: [Type: 3 bits] [Background: 4 bits] [Reserved: 1 bit]
  data[0] = (typeIndex << 5) | (bgIndex << 1)

  // Bytes 1-4: Attribute bitmap
  const availableAttributes = ATTRIBUTES_BY_TYPE[typeIndex as PunkType]
  let attributeBitmap = 0

  for (const attr of metadata.traits.attributes) {
    const attrIndex = availableAttributes.indexOf(attr)
    if (attrIndex === -1) {
      throw new Error(`Invalid attribute "${attr}" for type ${metadata.traits.type}`)
    }
    if (attrIndex >= 32) {
      throw new Error(`Attribute index ${attrIndex} exceeds bitmap size`)
    }
    attributeBitmap |= (1 << attrIndex)
  }

  // Write bitmap as 4 bytes (little-endian)
  data[1] = attributeBitmap & 0xFF
  data[2] = (attributeBitmap >>> 8) & 0xFF
  data[3] = (attributeBitmap >>> 16) & 0xFF
  data[4] = (attributeBitmap >>> 24) & 0xFF

  // Byte 5: Attribute count (for validation)
  data[5] = metadata.traits.attributes.length

  return { data }
}

/**
 * Decodes 6 bytes into punk metadata
 */
export function decompressPunkMetadata(compressed: CompressedPunk, punkId: string): PunkMetadata {
  const { data } = compressed

  if (data.length !== 6) {
    throw new Error('Invalid compressed punk data: must be 6 bytes')
  }

  // Byte 0: [Type: 3 bits] [Background: 4 bits] [Reserved: 1 bit]
  const typeIndex = (data[0] >>> 5) & 0x07
  const bgIndex = (data[0] >>> 1) & 0x0F

  if (typeIndex >= TYPE_NAMES.length) {
    throw new Error(`Invalid type index: ${typeIndex}`)
  }
  if (bgIndex >= BACKGROUND_NAMES.length) {
    throw new Error(`Invalid background index: ${bgIndex}`)
  }

  const type = TYPE_NAMES[typeIndex]
  const background = BACKGROUND_NAMES[bgIndex]

  // Bytes 1-4: Attribute bitmap
  const attributeBitmap =
    data[1] |
    (data[2] << 8) |
    (data[3] << 16) |
    (data[4] << 24)

  // Byte 5: Attribute count
  const expectedCount = data[5]

  // Decode attributes
  const availableAttributes = ATTRIBUTES_BY_TYPE[typeIndex as PunkType]
  const attributes: string[] = []

  for (let i = 0; i < 32; i++) {
    if (attributeBitmap & (1 << i)) {
      if (i < availableAttributes.length) {
        attributes.push(availableAttributes[i])
      }
    }
  }

  // Validate count
  if (attributes.length !== expectedCount) {
    throw new Error(
      `Attribute count mismatch: expected ${expectedCount}, got ${attributes.length}`
    )
  }

  // Generate image from traits
  const imageUrl = generatePunkImage(type, attributes, background)

  return {
    punkId,
    name: `Punk #${punkId.slice(0, 8)}`,
    traits: {
      type,
      attributes: attributes.sort(),
      background
    },
    imageUrl,
    description: `A ${type} punk with ${attributes.join(', ')} on ${background} background`
  }
}

/**
 * Converts compressed data to hex string for storage in VTXO
 */
export function compressedToHex(compressed: CompressedPunk): string {
  return hex.encode(compressed.data)
}

/**
 * Parses hex string from VTXO into compressed punk data
 */
export function hexToCompressed(hexString: string): CompressedPunk {
  const data = hex.decode(hexString)
  if (data.length !== 6) {
    throw new Error('Invalid hex string: must decode to 6 bytes')
  }
  return { data }
}

/**
 * Validates that compressed data is valid
 */
export function validateCompressed(compressed: CompressedPunk): boolean {
  try {
    const metadata = decompressPunkMetadata(compressed, '0'.repeat(64))
    return metadata.traits.attributes.length > 0
  } catch {
    return false
  }
}

/**
 * Get compression ratio information
 */
export function getCompressionStats(metadata: PunkMetadata): {
  originalSize: number
  compressedSize: number
  ratio: number
} {
  const originalSize = JSON.stringify(metadata).length
  const compressedSize = 6

  return {
    originalSize,
    compressedSize,
    ratio: originalSize / compressedSize
  }
}

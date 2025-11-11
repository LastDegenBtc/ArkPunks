/**
 * Simple tests for on-chain compression
 * Run with: npx tsx test-compression.ts
 */

import { generateDeterministicPunk, verifyPunkIntegrity, reconstructPunkFromCompressed } from './src/utils/deterministicGenerator'
import { compressPunkMetadata, decompressPunkMetadata } from './src/utils/compression'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (error) {
    console.log(`❌ ${name}`)
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`)
    failed++
  }
}

console.log('🧪 Running Compression Tests\n')

// Test 1: Basic compression/decompression
test('Compress and decompress punk metadata', () => {
  const { metadata, compressed } = generateDeterministicPunk('test-1')
  const reconstructed = decompressPunkMetadata(compressed, metadata.punkId)

  if (metadata.traits.type !== reconstructed.traits.type) {
    throw new Error('Type mismatch')
  }
  if (metadata.traits.background !== reconstructed.traits.background) {
    throw new Error('Background mismatch')
  }
  if (metadata.traits.attributes.length !== reconstructed.traits.attributes.length) {
    throw new Error('Attribute count mismatch')
  }
})

// Test 2: Compression size
test('Compressed data is exactly 6 bytes', () => {
  const { compressed } = generateDeterministicPunk('test-2')
  if (compressed.data.length !== 6) {
    throw new Error(`Expected 6 bytes, got ${compressed.data.length}`)
  }
})

// Test 3: Deterministic generation
test('Same seed produces same punk', () => {
  const punk1 = generateDeterministicPunk('same-seed')
  const punk2 = generateDeterministicPunk('same-seed')

  if (punk1.metadata.punkId !== punk2.metadata.punkId) {
    throw new Error('PunkIds do not match')
  }
  if (punk1.metadata.traits.type !== punk2.metadata.traits.type) {
    throw new Error('Types do not match')
  }
})

// Test 4: Different seeds produce different punks
test('Different seeds produce different punks', () => {
  const punk1 = generateDeterministicPunk('seed-1')
  const punk2 = generateDeterministicPunk('seed-2')

  if (punk1.metadata.punkId === punk2.metadata.punkId) {
    throw new Error('PunkIds should be different')
  }
})

// Test 5: Integrity verification
test('Verify punk integrity', () => {
  const { metadata, compressed } = generateDeterministicPunk('test-5')
  const isValid = verifyPunkIntegrity(metadata, compressed.data)

  if (!isValid) {
    throw new Error('Integrity check failed')
  }
})

// Test 6: Reject corrupted data
test('Detect corrupted compressed data', () => {
  const { metadata, compressed } = generateDeterministicPunk('test-6')

  // Corrupt the data
  const corrupted = new Uint8Array(compressed.data)
  corrupted[0] = 0xFF // Invalid type/background

  const isValid = verifyPunkIntegrity(metadata, corrupted)

  if (isValid) {
    throw new Error('Should detect corrupted data')
  }
})

// Test 7: All punk types can be encoded
test('Encode all punk types', () => {
  const types = ['alien', 'ape', 'zombie', 'male', 'female']
  const seenTypes = new Set<string>()

  for (let i = 0; i < 100; i++) {
    const { metadata } = generateDeterministicPunk(`type-test-${i}`)
    seenTypes.add(metadata.traits.type)
  }

  // Should see at least 3 different types in 100 punks
  if (seenTypes.size < 3) {
    throw new Error(`Only saw ${seenTypes.size} types, expected at least 3`)
  }
})

// Test 8: Attribute count is accurate
test('Attribute count matches bitmap', () => {
  const { compressed } = generateDeterministicPunk('test-8')

  const attributeCount = compressed.data[5]
  const bitmap =
    compressed.data[1] |
    (compressed.data[2] << 8) |
    (compressed.data[3] << 16) |
    (compressed.data[4] << 24)

  let bitsSet = 0
  for (let i = 0; i < 32; i++) {
    if (bitmap & (1 << i)) {
      bitsSet++
    }
  }

  if (bitsSet !== attributeCount) {
    throw new Error(`Bitmap has ${bitsSet} bits set, but count says ${attributeCount}`)
  }
})

// Test 9: Reconstruction preserves all data
test('Reconstruction preserves all punk data', () => {
  const { metadata, compressed } = generateDeterministicPunk('test-9')
  const reconstructed = reconstructPunkFromCompressed(compressed.data, metadata.punkId)

  if (JSON.stringify(metadata.traits) !== JSON.stringify(reconstructed.traits)) {
    throw new Error('Traits do not match after reconstruction')
  }
})

// Test 10: Compress manually created metadata
test('Compress manually created punk metadata', () => {
  const metadata = {
    punkId: '0'.repeat(64),
    name: 'Test Punk',
    traits: {
      type: 'Male',
      attributes: ['Mohawk', 'Glasses'],
      background: 'Blue'
    },
    imageUrl: '',
    description: 'Test'
  }

  const compressed = compressPunkMetadata(metadata)
  if (compressed.data.length !== 6) {
    throw new Error('Compression failed')
  }

  const reconstructed = decompressPunkMetadata(compressed, metadata.punkId)
  if (reconstructed.traits.type !== 'Male') {
    throw new Error('Type not preserved')
  }
})

// Summary
console.log(`\n${'='.repeat(50)}`)
console.log(`\n✅ Passed: ${passed}`)
console.log(`❌ Failed: ${failed}`)
console.log(`📊 Total: ${passed + failed}`)

if (failed === 0) {
  console.log(`\n🎉 All tests passed!\n`)
  process.exit(0)
} else {
  console.log(`\n⚠️  Some tests failed!\n`)
  process.exit(1)
}

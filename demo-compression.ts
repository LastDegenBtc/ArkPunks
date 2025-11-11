/**
 * Arkade Punks - On-Chain Compression Demo
 *
 * This demo shows how punk metadata is compressed into 6 bytes
 * for on-chain storage in Bitcoin VTXOs.
 */

import { generateDeterministicPunk, verifyPunkIntegrity } from './src/utils/deterministicGenerator'
import { compressedToHex, getCompressionStats } from './src/utils/compression'

console.log('🎨 Arkade Punks - On-Chain Compression Demo\n')
console.log('=' .repeat(60))

// Generate a deterministic punk
console.log('\n1️⃣  Generating deterministic punk from seed...')
const seed = 'demo-punk-12345'
const { metadata, compressed } = generateDeterministicPunk(seed)

console.log('\n📊 Punk Metadata:')
console.log('   Punk ID:', metadata.punkId.slice(0, 16) + '...')
console.log('   Name:', metadata.name)
console.log('   Type:', metadata.traits.type)
console.log('   Attributes:', metadata.traits.attributes.join(', '))
console.log('   Background:', metadata.traits.background)

// Show compressed data
console.log('\n2️⃣  Compressed on-chain data:')
const hexData = compressedToHex(compressed)
console.log('   Hex:', hexData)
console.log('   Bytes:', compressed.data.length)
console.log('   Binary:', Array.from(compressed.data)
  .map(b => b.toString(2).padStart(8, '0'))
  .join(' '))

// Show compression stats
console.log('\n3️⃣  Compression statistics:')
const stats = getCompressionStats(metadata)
console.log('   Original JSON size:', stats.originalSize, 'bytes')
console.log('   Compressed size:', stats.compressedSize, 'bytes')
console.log('   Compression ratio:', stats.ratio.toFixed(1) + 'x')
console.log('   Savings:', ((1 - stats.compressedSize / stats.originalSize) * 100).toFixed(1) + '%')

// Verify integrity
console.log('\n4️⃣  Verifying integrity...')
const isValid = verifyPunkIntegrity(metadata, compressed.data)
console.log('   Integrity check:', isValid ? '✅ VALID' : '❌ INVALID')

// Show Bitcoin cost savings
console.log('\n5️⃣  Cost comparison (at $50,000 BTC, 10 sat/vB):')
const byteCost = (50000 / 100000000) * 10 // Cost per byte in USD
console.log('   Full JSON on-chain:', (stats.originalSize * byteCost).toFixed(2), 'USD')
console.log('   Compressed on-chain:', (stats.compressedSize * byteCost).toFixed(4), 'USD')
console.log('   Savings per punk:', ((stats.originalSize - stats.compressedSize) * byteCost).toFixed(2), 'USD')

// Generate a collection to show scale
console.log('\n6️⃣  Collection of 10,000 punks:')
const collectionSize = 10000
console.log('   With full JSON:', ((stats.originalSize * collectionSize) / 1024).toFixed(0), 'KB')
console.log('   With compression:', ((stats.compressedSize * collectionSize) / 1024).toFixed(0), 'KB')
console.log('   Total savings:', (((stats.originalSize - stats.compressedSize) * collectionSize * byteCost).toFixed(0)), 'USD')

// Show different punk types
console.log('\n7️⃣  Generating different punk types...')
const types = ['alien', 'ape', 'zombie', 'male', 'female']

for (const type of types) {
  const { metadata: m, compressed: c } = generateDeterministicPunk(`${type}-demo`)
  console.log(`   ${m.traits.type.padEnd(8)} - ${compressedToHex(c)} - ${m.traits.attributes.length} attributes`)
}

// Example: Reconstruction
console.log('\n8️⃣  Reconstruction from on-chain data:')
console.log('   Someone finds this VTXO on Bitcoin...')
console.log('   Compressed data:', hexData)
console.log('   They reconstruct the metadata:')

import { reconstructPunkFromCompressed } from './src/utils/deterministicGenerator'
const reconstructed = reconstructPunkFromCompressed(compressed.data, metadata.punkId)

console.log('   ✅ Type:', reconstructed.traits.type)
console.log('   ✅ Attributes:', reconstructed.traits.attributes.join(', '))
console.log('   ✅ Background:', reconstructed.traits.background)

console.log('\n' + '='.repeat(60))
console.log('\n🚀 This proves punk metadata can live on Bitcoin forever!')
console.log('   No IPFS, no Arweave, no centralized servers needed.')
console.log('   Just 6 bytes on Bitcoin. Fully verifiable. Fully decentralized.\n')

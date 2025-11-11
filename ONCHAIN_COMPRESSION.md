# 📦 On-Chain Punk Data Compression

## Overview

Arkade Punks stores punk metadata **directly on-chain** using an ultra-efficient compression format.

### Why On-Chain?

- ✅ **Verifiable**: Anyone can reconstruct punk metadata from Bitcoin
- ✅ **Permanent**: Data lives forever on Bitcoin, not on external servers
- ✅ **Efficient**: Only **6 bytes** per punk (vs ~500 bytes of JSON)
- ✅ **Trustless**: No need to trust Nostr relays or IPFS gateways
- ✅ **Sequencer-friendly**: Arkade sequencer can validate and index punks

## Compression Format

### 6 Bytes Total

```
Byte 0:    [Type: 3 bits] [Background: 4 bits] [Reserved: 1 bit]
Bytes 1-4: Attribute bitmap (32 bits)
Byte 5:    Attribute count (validation)
```

### Example

```typescript
import { generateDeterministicPunk, compressedToHex } from '@/utils/deterministicGenerator'
import { compressPunkMetadata } from '@/utils/compression'

// Generate a deterministic punk from a seed
const { metadata, compressed } = generateDeterministicPunk('my-unique-seed')

console.log('Punk Metadata:', metadata)
// {
//   punkId: "a1b2c3...",
//   name: "Punk #a1b2c3d4",
//   traits: {
//     type: "Alien",
//     attributes: ["Alien Cap", "Laser Eyes", "UFO"],
//     background: "Purple"
//   }
// }

console.log('Compressed (hex):', compressedToHex(compressed))
// "6c0700000003" (only 6 bytes!)

console.log('Compression ratio:', getCompressionStats(metadata).ratio)
// ~80x smaller than JSON!
```

## Storage in VTXOs

The compressed data is stored in the `PunkVTXO` structure:

```typescript
interface PunkVTXO {
  punkId: Bytes        // 32 bytes - unique hash
  owner: Bytes         // 32 bytes - owner pubkey
  listingPrice: bigint // Price in sats
  serverPubkey: Bytes  // 32 bytes - Arkade server
  compressedData: Bytes // 6 bytes - COMPRESSED METADATA ⭐
}
```

### Taproot Script Integration

The compressed data can be included in the taproot scripts:

```typescript
import { createPunkVTXO } from '@/utils/punk'
import { generateDeterministicPunk } from '@/utils/deterministicGenerator'
import { hex } from '@scure/base'

// Generate punk
const { metadata, compressed } = generateDeterministicPunk('seed-123')

// Create VTXO with compressed data
const punkVTXO = {
  punkId: hex.decode(metadata.punkId),
  owner: myPubkey,
  listingPrice: 0n,
  serverPubkey: arkServerPubkey,
  compressedData: compressed.data // 6 bytes on-chain!
}

// Create taproot address
const { address, tapscripts } = createPunkVTXO(punkVTXO)
```

## Reconstruction

Anyone can reconstruct the full punk metadata from the 6 bytes:

```typescript
import { reconstructPunkFromCompressed } from '@/utils/deterministicGenerator'
import { hex } from '@scure/base'

// Get compressed data from VTXO
const compressedData = punkVTXO.compressedData // 6 bytes

// Reconstruct full metadata
const metadata = reconstructPunkFromCompressed(
  compressedData,
  hex.encode(punkVTXO.punkId)
)

console.log('Reconstructed:', metadata)
// Full PunkMetadata object with type, attributes, background, etc.
```

## Verification

Verify that metadata matches on-chain data:

```typescript
import { verifyPunkIntegrity } from '@/utils/deterministicGenerator'

const isValid = verifyPunkIntegrity(
  metadata,           // Claimed metadata
  compressedData      // On-chain compressed bytes
)

if (isValid) {
  console.log('✅ Metadata matches on-chain data')
} else {
  console.log('❌ Metadata does NOT match!')
}
```

## Sequencer Role

The Arkade sequencer validates punk data:

```typescript
// Sequencer receives mint transaction
function validatePunkMint(tx: Transaction, punkVTXO: PunkVTXO) {
  // 1. Verify compressed data is valid (6 bytes)
  if (punkVTXO.compressedData.length !== 6) {
    throw new Error('Invalid compressed data size')
  }

  // 2. Reconstruct metadata
  const metadata = reconstructPunkFromCompressed(
    punkVTXO.compressedData,
    hex.encode(punkVTXO.punkId)
  )

  // 3. Verify punkId matches metadata
  const expectedPunkId = generatePunkId(metadata)
  if (expectedPunkId !== hex.encode(punkVTXO.punkId)) {
    throw new Error('PunkId mismatch')
  }

  // 4. Index punk for queries
  await indexPunk(metadata, punkVTXO)

  return true
}
```

## Compression Stats

| Data | Size | Format |
|------|------|--------|
| **Original JSON** | ~500 bytes | `{"punkId":"...","traits":{...}}` |
| **Compressed** | **6 bytes** | `6c0700000003` |
| **Compression ratio** | **~83x** | 🚀 |

### Per 10,000 Punks:

- **Without compression**: 5 MB
- **With compression**: **60 KB**
- **Savings**: 98.8%

## Trade-offs

### ✅ Advantages

- **Extremely efficient**: 6 bytes vs 500+ bytes
- **On-chain verifiable**: All data on Bitcoin
- **Deterministic**: Same seed = same punk
- **No external dependencies**: No IPFS, Arweave, etc.

### ⚠️ Limitations

- **Limited attributes**: Max 32 attributes per type
- **Fixed attribute sets**: Can't add new attributes without protocol upgrade
- **No custom metadata**: Description, external links, etc. are off-chain
- **Image generation**: Images must be generated client-side from traits

## Best Practices

### 1. Store Critical Data On-Chain

```typescript
// ✅ Good: Traits on-chain (6 bytes)
const punkVTXO = {
  compressedData: compressed.data // Type, attributes, background
}

// ❌ Bad: Only hash on-chain
const badVTXO = {
  metadataHash: sha256(JSON.stringify(metadata)) // 32 bytes, no data!
}
```

### 2. Use Nostr for Enhanced Metadata

```typescript
// On-chain: Essential punk data (6 bytes)
const punkVTXO = { compressedData }

// Off-chain (Nostr): Additional metadata
const nostrEvent = {
  type: 'mint',
  punkId: metadata.punkId,
  // Extra fields not in compression:
  externalUrl: 'https://...',
  collection: 'Arkade Punks Genesis',
  artist: 'Anonymous',
  highResImage: 'ipfs://...'
}
```

### 3. Client-Side Image Generation

```typescript
import { generatePunkImage } from '@/utils/generator'

// Reconstruct metadata from on-chain data
const metadata = reconstructPunkFromCompressed(compressedData, punkId)

// Generate image client-side
metadata.imageUrl = generatePunkImage(
  metadata.traits.type,
  metadata.traits.attributes,
  metadata.traits.background
)
```

## Comparison with Other Approaches

| Approach | Data Size | Cost | Verifiable | Censorship-Resistant |
|----------|-----------|------|------------|---------------------|
| **On-chain Compression** | 6 bytes | ~$0.10 | ✅ | ✅ |
| Ordinals Inscription | 500+ bytes | $10-100+ | ✅ | ✅ |
| IPFS Hash | 32 bytes | ~$0.20 | ❌ | ⚠️ |
| Nostr Only | 0 bytes | Free | ❌ | ⚠️ |
| Centralized Server | 0 bytes | Free | ❌ | ❌ |

## Future Improvements

1. **Custom attribute encoding**: Allow projects to define custom attribute sets
2. **Layered compression**: Store base traits on-chain, layers off-chain
3. **Sequencer indexing**: Advanced queries on punk traits
4. **Cross-chain bridges**: Export punk data to other chains

## Example: Full Minting Flow

```typescript
import { generateDeterministicPunk } from '@/utils/deterministicGenerator'
import { buildMintTransaction } from '@/utils/punk'
import { hex } from '@scure/base'

// 1. Generate punk deterministically
const seed = `user-${userPubkey}-${Date.now()}`
const { metadata, compressed } = generateDeterministicPunk(seed)

console.log('Generated punk:', metadata.name)
console.log('Compressed size:', compressed.data.length, 'bytes')

// 2. Create VTXO with compressed data
const punkVTXO = {
  punkId: hex.decode(metadata.punkId),
  owner: userPubkey,
  listingPrice: 0n,
  serverPubkey: arkServerPubkey,
  compressedData: compressed.data // 6 bytes on Bitcoin! 🎉
}

// 3. Build mint transaction
const tx = buildMintTransaction(
  punkVTXO,
  fundingVTXOs,
  1000n, // punk value
  changeAddress
)

// 4. Sign and broadcast
tx.sign(privateKey)
await broadcastToArkade(tx)

// 5. (Optional) Publish to Nostr for discovery
await publishPunkEvent({
  type: 'mint',
  punkId: metadata.punkId,
  owner: hex.encode(userPubkey),
  metadata,
  vtxoOutpoint: `${txid}:0`,
  compressedData: hex.encode(compressed.data), // For verification
  timestamp: Date.now()
})

console.log('✅ Punk minted with on-chain metadata!')
```

## Conclusion

Storing punk metadata on-chain with compression provides the best of both worlds:

- **Bitcoin security and permanence**
- **Minimal cost** (6 bytes vs KB of JSON)
- **Verifiable** by anyone
- **Arkade-friendly** (sequencer can validate)

This approach makes Arkade Punks truly **Bitcoin-native NFTs**! 🚀

---

**Next Steps:**
- See [ARCHITECTURE.md](ARCHITECTURE.md) for technical deep dive
- See [EXAMPLE.md](EXAMPLE.md) for complete code examples
- See [QUICKSTART.md](QUICKSTART.md) to start building

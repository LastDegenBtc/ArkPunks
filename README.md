# Arkade Punks 🎨⚡

**CryptoPunks-style NFT Collection on Bitcoin using Arkade Protocol**

Arkade Punks is a proof-of-concept demonstrating how to build a complete NFT collection (à la CryptoPunks) on Bitcoin using the Arkade Protocol. Each punk is represented by a unique VTXO (Virtual Transaction Output) with custom Taproot scripts controlling transfers, listings, and sales.

![Arkade Punks](https://via.placeholder.com/800x200/1a1a1a/ff6b35?text=Arkade+Punks)

## 🌟 Features

- **1 Punk = 1 VTXO**: Each NFT is a Bitcoin VTXO with unique spending conditions
- **Instant Transfers**: Leverage Arkade's offchain execution for instant punk transfers
- **Marketplace Built-in**: List/delist punks with script-enforced pricing
- **Nostr-Native**: All actions coordinated via Nostr events (fully decentralized)
- **Provably Fair**: Punk metadata hashed into VTXO for verifiability
- **Bitcoin Settlement**: All transactions settle on Bitcoin mainnet via Arkade batches

## 🏗️ Architecture

### VTXO-Based NFTs

Each Arkade Punk is a VTXO with **three spending paths** (tapscript leaves):

```typescript
// Leaf 1: TRANSFER - Owner transfers to new owner
transferLeaf = [
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG
]

// Leaf 2: BUY - Someone buys at listed price
buyLeaf = [
  <server_pubkey> CHECKSIG
]

// Leaf 3: LIST/DELIST - Owner changes listing price
listingLeaf = [
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG
]
```

### State Transitions

Every action creates a **new VTXO** with updated state:

```
MINT:     VTXOs → [Punk VTXO (owner=Alice, price=0)]
LIST:     Punk VTXO (price=0) → Punk VTXO (owner=Alice, price=500k)
BUY:      Punk VTXO (owner=Alice, price=500k) + Payment VTXOs →
          Punk VTXO (owner=Bob, price=0) + Payment to Alice
TRANSFER: Punk VTXO (owner=Alice) → Punk VTXO (owner=Bob, price=0)
```

### Nostr Coordination

All punk actions are published as **Nostr events (kind 32001)**:

```json
{
  "kind": 32001,
  "content": {
    "type": "mint",
    "punkId": "abc123...",
    "owner": "npub1...",
    "metadata": {
      "traits": {
        "type": "Alien",
        "attributes": ["Mohawk", "Glasses"],
        "background": "Purple"
      }
    },
    "vtxoOutpoint": "txid:0"
  },
  "tags": [
    ["p", "mint"],
    ["punk", "abc123..."]
  ]
}
```

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- Arkade server access (testnet or mainnet)
- Nostr private key

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/arkade-punks.git
cd arkade-punks

# Install dependencies
npm install
# or
yarn install

# Run development server
npm run serve
# or
yarn serve
```

The app will be available at `http://localhost:8080`

## 📖 Usage Guide

### Minting a Punk

```typescript
import { generatePunkMetadata } from '@/utils/generator'
import { buildMintTransaction, createPunkVTXO } from '@/utils/punk'
import { publishPunkEvent } from '@/utils/nostr'

// 1. Generate punk metadata
const metadata = generatePunkMetadata()

// 2. Create punk VTXO configuration
const punkVTXO: PunkVTXO = {
  punkId: hex.decode(metadata.punkId),
  owner: myPubkey,
  listingPrice: 0n,
  serverPubkey: arkServerPubkey
}

// 3. Build mint transaction
const mintTx = buildMintTransaction(
  punkVTXO,
  myVTXOs,      // VTXOs to fund the mint
  1000n,        // Punk value in sats
  changeAddress
)

// 4. Sign and broadcast
mintTx.sign(myPrivateKey)
await broadcastToArkade(mintTx)

// 5. Publish to Nostr
const mintEvent: MintEvent = {
  type: 'mint',
  punkId: metadata.punkId,
  owner: hex.encode(myPubkey),
  metadata,
  vtxoOutpoint: `${txid}:0`,
  timestamp: Date.now()
}
await publishPunkEvent(mintEvent, myNostrPrivateKey)
```

### Listing a Punk for Sale

```typescript
import { buildListingTransaction } from '@/utils/punk'

// 1. Build listing transaction
const listTx = buildListingTransaction(
  currentPunk,
  currentVtxo,
  500_000n  // List for 500k sats
)

// 2. Sign with owner's key
listTx.sign(ownerPrivateKey)

// 3. Broadcast
await broadcastToArkade(listTx)

// 4. Publish to Nostr
const listEvent: ListEvent = {
  type: 'list',
  punkId: currentPunk.punkId,
  owner: hex.encode(currentPunk.owner),
  listingPrice: '500000',
  signature: hex.encode(signature),
  vtxoOutpoint: `${newTxid}:0`,
  timestamp: Date.now()
}
await publishPunkEvent(listEvent, myNostrPrivateKey)
```

### Buying a Listed Punk

```typescript
import { buildBuyTransaction } from '@/utils/punk'

// 1. Fetch listed punk
const listedPunk = await fetchPunkState(punkId)
if (listedPunk.listingPrice === 0n) {
  throw new Error('Punk not listed')
}

// 2. Build buy transaction
const buyTx = buildBuyTransaction(
  listedPunk,
  listedPunkVtxo,
  buyerPubkey,
  paymentVtxos,         // Buyer's VTXOs for payment
  sellerAddress,        // Where to send payment
  buyerChangeAddress
)

// 3. Sign with buyer's key
buyTx.sign(buyerPrivateKey)

// 4. Broadcast
await broadcastToArkade(buyTx)

// 5. Publish to Nostr
const buyEvent: BuyEvent = {
  type: 'buy',
  punkId: listedPunk.punkId,
  seller: hex.encode(listedPunk.owner),
  buyer: hex.encode(buyerPubkey),
  price: listedPunk.listingPrice.toString(),
  vtxoOutpoint: `${newTxid}:0`,
  timestamp: Date.now()
}
await publishPunkEvent(buyEvent, buyerNostrPrivateKey)
```

## 🔧 Technical Details

### Taproot Script Structure

Each punk VTXO uses a Taproot tree with **unspendable internal key**:

```
Taproot Output:
├─ Internal Key: UNSPENDABLE_KEY (0x5092...)
└─ Taproot Tree:
   ├─ Transfer Leaf (owner + server sigs)
   ├─ Buy Leaf (server sig)
   └─ Listing Leaf (owner + server sigs)
```

This ensures **only tapscript paths can spend** the VTXO.

### Security Model

- **Owner Control**: Transfer/listing requires owner's signature
- **Server Co-signature**: Prevents double-spending (Arkade cooperative model)
- **Unilateral Exit**: If server disappears, owner can exit via timelock (TODO)
- **Atomic Swaps**: Buying is atomic - payment and ownership change together

### Metadata Storage

Punk attributes are stored **off-chain** (Nostr + IPFS):

```
On-chain (VTXO):
├─ punkId: sha256(metadata)  ✅ Commitment
├─ owner: pubkey
└─ listingPrice: sats

Off-chain (Nostr):
├─ Full metadata (traits, image)
├─ Ownership history
└─ Sales history
```

### Comparison: Arkade vs Liquid/Simplicity

| Aspect | Liquid (Simplicity) | Arkade |
|--------|---------------------|--------|
| **Output Type** | UTXO | VTXO |
| **Settlement** | Onchain (Liquid) | Offchain → Bitcoin batch |
| **Speed** | ~1 min | Instant |
| **Scalability** | Liquid blocksize | Horizontal (parallel VTXOs) |
| **Coordination** | ? | Nostr events |
| **Security** | Liquid federation | Ark server + Bitcoin finality |

## 🎨 Punk Generation

The collection includes **5 types** with varying rarity:

- **Alien** (1%) - Rarest
- **Ape** (2%)
- **Zombie** (3%)
- **Male** (47%)
- **Female** (47%)

Each punk has 2-5 random attributes from a pool of type-specific traits.

```typescript
import { generatePunkMetadata, calculateRarityScore } from '@/utils/generator'

const punk = generatePunkMetadata()
const score = calculateRarityScore(punk)

console.log(`Generated ${punk.traits.type} punk with rarity score ${score}`)
```

## 📦 Project Structure

```
arkade-punks/
├── src/
│   ├── components/
│   │   ├── PunkCard.vue         # Display a punk NFT
│   │   ├── MintPunk.vue         # Mint new punks
│   │   └── Marketplace.vue      # Browse/buy punks (TODO)
│   ├── types/
│   │   └── punk.ts              # TypeScript types
│   ├── utils/
│   │   ├── punk.ts              # Punk VTXO logic
│   │   ├── taproot.ts           # Taproot utilities
│   │   ├── psbt.ts              # Transaction building
│   │   ├── nostr.ts             # Nostr integration
│   │   └── generator.ts         # Punk metadata generator
│   ├── store/                   # Vuex store (TODO)
│   ├── views/                   # Vue views (TODO)
│   └── main.ts
├── package.json
└── README.md
```

## 🛣️ Roadmap

- [x] Core VTXO tapscript logic
- [x] Punk metadata generation
- [x] Nostr event publishing
- [x] Basic Vue components
- [ ] Vuex store integration
- [ ] Complete UI/UX
- [ ] Marketplace view
- [ ] Collection explorer
- [ ] Rarity ranking
- [ ] Arkade SDK integration
- [ ] Testnet deployment
- [ ] Mainnet launch

## ⚠️ Disclaimer

**This is experimental software.** Arkade Protocol is in active development and not production-ready. Do not use with real funds on mainnet without understanding the risks.

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Arkade Labs](https://arkade.com) - For the amazing Arkade Protocol
- [CryptoPunks](https://cryptopunks.app) - Original NFT inspiration
- [Nostr Protocol](https://nostr.com) - Decentralized coordination layer
- Coinflip game - Reference implementation

## 🔗 Links

- [Arkade Documentation](https://docs.arkadeos.com)
- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [Bitcoin Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)

---

Built with ❤️ on Bitcoin using Arkade Protocol

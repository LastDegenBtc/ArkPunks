# Arkade Punks - Quick Start Guide

Get started with Arkade Punks in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- Basic understanding of Bitcoin and Taproot
- (Optional) Nostr account for publishing events

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/arkade-punks.git
cd arkade-punks

# Install dependencies
npm install

# Start development server
npm run serve
```

Visit `http://localhost:8080` to see the app!

## Project Structure

```
arkade-punks/
├── src/
│   ├── components/       # Vue components
│   │   ├── PunkCard.vue  # Display a punk
│   │   └── MintPunk.vue  # Mint new punks
│   ├── types/
│   │   └── punk.ts       # TypeScript types
│   ├── utils/
│   │   ├── punk.ts       # Core punk logic
│   │   ├── taproot.ts    # Taproot utilities
│   │   ├── nostr.ts      # Nostr integration
│   │   └── generator.ts  # Punk metadata generator
│   └── main.ts
├── README.md             # Project overview
├── ARCHITECTURE.md       # Technical deep dive
├── EXAMPLE.md           # Code examples
└── package.json
```

## Key Concepts

### 1. VTXO = NFT

Each punk is a **VTXO (Virtual Transaction Output)** - think of it as a Bitcoin UTXO that lives offchain until settled.

```typescript
interface PunkVTXO {
  punkId: Bytes        // Unique punk identifier
  owner: Bytes         // Current owner's pubkey
  listingPrice: bigint // 0 = not for sale
  serverPubkey: Bytes  // Arkade server pubkey
}
```

### 2. Taproot Scripts Control Ownership

Each VTXO has **3 spending paths**:
- **Transfer**: Owner gives punk to someone (no payment)
- **Buy**: Anyone buys at listed price
- **List/Delist**: Owner changes the price

### 3. Nostr for Coordination

All punk events are published to **Nostr** (kind 32001):
- Mint events
- Listing events
- Sales
- Transfers

## Quick Examples

### Generate a Punk

```typescript
import { generatePunkMetadata } from '@/utils/generator'

const punk = generatePunkMetadata()
console.log(punk)
// {
//   punkId: "abc123...",
//   name: "Punk #abc123",
//   traits: {
//     type: "Alien",
//     attributes: ["Mohawk", "Glasses"],
//     background: "Purple"
//   },
//   imageUrl: "data:image/svg+xml;base64,..."
// }
```

### Create Punk VTXO

```typescript
import { createPunkVTXO } from '@/utils/punk'
import { hex } from '@scure/base'

const punkVTXO = {
  punkId: hex.decode(punk.punkId),
  owner: myPubkey,
  listingPrice: 0n,
  serverPubkey: arkServerPubkey
}

const { address, tapscripts } = createPunkVTXO(punkVTXO)
console.log('Punk address:', address)
// tark1p...
```

### Mint a Punk

```typescript
import { buildMintTransaction } from '@/utils/punk'

const mintTx = buildMintTransaction(
  punkVTXO,
  myVTXOs,      // Your funding VTXOs
  1000n,        // Punk value (1000 sats)
  changeAddress
)

mintTx.sign(myPrivateKey)
await broadcastToArkade(mintTx)
```

### List for Sale

```typescript
import { buildListingTransaction } from '@/utils/punk'

const listTx = buildListingTransaction(
  currentPunk,
  currentVtxo,
  500_000n  // List for 500k sats
)

listTx.sign(ownerPrivateKey)
await broadcastToArkade(listTx)
```

### Buy a Punk

```typescript
import { buildBuyTransaction } from '@/utils/punk'

const buyTx = buildBuyTransaction(
  listedPunk,
  listedVtxo,
  buyerPubkey,
  paymentVtxos,
  sellerAddress,
  buyerChangeAddress
)

buyTx.sign(buyerPrivateKey)
await broadcastToArkade(buyTx)
```

## Nostr Integration

### Publish an Event

```typescript
import { publishPunkEvent } from '@/utils/nostr'

const mintEvent = {
  type: 'mint',
  punkId: punk.punkId,
  owner: hex.encode(myPubkey),
  metadata: punk,
  vtxoOutpoint: `${txid}:0`,
  timestamp: Date.now()
}

await publishPunkEvent(mintEvent, myNostrPrivateKey)
```

### Subscribe to Events

```typescript
import { subscribeToPunk } from '@/utils/nostr'

const unsubscribe = subscribeToPunk(
  punkId,
  (event) => {
    console.log('New event:', event.type)
  }
)

// Later: cleanup
unsubscribe()
```

### Fetch Punk History

```typescript
import { fetchPunkHistory } from '@/utils/nostr'

const history = await fetchPunkHistory(punkId)
history.forEach(event => {
  console.log(`${event.type} at ${new Date(event.timestamp)}`)
})
```

## Configuration

### Arkade Server

Update the Arkade server URL:

```typescript
// In your config or store
const ARKADE_API = 'https://testnet.arkade.com'
```

### Nostr Relays

Configure Nostr relays:

```typescript
import { DEFAULT_RELAYS } from '@/utils/nostr'

// Or use custom relays
const myRelays = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band'
]
```

## Testing

Currently no automated tests (contributions welcome!).

Manual testing:
1. Generate a punk → Check metadata
2. Create VTXO → Check tapscript addresses
3. Build transactions → Check inputs/outputs
4. Publish to Nostr → Check event structure

## Common Issues

### "Insufficient funds"

You need VTXOs with enough sats. Get some from an Arkade faucet or transfer funds.

### "Failed to publish to Nostr"

Check your Nostr private key and relay connections.

### "Invalid tapscript"

Ensure all pubkeys are 32-byte x-only pubkeys (not 33-byte compressed).

## Next Steps

1. **Read the [ARCHITECTURE.md](ARCHITECTURE.md)** to understand how it works
2. **Check [EXAMPLE.md](EXAMPLE.md)** for complete code examples
3. **Build the UI** - Create Vue components for marketplace, gallery, etc.
4. **Test on testnet** - Mint some punks and try buying/selling
5. **Contribute** - PR improvements, bug fixes, features!

## Resources

- [Arkade Documentation](https://docs.arkadeos.com)
- [Bitcoin Taproot (BIP 341)](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [CryptoPunks](https://cryptopunks.app) - Original inspiration

## Need Help?

- Open an issue on GitHub
- Ask in Arkade Discord
- Check the documentation

Happy punking! 🎨⚡

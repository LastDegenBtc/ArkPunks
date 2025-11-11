# Arkade Punks - Complete Example Flow

This document shows a complete example of the punk lifecycle: mint, list, buy, transfer.

## Setup

```typescript
import { hex } from '@scure/base'
import {
  createPunkVTXO,
  buildMintTransaction,
  buildListingTransaction,
  buildBuyTransaction,
  buildTransferTransaction
} from '@/utils/punk'
import {
  generatePunkMetadata,
  calculateRarityScore
} from '@/utils/generator'
import {
  publishPunkEvent,
  subscribeToPunk,
  fetchPunkHistory
} from '@/utils/nostr'
import { PunkVTXO, MintEvent, ListEvent, BuyEvent } from '@/types/punk'

// User credentials
const alicePrivateKey = hex.decode('...')  // Alice's Bitcoin private key
const alicePubkey = hex.decode('...')      // Alice's x-only pubkey
const aliceNostrKey = '...'                 // Alice's Nostr private key

const bobPrivateKey = hex.decode('...')
const bobPubkey = hex.decode('...')
const bobNostrKey = '...'

const arkServerPubkey = hex.decode('...')  // Arkade server pubkey
```

## Example 1: Alice Mints a Punk

```typescript
// Step 1: Generate punk metadata
console.log('Generating punk metadata...')
const metadata = generatePunkMetadata(`alice-punk-${Date.now()}`)

console.log('Generated punk:', {
  name: metadata.name,
  type: metadata.traits.type,
  attributes: metadata.traits.attributes,
  rarity: calculateRarityScore(metadata)
})

// Step 2: Create punk VTXO configuration
const punkVTXO: PunkVTXO = {
  punkId: hex.decode(metadata.punkId),
  owner: alicePubkey,
  listingPrice: 0n,  // Not for sale initially
  serverPubkey: arkServerPubkey
}

// Step 3: Get Alice's funding VTXOs (from Arkade wallet)
const aliceVTXOs = await fetchMyVTXOs(alicePubkey)

// Select VTXOs with at least 1000 sats
const fundingVTXOs = selectVTXOs(aliceVTXOs, 1000n)

// Step 4: Build mint transaction
console.log('Building mint transaction...')
const mintTx = buildMintTransaction(
  punkVTXO,
  fundingVTXOs,
  1000n,  // Punk intrinsic value
  'tark1...'  // Alice's change address
)

// Step 5: Sign the transaction
console.log('Signing transaction...')
mintTx.sign(alicePrivateKey)

// Step 6: Broadcast to Arkade server
console.log('Broadcasting to Arkade...')
const mintTxId = await broadcastToArkade(mintTx)

console.log('Punk minted! TXID:', mintTxId)

// Step 7: Publish mint event to Nostr
console.log('Publishing to Nostr...')
const mintEvent: MintEvent = {
  type: 'mint',
  punkId: metadata.punkId,
  owner: hex.encode(alicePubkey),
  metadata,
  vtxoOutpoint: `${mintTxId}:0`,
  timestamp: Date.now()
}

await publishPunkEvent(mintEvent, aliceNostrKey)

console.log('Punk successfully minted and published!')
console.log('Punk ID:', metadata.punkId)
console.log('Owner:', hex.encode(alicePubkey))
```

## Example 2: Alice Lists Her Punk for Sale

```typescript
// Step 1: Get current punk VTXO
const currentPunkVtxo = await fetchPunkVTXO(metadata.punkId)

// Step 2: Build listing transaction with new price
console.log('Listing punk for 500,000 sats...')
const listingPrice = 500_000n

const listTx = buildListingTransaction(
  punkVTXO,
  currentPunkVtxo,
  listingPrice
)

// Step 3: Sign with owner's key (Alice)
listTx.sign(alicePrivateKey)

// Step 4: Broadcast
const listTxId = await broadcastToArkade(listTx)

console.log('Punk listed! TXID:', listTxId)

// Step 5: Update punk state
punkVTXO.listingPrice = listingPrice

// Step 6: Publish to Nostr
const listEvent: ListEvent = {
  type: 'list',
  punkId: metadata.punkId,
  owner: hex.encode(alicePubkey),
  listingPrice: listingPrice.toString(),
  signature: hex.encode(signature),
  vtxoOutpoint: `${listTxId}:0`,
  timestamp: Date.now()
}

await publishPunkEvent(listEvent, aliceNostrKey)

console.log('Listing published to Nostr!')
```

## Example 3: Bob Buys Alice's Punk

```typescript
// Step 1: Bob discovers the punk on Nostr
console.log('Bob browsing punks on Nostr...')
const listedPunks = await fetchListedPunks()

console.log(`Found ${listedPunks.length} punks for sale`)

// Step 2: Bob selects Alice's punk
const targetPunk = listedPunks.find(p => p.punkId === metadata.punkId)

console.log('Bob wants to buy:', {
  name: targetPunk.metadata.name,
  price: targetPunk.listingPrice,
  seller: targetPunk.owner
})

// Step 3: Get Bob's VTXOs for payment
const bobVTXOs = await fetchMyVTXOs(bobPubkey)

// Select enough VTXOs to cover the price
const paymentVTXOs = selectVTXOs(bobVTXOs, targetPunk.listingPrice)

// Step 4: Build buy transaction
console.log('Building buy transaction...')
const buyTx = buildBuyTransaction(
  punkVTXO,
  currentPunkVtxo,
  bobPubkey,                // Bob becomes new owner
  paymentVTXOs,
  'tark1...',  // Alice's payment address
  'tark1...'   // Bob's change address
)

// Step 5: Bob signs the transaction
console.log('Bob signing transaction...')
buyTx.sign(bobPrivateKey)

// Step 6: Broadcast
const buyTxId = await broadcastToArkade(buyTx)

console.log('Purchase complete! TXID:', buyTxId)

// Step 7: Update ownership
punkVTXO.owner = bobPubkey
punkVTXO.listingPrice = 0n

// Step 8: Publish to Nostr
const buyEvent: BuyEvent = {
  type: 'buy',
  punkId: metadata.punkId,
  seller: hex.encode(alicePubkey),
  buyer: hex.encode(bobPubkey),
  price: targetPunk.listingPrice.toString(),
  vtxoOutpoint: `${buyTxId}:0`,
  timestamp: Date.now()
}

await publishPunkEvent(buyEvent, bobNostrKey)

console.log('Bob is now the proud owner of the punk!')
console.log('Alice received', targetPunk.listingPrice, 'sats')
```

## Example 4: Bob Transfers Punk to Alice (Gift)

```typescript
// Step 1: Bob decides to gift the punk back to Alice
console.log('Bob transferring punk to Alice...')

const currentVtxo = await fetchPunkVTXO(metadata.punkId)

// Step 2: Build transfer transaction
const transferTx = buildTransferTransaction(
  punkVTXO,
  currentVtxo,
  alicePubkey  // New owner
)

// Step 3: Bob signs
transferTx.sign(bobPrivateKey)

// Step 4: Broadcast
const transferTxId = await broadcastToArkade(transferTx)

console.log('Transfer complete! TXID:', transferTxId)

// Step 5: Update ownership
punkVTXO.owner = alicePubkey

// Step 6: Publish to Nostr
const transferEvent: TransferEvent = {
  type: 'transfer',
  punkId: metadata.punkId,
  fromOwner: hex.encode(bobPubkey),
  toOwner: hex.encode(alicePubkey),
  signature: hex.encode(signature),
  vtxoOutpoint: `${transferTxId}:0`,
  timestamp: Date.now()
}

await publishPunkEvent(transferEvent, bobNostrKey)

console.log('Punk gifted back to Alice!')
```

## Example 5: Tracking Punk History via Nostr

```typescript
// Fetch complete history of a punk
console.log('Fetching punk history from Nostr...')
const history = await fetchPunkHistory(metadata.punkId)

console.log(`Punk ${metadata.name} history:`)
history.forEach((event, i) => {
  console.log(`${i + 1}. ${event.type.toUpperCase()}`)

  switch (event.type) {
    case 'mint':
      console.log(`   Minted by ${event.owner}`)
      console.log(`   Type: ${event.metadata.traits.type}`)
      break

    case 'list':
      console.log(`   Listed for ${event.listingPrice} sats`)
      break

    case 'buy':
      console.log(`   Sold from ${event.seller} to ${event.buyer}`)
      console.log(`   Price: ${event.price} sats`)
      break

    case 'transfer':
      console.log(`   Transferred from ${event.fromOwner} to ${event.toOwner}`)
      break
  }

  console.log(`   Timestamp: ${new Date(event.timestamp).toISOString()}`)
  console.log(`   VTXO: ${event.vtxoOutpoint}\n`)
})
```

## Example 6: Real-time Punk Monitoring

```typescript
// Subscribe to a specific punk's events in real-time
console.log('Subscribing to punk updates...')

const unsubscribe = subscribeToPunk(
  metadata.punkId,
  (event) => {
    console.log(`[${event.type.toUpperCase()}] ${metadata.name}`)

    if (event.type === 'list') {
      console.log(`  Now listed for ${event.listingPrice} sats!`)
      // Could trigger a notification or UI update
    }

    if (event.type === 'buy') {
      console.log(`  SOLD to ${event.buyer} for ${event.price} sats!`)
      // Update marketplace UI
    }
  }
)

// Later: cleanup
// unsubscribe()
```

## Example 7: Building a Collection

```typescript
import { generatePunkCollection } from '@/utils/generator'

// Generate 100 punks
console.log('Generating punk collection...')
const collection = generatePunkCollection(100)

// Mint them all (in batches to avoid overwhelming the server)
const BATCH_SIZE = 10

for (let i = 0; i < collection.length; i += BATCH_SIZE) {
  const batch = collection.slice(i, i + BATCH_SIZE)

  console.log(`Minting batch ${i / BATCH_SIZE + 1}...`)

  await Promise.all(
    batch.map(async (metadata) => {
      const punkVTXO: PunkVTXO = {
        punkId: hex.decode(metadata.punkId),
        owner: alicePubkey,
        listingPrice: 0n,
        serverPubkey: arkServerPubkey
      }

      const tx = buildMintTransaction(punkVTXO, fundingVTXOs, 1000n, changeAddress)
      tx.sign(alicePrivateKey)

      const txId = await broadcastToArkade(tx)

      const mintEvent: MintEvent = {
        type: 'mint',
        punkId: metadata.punkId,
        owner: hex.encode(alicePubkey),
        metadata,
        vtxoOutpoint: `${txId}:0`,
        timestamp: Date.now()
      }

      await publishPunkEvent(mintEvent, aliceNostrKey)

      console.log(`  Minted: ${metadata.name}`)
    })
  )

  // Wait a bit between batches
  await new Promise(resolve => setTimeout(resolve, 2000))
}

console.log('Collection minted!')
```

## Helper Functions (Implementation)

```typescript
// These would be implemented in your store/API layer

async function fetchMyVTXOs(pubkey: Bytes): Promise<VtxoInput[]> {
  // Query Arkade server for user's VTXOs
  const response = await fetch(`${ARKADE_API}/v1/vtxos/${hex.encode(pubkey)}`)
  const data = await response.json()
  return data.spendableVtxos
}

function selectVTXOs(vtxos: VtxoInput[], amount: bigint): VtxoInput[] {
  // Simple coin selection: first-fit
  const selected: VtxoInput[] = []
  let total = 0n

  for (const vtxo of vtxos) {
    selected.push(vtxo)
    total += BigInt(vtxo.vtxo.amount)

    if (total >= amount) break
  }

  if (total < amount) {
    throw new Error('Insufficient funds')
  }

  return selected
}

async function broadcastToArkade(tx: Transaction): Promise<string> {
  // Convert transaction to PSBT and broadcast to Arkade
  const psbt = tx.toPSBT()
  const b64 = base64.encode(psbt)

  const response = await fetch(`${ARKADE_API}/v1/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redeemTx: b64 })
  })

  const data = await response.json()
  return data.txid
}

async function fetchPunkVTXO(punkId: string): Promise<VtxoInput> {
  // Get current VTXO for a punk by querying via Nostr + Arkade
  const history = await fetchPunkHistory(punkId)
  const latestEvent = history[history.length - 1]

  // Parse outpoint
  const [txid, vout] = latestEvent.vtxoOutpoint.split(':')

  // Fetch VTXO data from Arkade
  // ... implementation
}
```

---

This demonstrates the complete lifecycle of an Arkade Punk NFT! 🎨⚡

# Arkade Punks - Technical Architecture

This document provides a deep dive into the technical architecture of Arkade Punks.

## Table of Contents

1. [Overview](#overview)
2. [VTXO-Based NFT Design](#vtxo-based-nft-design)
3. [Taproot Script Details](#taproot-script-details)
4. [Transaction Flows](#transaction-flows)
5. [Nostr Integration](#nostr-integration)
6. [Security Considerations](#security-considerations)
7. [Comparison with Traditional NFTs](#comparison-with-traditional-nfts)

## Overview

Arkade Punks demonstrates how to build a complete NFT collection on Bitcoin using the Arkade Protocol. The key innovation is representing each NFT as a **VTXO (Virtual Transaction Output)** with custom **Taproot spending conditions**.

### Core Concept

```
Traditional NFT:    Smart Contract → tokenId → owner
Arkade Punk NFT:    VTXO → punkId + owner + listingPrice
```

Each punk is a UTXO-like construct (VTXO) that lives offchain in Arkade's virtual mempool, but can be settled onchain at any time to Bitcoin mainnet.

## VTXO-Based NFT Design

### What is a VTXO?

A VTXO (Virtual Transaction Output) is Arkade's abstraction of a Bitcoin UTXO:

- Lives **offchain** in Arkade's virtual mempool
- Has a **taproot address** with custom spending conditions
- Can be **instantly transferred** offchain
- **Settles to Bitcoin** via batch transactions
- Provides **unilateral exit** via presigned Bitcoin transactions

### Punk VTXO Structure

```typescript
interface PunkVTXO {
  punkId: Bytes        // 32 bytes - SHA256 hash of metadata
  owner: Bytes         // 32 bytes - x-only pubkey of owner
  listingPrice: bigint // Price in sats (0 = not listed)
  serverPubkey: Bytes  // 32 bytes - Arkade server pubkey
}
```

### State Machine

A punk VTXO transitions through states via transactions:

```
┌─────────────┐
│   MINTED    │ owner=Alice, price=0
└──────┬──────┘
       │
       ├── LIST ──→ ┌─────────────┐
       │            │   LISTED    │ owner=Alice, price=500k
       │            └──────┬──────┘
       │                   │
       │                   ├── DELIST ──→ MINTED
       │                   │
       │                   └── BUY ──→ ┌─────────────┐
       │                                │    SOLD     │ owner=Bob, price=0
       │                                └──────┬──────┘
       │                                       │
       └── TRANSFER ──────────────────────────┘
```

Each state transition creates a **new VTXO** with updated parameters.

## Taproot Script Details

### Taproot Structure

Every punk VTXO uses Taproot with an **unspendable internal key**:

```
P2TR Output = Taproot(UNSPENDABLE_KEY, MerkleRoot(Leaves))

Where:
- UNSPENDABLE_KEY = 0x5092...c0 (Nothing-Up-My-Sleeve key)
- Leaves = [TransferLeaf, BuyLeaf, ListingLeaf]
```

This ensures funds can **only** be spent via tapscript paths, not via key-path spending.

### Tapscript Leaves

#### 1. Transfer Leaf

Allows the owner to transfer the punk to a new owner (not a sale).

```
Script:
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG

Witness:
  <server_signature>
  <owner_signature>
  <transfer_leaf_script>
  <control_block>

Requirements:
- Owner's signature (proves intent to transfer)
- Server's signature (prevents double-spending)
```

**Spending produces:**
- New punk VTXO with `owner=newOwner, listingPrice=0`

#### 2. Buy Leaf

Allows anyone to buy a listed punk at the specified price.

```
Script:
  <server_pubkey> CHECKSIG

Witness:
  <server_signature>
  <buy_leaf_script>
  <control_block>

Requirements:
- Server's signature (validates purchase)
- Transaction must include payment output to seller

Note: The buyer becomes the new owner by creating a VTXO
      with their pubkey. Payment verification happens at
      the transaction level.
```

**Spending produces:**
- New punk VTXO with `owner=buyer, listingPrice=0`
- Payment output to seller

#### 3. Listing Leaf

Allows the owner to list/delist the punk (change price).

```
Script:
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG

Witness:
  <server_signature>
  <owner_signature>
  <listing_leaf_script>
  <control_block>

Requirements:
- Owner's signature (proves intent to list/delist)
- Server's signature (prevents double-spending)
```

**Spending produces:**
- New punk VTXO with `owner=owner, listingPrice=newPrice`

### Taproot Merkle Tree

The three leaves are arranged in a Merkle tree:

```
        MerkleRoot
       /          \
  Hash(A,B)      Hash(C)
   /    \           |
  A      B          C

A = TransferLeaf
B = BuyLeaf
C = ListingLeaf
```

When spending via leaf A, the witness includes:
- Script A
- Control block (proves A is in the tree)

## Transaction Flows

### 1. Mint Transaction

```
Inputs:
  [User's VTXOs for funding]

Outputs:
  0: Punk VTXO (value: 1000 sats)
     address: tr(UNSPENDABLE_KEY, {TransferLeaf, BuyLeaf, ListingLeaf})
  1: Change VTXO (if any)

Signatures:
  - User signs all inputs
  - Server co-signs (Arkade cooperative path)
```

### 2. List Transaction

```
Inputs:
  0: Current Punk VTXO (via ListingLeaf)

Outputs:
  0: New Punk VTXO (same value, updated price in script commitment)

Witness for Input 0:
  - Owner signature
  - Server signature
  - ListingLeaf script
  - Control block

Result:
  New VTXO with listingPrice = newPrice
```

### 3. Buy Transaction

```
Inputs:
  0: Listed Punk VTXO (via BuyLeaf)
  1-N: Buyer's Payment VTXOs

Outputs:
  0: New Punk VTXO (owner=buyer, price=0)
  1: Payment to Seller (amount=listingPrice)
  2: Change to Buyer (if any)

Witness for Input 0:
  - Server signature
  - BuyLeaf script
  - Control block

Witnesses for Inputs 1-N:
  - Buyer's signatures
  - Server co-signatures

Result:
  - Punk ownership transferred to buyer
  - Seller receives payment
  - Atomic swap (both happen or neither happens)
```

### 4. Transfer Transaction

```
Inputs:
  0: Current Punk VTXO (via TransferLeaf)

Outputs:
  0: New Punk VTXO (owner=recipient, price=0)

Witness for Input 0:
  - Owner signature
  - Server signature
  - TransferLeaf script
  - Control block

Result:
  Punk transferred to new owner (no payment)
```

## Nostr Integration

### Why Nostr?

Nostr provides a **decentralized coordination layer** for:

1. **Discovery**: Browse available punks
2. **Marketplace**: See listings and prices
3. **History**: Track ownership and sales
4. **Real-time updates**: Subscribe to punk events

### Event Structure

All punk actions are published as Nostr events:

```json
{
  "kind": 32001,
  "pubkey": "<user_nostr_pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["p", "mint"],           // Event type tag
    ["punk", "<punk_id>"]    // Punk identifier
  ],
  "content": "{...}",        // JSON event payload
  "id": "<event_id>",
  "sig": "<signature>"
}
```

### Event Types

#### Mint Event (kind: 32001)

```json
{
  "type": "mint",
  "punkId": "abc123...",
  "owner": "npub1...",
  "metadata": {
    "name": "Punk #abc123",
    "traits": {
      "type": "Alien",
      "attributes": ["Mohawk", "Glasses"],
      "background": "Purple"
    },
    "imageUrl": "data:image/svg+xml;base64,..."
  },
  "vtxoOutpoint": "txid:0",
  "timestamp": 1234567890
}
```

#### List Event

```json
{
  "type": "list",
  "punkId": "abc123...",
  "owner": "npub1...",
  "listingPrice": "500000",
  "signature": "...",
  "vtxoOutpoint": "txid:0",
  "timestamp": 1234567890
}
```

#### Buy Event

```json
{
  "type": "buy",
  "punkId": "abc123...",
  "seller": "npub1...",
  "buyer": "npub2...",
  "price": "500000",
  "vtxoOutpoint": "txid:0",
  "timestamp": 1234567890
}
```

### Queries

Fetch all punks:
```javascript
pool.list(relays, [{ kinds: [32001] }])
```

Fetch specific punk history:
```javascript
pool.list(relays, [{ kinds: [32001], '#punk': ['abc123...'] }])
```

Fetch all listings:
```javascript
pool.list(relays, [{ kinds: [32001], '#p': ['list'] }])
```

Subscribe to real-time updates:
```javascript
pool.sub(relays, [{ kinds: [32001], '#punk': ['abc123...'] }])
```

## Security Considerations

### 1. Server Dependency

**Issue**: All transactions require server co-signature.

**Mitigation**:
- Unilateral exit via presigned Bitcoin transactions
- User can always exit to Bitcoin mainnet after timelock
- Multiple Arkade servers can be federated

### 2. Double-Spending

**Issue**: User could try to spend same VTXO twice.

**Mitigation**:
- Server validates and prevents double-spends
- VTXO nonces ensure uniqueness
- Bitcoin finality via batching

### 3. Metadata Integrity

**Issue**: Metadata stored offchain could be tampered.

**Mitigation**:
- `punkId = SHA256(metadata)` commits metadata to VTXO
- Anyone can verify: `sha256(claimed_metadata) == punkId`
- Nostr events provide social consensus on "canonical" metadata

### 4. Frontrunning

**Issue**: Someone could see a buy transaction and try to buy first.

**Mitigation**:
- Arkade processes transactions sequentially (FIFO)
- Server enforces ordering
- Listed punks have deterministic price (no bidding)

### 5. Key Management

**Issue**: Losing private key = losing punk.

**Mitigation**:
- Use hardware wallets
- Multi-sig support (future)
- Social recovery mechanisms (future)

## Comparison with Traditional NFTs

### Ethereum NFTs (ERC-721)

| Aspect | Ethereum | Arkade Punks |
|--------|----------|--------------|
| **Storage** | Contract storage | Off-chain (Nostr + IPFS) |
| **Transfer** | Contract call | VTXO spend |
| **Speed** | ~12 sec | Instant (offchain) |
| **Cost** | $5-50 per transfer | Batched (~$0.10) |
| **Finality** | Ethereum finality | Bitcoin finality |
| **Programmability** | Solidity | Tapscript |
| **Metadata** | Token URI | Nostr events |

### Bitcoin Ordinals

| Aspect | Ordinals | Arkade Punks |
|--------|----------|--------------|
| **Approach** | Inscribe data onchain | VTXO offchain |
| **Transfer** | UTXO spend | VTXO spend |
| **Speed** | ~10 min | Instant |
| **Cost** | $10-100+ | Batched (~$0.10) |
| **Scalability** | Limited | High (offchain) |
| **Data** | Onchain | Offchain (Nostr) |

### Liquid Assets

| Aspect | Liquid | Arkade Punks |
|--------|--------|--------------|
| **Issuance** | Issued Assets | VTXO creation |
| **Transfer** | Liquid tx | VTXO spend |
| **Speed** | ~1 min | Instant |
| **Finality** | Liquid federation | Bitcoin finality |
| **Programmability** | Simplicity (limited) | Tapscript |

## Future Enhancements

### 1. Royalties

Enforce creator royalties via tapscript:

```
BuyLeaf:
  <verify_payment_to_seller>
  <verify_royalty_payment_to_creator>
  <server_pubkey> CHECKSIG
```

### 2. Traits-Based Covenants

Restrict transfers based on traits:

```
TransferLeaf:
  <verify_recipient_holds_complementary_punk>
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG
```

### 3. Fractional Ownership

Multi-sig VTXO for shared ownership:

```
TransferLeaf:
  2 <ownerA> <ownerB> <ownerC> 3 CHECKMULTISIG
  <server_pubkey> CHECKSIG
```

### 4. Time-Locked Features

Unlock traits or abilities over time:

```
UnlockLeaf:
  <locktime> CHECKLOCKTIMEVERIFY DROP
  <owner_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG
```

### 5. Cross-Chain Bridges

Bridge to other chains via atomic swaps:

```
AtomicSwapLeaf:
  <hash> SHA256 <secret_hash> EQUALVERIFY
  <counterparty_pubkey> CHECKSIGVERIFY
  <server_pubkey> CHECKSIG
```

---

This architecture enables a fully functional NFT system on Bitcoin with instant transfers, low costs, and Bitcoin-level security. 🚀

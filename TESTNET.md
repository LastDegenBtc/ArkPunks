# 🧪 Arkade Punks Testnet Guide

This guide shows you how to test Arkade Punks on **Mutinynet**, a Bitcoin signet testnet for Arkade development.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Basic understanding of Bitcoin and Arkade

## Quick Start

### 1. Install Dependencies

```bash
cd arkade-punks
npm install

# Install Arkade SDK (optional for now - mock implementation works)
npm install @arkade-os/sdk
```

### 2. Start the App

```bash
npm run serve
```

Visit `http://localhost:8080`

### 3. Connect Wallet

Click **"Create New Wallet"** to generate a new testnet wallet.

Your wallet details:
- **Network**: Mutinynet (Bitcoin signet)
- **Address prefix**: `tark1p...`
- **Private key**: Saved in browser localStorage (⚠️ not secure!)

### 4. Get Testnet Coins

You need testnet sats to mint punks!

**Mutinynet Faucet**: https://faucet.mutinynet.com

1. Copy your wallet address from the app
2. Paste it into the faucet
3. Request coins (usually 10,000 - 100,000 sats)
4. Wait ~10 seconds for confirmation
5. Click "Refresh Balance" in the app

### 5. Mint Your First Punk!

Once you have funds:

1. Go to the **"Mint"** tab
2. Click **"Generate Random Punk"**
3. Preview your punk
4. Click **"Mint This Punk"**
5. Wait for confirmation

Your punk is now minted on Arkade! 🎉

---

## Configuration

### Network Settings

Edit [src/config/arkade.ts](src/config/arkade.ts) to change networks:

```typescript
// Default: Mutinynet testnet
export const MUTINYNET_CONFIG = {
  network: 'testnet',
  arkServerUrl: 'https://mutinynet.arkade.sh',
  esploraUrl: 'https://mutinynet.com/api',
  bitcoinNetwork: 'mutinynet'
}
```

### Environment Variables

Create `.env` file:

```bash
# Network: testnet, mainnet, or regtest
VITE_ARKADE_NETWORK=testnet

# Optional: Custom Arkade server
VITE_ARKADE_SERVER_URL=https://mutinynet.arkade.sh

# Optional: Custom Esplora API
VITE_ESPLORA_URL=https://mutinynet.com/api
```

---

## Wallet Management

### Create New Wallet

```typescript
import { generateIdentity, saveIdentity, createArkadeWallet } from '@/utils/arkadeWallet'

// Generate new identity
const identity = generateIdentity()

// Save to localStorage (⚠️ not secure!)
saveIdentity(identity)

// Create wallet instance
const wallet = await createArkadeWallet(identity)

console.log('Address:', wallet.address)
```

### Import Existing Wallet

```typescript
import { hex } from '@scure/base'
import { createArkadeWallet } from '@/utils/arkadeWallet'

const privateKeyHex = '...' // Your 64-char hex private key
const privateKey = hex.decode(privateKeyHex)

const { schnorr } = require('@noble/secp256k1')
const publicKey = schnorr.getPublicKey(privateKey)

const wallet = await createArkadeWallet({ privateKey, publicKey })
```

### Check Balance

```typescript
const balance = await wallet.getBalance()

console.log('Available:', balance.available, 'sats')
console.log('Total:', balance.total, 'sats')
```

### Get VTXOs

```typescript
const vtxos = await wallet.getVtxos()

console.log('VTXO count:', vtxos.length)
vtxos.forEach(v => {
  console.log(`VTXO: ${v.vtxo.amount} sats at ${v.vtxo.outpoint.txid}:${v.vtxo.outpoint.vout}`)
})
```

---

## Minting Punks

### Generate Punk Metadata

```typescript
import { generateDeterministicPunk } from '@/utils/deterministicGenerator'

const seed = `user-${Date.now()}`
const { metadata, compressed } = generateDeterministicPunk(seed)

console.log('Punk:', metadata.name)
console.log('Type:', metadata.traits.type)
console.log('Attributes:', metadata.traits.attributes)
console.log('Compressed:', compressed.data) // 6 bytes!
```

### Mint on Testnet

```typescript
import { broadcastPunkMint } from '@/utils/arkadeWallet'
import { hex } from '@scure/base'

// Create punk VTXO
const punkVTXO = {
  punkId: hex.decode(metadata.punkId),
  owner: wallet.pubkey,
  listingPrice: 0n,
  serverPubkey: arkServerPubkey, // Get from config
  compressedData: compressed.data
}

// Mint with 1000 sats value
const txid = await broadcastPunkMint(wallet, punkVTXO, 1000n)

console.log('Minted! TXID:', txid)
```

---

## Testing Scenarios

### Scenario 1: Mint Multiple Punks

```typescript
for (let i = 0; i < 5; i++) {
  const { metadata, compressed } = generateDeterministicPunk(`punk-${i}`)

  const punkVTXO = {
    punkId: hex.decode(metadata.punkId),
    owner: wallet.pubkey,
    listingPrice: 0n,
    serverPubkey: arkServerPubkey,
    compressedData: compressed.data
  }

  const txid = await broadcastPunkMint(wallet, punkVTXO, 1000n)
  console.log(`Punk ${i}: ${txid}`)

  await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1s between mints
}
```

### Scenario 2: List Punk for Sale

```typescript
// TODO: Implement once SDK integration is complete
const listTx = await buildListingTransaction(
  currentPunk,
  currentVtxo,
  500_000n // List for 500k sats
)

await wallet.send(...) // Broadcast transaction
```

### Scenario 3: Buy a Punk

```typescript
// TODO: Implement once SDK integration is complete
const buyTx = await buildBuyTransaction(
  listedPunk,
  listedVtxo,
  wallet.pubkey,
  paymentVtxos,
  sellerAddress,
  wallet.address
)
```

---

## Troubleshooting

### "Insufficient funds"

**Problem**: Not enough sats to mint

**Solution**:
1. Get more sats from faucet: https://faucet.mutinynet.com
2. Check minimum VTXO value (usually 1000 sats)
3. Refresh balance in app

### "Failed to create wallet"

**Problem**: SDK not installed or misconfigured

**Solution**:
```bash
npm install @arkade-os/sdk
```

If using mock implementation, check console for warnings.

### "Transaction failed"

**Problem**: Invalid transaction or server rejection

**Solution**:
1. Check Arkade server status
2. Verify VTXO structure
3. Ensure signatures are correct
4. Check logs for detailed error

### "Can't connect to Arkade server"

**Problem**: Network or server issues

**Solution**:
1. Check internet connection
2. Verify server URL: https://mutinynet.arkade.sh
3. Try alternative server (if available)
4. Check server status at https://status.arkadeos.com (if exists)

---

## Network Parameters

### Mutinynet (Testnet)

| Parameter | Value |
|-----------|-------|
| **Network** | Mutinynet (Bitcoin signet) |
| **Bech32 prefix** | `tark` |
| **Min VTXO value** | 1,000 sats |
| **Dust limit** | 546 sats |
| **Default fee rate** | 1 sat/vB |
| **VTXO expiry** | 1,008 blocks (~1 week) |

### Mainnet (NOT LIVE YET!)

⚠️ **Mainnet is not ready. Use testnet only!**

---

## Useful Links

### Arkade Resources

- **Documentation**: https://docs.arkadeos.com
- **TypeScript SDK**: https://github.com/arkade-os/ts-sdk
- **Server (arkd)**: https://github.com/arkade-os/arkd
- **Wallet**: https://github.com/arkade-os/wallet

### Testnet Resources

- **Mutinynet Faucet**: https://faucet.mutinynet.com
- **Mutinynet Explorer**: https://mutinynet.com
- **Esplora API**: https://mutinynet.com/api

### Bitcoin Resources

- **Taproot (BIP 341)**: https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
- **Schnorr Signatures (BIP 340)**: https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki

---

## Development Workflow

### 1. Development (Mock Mode)

```bash
# Uses mock wallet implementation
# No real Arkade SDK required
npm run serve
```

Good for:
- UI development
- Testing punk generation
- Compression testing

### 2. Testnet (Real Mode)

```bash
# Install SDK
npm install @arkade-os/sdk

# Uncomment real implementation in arkadeWallet.ts
# See TODO comments in createArkadeWallet()

npm run serve
```

Good for:
- Real VTXO testing
- Transaction broadcasting
- Integration testing

### 3. Mainnet (Future)

⚠️ **NOT READY - DO NOT USE!**

---

## Next Steps

1. ✅ Connect wallet to Mutinynet
2. ✅ Get testnet coins
3. ✅ Mint a punk
4. 🔲 Implement listing functionality
5. 🔲 Implement buying functionality
6. 🔲 Add marketplace UI
7. 🔲 Publish to Nostr
8. 🔲 Deploy to production

---

## Security Warnings

### ⚠️ Testnet Only!

This is **testnet software**. Do NOT use with real Bitcoin!

### ⚠️ Private Key Storage

Private keys are stored in **browser localStorage** - this is **NOT SECURE**!

For production:
- Use hardware wallets (Ledger, Trezor)
- Implement proper key derivation (BIP32/39/44)
- Never expose private keys
- Use secure storage (encrypted IndexedDB, etc.)

### ⚠️ No Backup/Recovery

If you lose your private key, you lose your punks!

For production:
- Implement seed phrases (BIP39)
- Add backup mechanisms
- Support wallet recovery

---

## FAQ

### Q: Can I use this on Bitcoin mainnet?

**A**: No! Arkade is still in testing. Use Mutinynet testnet only.

### Q: Are the testnet punks worth anything?

**A**: No, testnet coins have no value. This is for testing only.

### Q: Can I export my punks to Ethereum/Solana?

**A**: No, Arkade Punks are Bitcoin-native. They live on Bitcoin (via Arkade).

### Q: What happens if Arkade shuts down?

**A**: Users can perform "unilateral exit" to recover their funds on Bitcoin mainnet after a timelock period.

### Q: Can I mint the same punk twice?

**A**: No, each punkId is unique (SHA256 hash). Duplicate attempts will be rejected.

---

## Contributing

Found a bug? Want to contribute?

1. Open an issue on GitHub
2. Submit a PR with fixes/features
3. Join Arkade Discord for discussions

---

**Happy testing! 🧪🎨**

Need help? Check the [QUICKSTART.md](QUICKSTART.md) or [ARCHITECTURE.md](ARCHITECTURE.md).

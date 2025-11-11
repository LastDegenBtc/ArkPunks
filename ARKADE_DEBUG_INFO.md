# Debug Info for Arkade Dev

## Issue
`Ramps.onboard()` fails with HTTP 500 on Mutinynet testnet.

## SDK Version
```
@arkade-os/sdk: 0.3.4
```

## Wallet Info

**Boarding Address:**
```
tb1pax4v4aw8dn22uehc7vyq2pc4ck2u82ng7hhm4gza9h99ucd7smeqv7rlx9
```

**Esplora Link:**
https://mutinynet.com/address/tb1pax4v4aw8dn22uehc7vyq2pc4ck2u82ng7hhm4gza9h99ucd7smeqv7rlx9

**Balance Status:**
- `boarding.confirmed`: 9,000 sats ✅
- `boarding.unconfirmed`: 0 sats
- `boarding.total`: 9,000 sats
- `available`: 0 sats ❌

**UTXO Details:**
- Amount: 9,000 sats (confirmed on-chain)
- Funded TXOs: 1
- Spent TXOs: 0
- Status: Confirmed, detected by SDK, but won't settle

## Minimal Reproduction Code

```typescript
import { Wallet, SingleKey, Ramps } from '@arkade-os/sdk'

// Private key (testnet only - safe to share)
const privateKeyHex = '...' // Your actual hex key

// Config
const config = {
  esploraUrl: 'https://mutinynet.com/api',
  arkServerUrl: 'https://mutinynet.arkade.sh',
}

// Create wallet
const identity = SingleKey.fromHex(privateKeyHex)
const wallet = await Wallet.create({
  identity,
  esploraUrl: config.esploraUrl,
  arkServerUrl: config.arkServerUrl,
})

// Check balance - works fine
const balance = await wallet.getBalance()
console.log('Balance:', balance)
// Output: { boarding: { confirmed: 9000, unconfirmed: 0, total: 9000 }, available: 0, ... }

// Try to onboard - FAILS with HTTP 500
const ramps = new Ramps(wallet)
const txid = await ramps.onboard()
// ❌ Error: INTERNAL_ERROR (0): failed to rescan boarding utxos:
//    rpc error: code = Unknown desc = failed to rescan UTXOs: HTTP 500
```

## Error Details

**API Call:**
```
POST https://mutinynet.arkade.sh/v1/batch/registerIntent
Status: 500 Internal Server Error
```

**Full Error:**
```
INTERNAL_ERROR: INTERNAL_ERROR (0): failed to rescan boarding utxos:
rpc error: code = Unknown desc = failed to rescan UTXOs: HTTP 500
```

**Stack:**
```
at maybeArkError (@arkade-os/sdk:9157)
at handleError (@arkade-os/sdk:9637)
at RestArkProvider.registerIntent (@arkade-os/sdk:9279)
at _Wallet.settle (@arkade-os/sdk:11592)
at Ramps.onboard (@arkade-os/sdk:12074)
```

## What Works

✅ Wallet creation
✅ `getBoardingAddress()` - returns correct address
✅ `getBalance()` - detects boarding funds correctly
✅ On-chain transaction confirmed (visible on Esplora)
✅ SDK recognizes `balance.boarding.confirmed = 9000`

## What Fails

❌ `Ramps.onboard()` - HTTP 500 from server
❌ Settlement/finalization - funds stuck in boarding state

## Questions

1. Is this a known server issue on Mutinynet?
2. Is there a batch/round timing we need to wait for?
3. Should we use a different method than `Ramps.onboard()`?
4. Any server-side logs that could help debug?

## Additional Context

Building Arkade Punks (CryptoPunks-style NFTs with 6-byte on-chain compression).
Happy to test fixes or provide more debug info! 🚀

# 🐛 Mutinynet Boarding Issue - HTTP 500

**Date:** 2025-01-09
**Network:** Mutinynet testnet
**SDK:** @arkade-os/sdk v0.3.4

## Problem Summary

Boarding funds (9,000 sats) are detected and confirmed on-chain, but settlement via `Ramps.onboard()` fails with HTTP 500 from Mutinynet server.

## Details

### Wallet Status
- **Boarding address:** `tb1pax4v4aw8dn22uehc7vyq2pc4ck2u82ng7hhm4gza9h99ucd7smeqv7rlx9`
- **Funds sent:** 9,000 sats (confirmed on-chain via Esplora)
- **Balance state:**
  - `boarding.confirmed`: 9,000 sats ✅
  - `available`: 0 sats ❌
  - `total`: 9,000 sats

### Error Details

**API Call:**
```
POST https://mutinynet.arkade.sh/v1/batch/registerIntent
Status: 500 Internal Server Error
```

**Error Message:**
```
INTERNAL_ERROR: failed to rescan boarding utxos:
rpc error: code = Unknown desc = failed to rescan UTXOs: HTTP 500
```

**Stack Trace:**
```javascript
at maybeArkError (@arkade-os_sdk.js:9157:14)
at handleError (@arkade-os_sdk.js:9637:20)
at RestArkProvider.registerIntent (@arkade-os_sdk.js:9279:7)
at async _Wallet.settle (@arkade-os_sdk.js:11592:22)
at async Ramps.onboard (@arkade-os_sdk.js:12074)
```

### Code Used

```typescript
import { Ramps } from '@arkade-os/sdk'

// Inside settle() method
const ramps = new Ramps(wallet)
const onboardTxid = await ramps.onboard()
// ❌ Fails here with HTTP 500
```

### SDK Configuration

```typescript
const wallet = await Wallet.create({
  identity: sdkIdentity,
  esploraUrl: 'https://mutinynet.com/api',
  arkServerUrl: 'https://mutinynet.arkade.sh',
})

const boardingAddress = await wallet.getBoardingAddress()
// Returns: tb1pax4v4aw8dn22uehc7vyq2pc4ck2u82ng7hhm4gza9h99ucd7smeqv7rlx9

const balance = await wallet.getBalance()
// Returns: { boarding: { confirmed: 9000, unconfirmed: 0, total: 9000 }, available: 0 }
```

### Verification

✅ **On-chain transaction confirmed:**
- Explorer: https://mutinynet.com/address/tb1pax4v4aw8dn22uehc7vyq2pc4ck2u82ng7hhm4gza9h99ucd7smeqv7rlx9
- Funded TXOs: 1
- Balance: 9,000 sats

✅ **SDK detects boarding funds:**
- `balance.boarding.confirmed = 9000`

❌ **Settlement fails:**
- Server error when calling `registerIntent`

## Questions

1. Is this a known issue with Mutinynet testnet infrastructure?
2. Does the server need to be restarted or is there a batch timing issue?
3. Should we use a different method than `Ramps.onboard()` for settlement?
4. Is there a way to check server status or batch round timing?

## Workaround Attempted

None successful - error persists on every retry.

## Project Context

Building **Arkade Punks** - CryptoPunks-style NFTs on Arkade with 6-byte on-chain compression.
- Repo: arkade-punks (local development)
- Goal: Test punk minting on testnet once boarding works
- Happy to help test fixes! 🚀

---

**Contact:** Telegram @[votre_username]
**SDK Version:** 0.3.4
**Date:** 2025-01-09

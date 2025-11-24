# VTXO State Inconsistency Bug - Reproduction Script

## Problem Summary

Multiple users experiencing a critical bug where:

1. **Server state**: Reports VTXOs as `VTXO_RECOVERABLE` (rejects send transactions)
2. **SDK state**: Reports `balance.recoverable = 0` (cannot renew or recover)
3. **Result**: Wallet completely stuck - cannot send, cannot renew, cannot recover

## Affected Wallet

**Address**: `ark1qq4hfssprtcgnjzf8qlw2f78yvjau5kldfugg29k34y7j96q2w4t5fckkspk9lpvzkcxy0njwtdwjtjget2fjdcckt8qm7wk6dt7q67mewzspk`

**Problematic VTXOs**:
- VTXO 1: `4a57ce56a6a2c564c346d7179d7486513e84bd97c5424b3e4aab004a285c9d11:0` (20,100 sats, preconfirmed, expired 11/15/2025)
- VTXO 2: `f6c390741a1d71978d4f5124a188244900d2bd287a7744e94ff36c97307860bf:0` (19,900 sats, preconfirmed, expired 11/15/2025)

Both VTXOs:
- ✅ Visible in SDK (`getVtxos()` returns them)
- ✅ Counted in balance (`available: 50200 sats`)
- ❌ Not detected by `renewVtxos()` ("No VTXOs available to renew")
- ❌ Not detected by `recoverVtxos()` ("No recoverable VTXOs found")
- ❌ Block all send operations (server returns VTXO_RECOVERABLE error)

## Reproduction Script

### Usage

```bash
node scripts/test-vtxo-renewal.js <private_key_hex>
```

### What it does

1. Loads wallet from private key
2. Fetches and displays all VTXOs with their states
3. Displays balance (including `recoverable: 0`)
4. Attempts `vtxoManager.renewVtxos()` → **FAILS**
5. Attempts `vtxoManager.recoverVtxos()` → **FAILS**
6. Attempts `wallet.sendBitcoin()` → **FAILS with VTXO_RECOVERABLE error**
7. Confirms the bug

### Expected Output

```
🧪 VTXO Renewal Test Script
================================================================================

📦 Step 1: Loading wallet...
✅ Wallet loaded: ark1qq4hfss...

📊 Step 2: Fetching VTXOs...
   Found 3 VTXOs:
   1. 10200 sats - settled - expiry: 2025-12-24T13:49:07.000Z ✅ OK
   2. 19900 sats - preconfirmed - expiry: 2025-11-15T18:25:38.000Z ⚠️ EXPIRED
   3. 20100 sats - preconfirmed - expiry: 2025-11-15T18:25:38.000Z ⚠️ EXPIRED

💰 Step 3: Checking balance...
   Total: 50200 sats
   Available: 50200 sats
   Settled: 10200 sats
   Preconfirmed: 40000 sats
   Recoverable: 0 sats ⚠️ ZERO (but server may disagree!)

🔄 Step 4: Attempting VTXO renewal...
❌ renewVtxos() FAILED: No VTXOs available to renew

🔄 Step 5: Attempting VTXO recovery (fallback)...
❌ recoverVtxos() FAILED: No recoverable VTXOs found

📤 Step 6: Attempting send (to demonstrate VTXO_RECOVERABLE error)...
❌ Send FAILED: VTXO_RECOVERABLE

🐛 BUG CONFIRMED!
================================================================================
The server reports VTXOs as VTXO_RECOVERABLE (blocks sends)
But the SDK cannot renew or recover them:
  - balance.recoverable = 0
  - renewVtxos() throws "No VTXOs available to renew"
  - recoverVtxos() throws "No recoverable VTXOs found"

This leaves the wallet in an unusable state.
================================================================================
```

## What We've Tried

### 1. Use `renewVtxos()` instead of `recoverVtxos()` ✅ Implemented
As per CEO recommendation - no change in behavior

### 2. Add VtxoManager configuration ✅ Implemented
```javascript
const vtxoManager = new VtxoManager(wallet, {
  enabled: true,
  thresholdPercentage: 10
})
```
No change in behavior

### 3. Call renewal immediately after wallet creation ✅ Implemented
Moved `checkAndRenewVtxos()` to execute BEFORE any `getBalance()` or `getVtxos()` calls
No change in behavior

### 4. Log wallet address to verify correct wallet ✅ Implemented
Confirmed we're using the correct wallet instance
No change in behavior

## Conclusion

**This is a server-side or SDK bug** - the client code is correct.

The server knows these VTXOs are recoverable (rejects sends), but the SDK cannot detect or recover them.

## Private Key for Testing

```
[USER WILL PROVIDE THIS TO CEO]
```

## Contact

For questions or updates, contact the ArkPunks team or reply to the original bug report.

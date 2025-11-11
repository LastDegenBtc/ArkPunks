# ArkPunks Mainnet Deployment Guide

## Overview

This guide covers the complete process for deploying ArkPunks to Bitcoin mainnet using the Arkade Protocol. ArkPunks uses Bitcoin VTXOs (Virtual UTXOs) for on-chain storage and Nostr relays for decentralized supply tracking.

## Architecture

- **Blockchain**: Bitcoin mainnet via Arkade Protocol Layer 2
- **Storage**: 6-byte compressed punk metadata stored in VTXO outputs
- **Registry**: Nostr relays (decentralized event tracking)
- **Wallet**: Arkade wallet (ark1... addresses)
- **Supply Cap**: First 1000 punks are "official" (tracked on relay.damus.io)

### VTXO Refresh Resilience

**Important**: Arkade VTXOs have a limited lifespan (~30 days) and are periodically refreshed during Arkade rounds. Our architecture is designed to handle this:

1. **PunkId as Primary Key** ✓
   - All punk identification uses `punkId` (SHA256 hash of metadata)
   - VTXO outpoint is secondary metadata only
   - Punks survive VTXO refreshes automatically

2. **Immutable Storage** ✓
   - Nostr events (KIND 1337) store punk data permanently
   - 6-byte compressed metadata in Nostr (immutable)
   - PunkId never changes even if VTXO changes

3. **Recovery Mechanism** ✓
   - "🔄 Refresh" button syncs from Nostr by punkId
   - Works even if all VTXOs have been refreshed
   - No user action required during normal VTXO refresh

## Prerequisites

### 1. Arkade Wallet Setup

Users need an Arkade wallet with mainnet configuration:

```typescript
// Mainnet configuration
const ARKADE_CONFIG = {
  network: 'mainnet',
  aspUrl: 'https://asp.arkade.network', // Official Arkade ASP
  explorerUrl: 'https://explorer.arkade.network'
}
```

**User requirements:**
- Arkade wallet private key (64 hex characters)
- Sufficient BTC balance for:
  - Punk minting: ~10,000 sats per punk
  - Marketplace fees: 1% per transaction
  - Transfer fees: ~1,000 sats minimum

### 2. Nostr Configuration

The application uses Nostr for decentralized supply tracking:

**Official Relay (Authority)**: `wss://relay.damus.io`
- First 1000 punks minted here are "official"
- Supply cap enforced by checking this relay first

**Backup Relays**:
- `wss://nos.lol`
- `wss://nostr.wine`
- `wss://relay.snort.social`

Users need:
- Nostr private key (for signing mint/transfer events)
- Same key used as Arkade wallet key (for simplicity)

## Configuration Changes

### 1. Update Network Configuration

In `src/config/arkade.ts`:

```typescript
export const PUNK_SUPPLY_CONFIG = {
  MAX_TOTAL_PUNKS: 1000,
  MAX_PUNKS_PER_WALLET: 10,
  OFFICIAL_RELAY: 'wss://relay.damus.io'
}

export const ARKADE_NETWORK = {
  network: 'mainnet',
  aspUrl: 'https://asp.arkade.network',
  explorerUrl: 'https://explorer.arkade.network'
}
```

### 2. Verify Nostr Relays

In `src/utils/nostrRegistry.ts`, ensure relays are production-ready:

```typescript
const RELAYS = [
  'wss://relay.damus.io',        // Official authority relay
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.snort.social'
]
```

### 3. Update Marketplace Fee (Optional)

In `src/components/Marketplace.vue`, the marketplace fee is set to 1%:

```typescript
const MARKETPLACE_FEE_PERCENT = 1  // 1% fee
```

Adjust if needed for mainnet economics.

## Security Considerations

### 1. Private Key Storage

**Current implementation**: LocalStorage
- Keys stored as: `localStorage.getItem('arkade_wallet_private_key')`
- **WARNING**: LocalStorage is vulnerable to XSS attacks

**Mainnet recommendations**:
1. Add encryption layer for stored keys
2. Consider hardware wallet integration
3. Implement key export/backup functionality
4. Add warning about key security on wallet creation

### 2. Transaction Validation

All transactions should validate:
- Recipient address format (ark1...)
- Sufficient balance before sending
- Punk ownership before transfers
- Supply cap before minting

### 3. Nostr Event Validation

Events must include proper tags:
- `punk_id`: Unique identifier
- `owner`: Nostr pubkey
- `vtxo`: VTXO outpoint
- `data`: 6-byte compressed metadata

## Deployment Steps

### Step 1: Build for Production

```bash
npm run build
```

This creates optimized production build in `dist/` directory.

### Step 2: Environment Variables

Create `.env.production`:

```env
VITE_ARKADE_NETWORK=mainnet
VITE_ASP_URL=https://asp.arkade.network
VITE_EXPLORER_URL=https://explorer.arkade.network
VITE_OFFICIAL_RELAY=wss://relay.damus.io
```

### Step 3: Deploy Static Files

Upload `dist/` contents to hosting provider:

**Recommended hosts**:
- Vercel (with custom domain)
- Netlify
- GitHub Pages
- IPFS (for full decentralization)

**Configuration example (Vercel)**:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vue"
}
```

### Step 4: Configure Domain

Point your domain to deployment:
- Add DNS records (A/CNAME)
- Enable HTTPS (SSL certificate)
- Configure CSP headers for security

### Step 5: Initialize Official Registry

Publish the "Genesis Event" to Nostr announcing the ArkPunks launch:

```typescript
// Genesis event (kind 30333 - replaceable)
{
  kind: 30333,
  tags: [
    ['t', 'arkade-punk-genesis'],
    ['d', 'arkade-punks-v1'],
    ['max_supply', '1000'],
    ['official_relay', 'wss://relay.damus.io'],
    ['launch_date', '2025-01-10']
  ],
  content: 'ArkPunks - 1000 unique Bitcoin punks on Arkade Protocol'
}
```

## Post-Deployment Validation

### 1. Test Wallet Connection

- [ ] Connect Arkade wallet with mainnet config
- [ ] Verify balance shows correctly
- [ ] Check ark1... address format

### 2. Test Punk Minting

- [ ] Mint first test punk
- [ ] Verify VTXO creation on Arkade explorer
- [ ] Check punk appears in Nostr relay
- [ ] Confirm 6-byte compressed data format
- [ ] Validate punk shows in gallery

### 3. Test Marketplace

- [ ] List punk for sale
- [ ] Verify listing appears on Nostr
- [ ] Test purchase flow
- [ ] Confirm ownership transfer
- [ ] Validate 1% fee calculation

### 4. Test Direct Transfer

- [ ] Transfer punk to another wallet
- [ ] Verify transfer event on Nostr
- [ ] Confirm recipient can recover punk
- [ ] Check punk removed from sender

### 5. Test Supply Cap

- [ ] Attempt to mint beyond 1000 limit
- [ ] Verify rejection from Nostr registry
- [ ] Confirm official badge only on first 1000

### 6. **CRITICAL: Test VTXO Refresh Resilience**

This is critical to verify punks survive Arkade's periodic VTXO refreshes:

- [ ] Mint a test punk and note its `punkId` and `vtxoOutpoint`
- [ ] Wait for an Arkade round refresh (or trigger manually in testnet)
- [ ] Verify the VTXO outpoint has changed in wallet
- [ ] Click "🔄 Refresh" button in punk gallery
- [ ] **Verify punk still appears with same punkId**
- [ ] Check Nostr event still intact (KIND 1337)
- [ ] Confirm all punk metadata unchanged (type, attributes, image)
- [ ] Test marketplace listing/delisting still works
- [ ] Test direct transfer still works

**Expected Behavior**:
- PunkId remains identical ✓
- Metadata intact ✓
- Image unchanged ✓
- Only `vtxoOutpoint` field may show new value
- All functionality continues working

**If this fails**: The punk recovery mechanism needs adjustment

## Monitoring

### Nostr Events to Monitor

Query these event kinds regularly:

```typescript
// Mints (kind 1337)
pool.querySync(RELAYS, {
  kinds: [1337],
  '#t': ['arkade-punk'],
  limit: 1000
})

// Listings (kind 1338)
pool.querySync(RELAYS, {
  kinds: [1338],
  '#t': ['arkade-punk-listing'],
  limit: 100
})

// Sales (kind 1339)
pool.querySync(RELAYS, {
  kinds: [1339],
  '#t': ['arkade-punk-sold'],
  limit: 100
})

// Transfers (kind 1340)
pool.querySync(RELAYS, {
  kinds: [1340],
  '#t': ['arkade-punk-transfer'],
  limit: 100
})
```

### Key Metrics

1. **Supply tracking**:
   - Total punks minted: `SELECT COUNT(*) FROM events WHERE kind = 1337`
   - Official punks: First 1000 on relay.damus.io
   - Remaining supply: 1000 - total minted

2. **Marketplace activity**:
   - Active listings count
   - Sales volume (total sats traded)
   - Average sale price
   - Marketplace fees collected

3. **User engagement**:
   - Unique wallet addresses
   - Punks per wallet distribution
   - Transfer activity
   - Most traded punks

## Maintenance

### Regular Tasks

1. **Weekly**:
   - Monitor Nostr relay health
   - Check for duplicate punk IDs
   - Verify supply cap enforcement
   - Review marketplace activity

2. **Monthly**:
   - Update relay list if needed
   - Review security logs
   - Backup important events
   - Update documentation

### Emergency Procedures

**If official relay goes down**:
1. Fallback to backup relays (nos.lol, nostr.wine)
2. Update `RELAYS` array priority
3. Announce relay change via Nostr event

**If supply cap is breached**:
1. Query all mints from official relay
2. Verify timestamps of first 1000
3. Publish correction event if needed
4. Update UI to show correct official status

**If duplicate punks detected**:
1. Check timestamps - earliest mint wins
2. Publish resolution event
3. Update affected users' galleries

## Troubleshooting

### Issue: Punks not appearing after mint

**Causes**:
- Nostr relay sync delay
- LocalStorage corruption
- Event signing failure

**Solutions**:
1. Click "🔄 Refresh from Nostr" button
2. Check browser console for errors
3. Verify Nostr event was published
4. Check VTXO on Arkade explorer

### Issue: Cannot buy from marketplace

**Causes**:
- Insufficient balance
- Punk already sold
- Network connection issues

**Solutions**:
1. Check wallet balance
2. Refresh marketplace listings
3. Verify punk ownership on Nostr
4. Check Arkade ASP connection

### Issue: Transfer fails

**Causes**:
- Invalid recipient address
- Invalid Nostr pubkey
- Insufficient balance for fees

**Solutions**:
1. Verify ark1... address format
2. Confirm 64-character hex pubkey
3. Check balance > 1000 sats
4. Ensure punk not listed on marketplace

### Issue: Punks missing after VTXO refresh

**Symptoms**:
- Gallery appears empty after Arkade round
- Punks were visible before
- Wallet balance unchanged

**Root Cause**: VTXO outpoints changed during Arkade refresh

**Solutions**:
1. Click "🔄 Refresh from Nostr" button
   - This syncs all punks by punkId (not VTXO)
   - Works even if all VTXOs refreshed

2. Check Nostr events manually:
   ```bash
   # Query for your punks
   # Your punks are in KIND 1337 events
   # Tagged with your Nostr pubkey
   ```

3. Verify localStorage:
   ```javascript
   // In browser console
   JSON.parse(localStorage.getItem('arkade_punks'))
   ```

4. If punks still missing:
   - Check Nostr relay health
   - Verify your Nostr private key hasn't changed
   - Contact support with your Nostr pubkey

**Prevention**:
- Regularly click "🔄 Refresh" to keep local state synced
- Nostr is source of truth, not localStorage
- PunkId in Nostr events is permanent

## Smart Contract Considerations

ArkPunks does NOT use smart contracts. All logic is:
- **Client-side**: Vue.js application
- **Storage**: Bitcoin VTXOs (6 bytes compressed)
- **Registry**: Nostr events (decentralized)

**Benefits**:
- No contract deployment needed
- No gas fees (only Bitcoin network fees)
- Fully decentralized
- Censorship resistant

**Limitations**:
- Trust in Nostr relay operators
- Client-side validation only
- No automatic royalties enforcement

## Legal Considerations

Before mainnet launch:

1. **Intellectual Property**:
   - Verify punk generation algorithm is original
   - Check CryptoPunks trademark status
   - Consider using "ArkPunks" branding exclusively

2. **Terms of Service**:
   - Disclaim liability for lost keys
   - State non-custodial nature
   - Define marketplace fee structure

3. **Privacy**:
   - Nostr pubkeys are public
   - Bitcoin addresses are pseudonymous
   - No KYC/AML for peer-to-peer transfers

4. **Jurisdictions**:
   - Research NFT regulations in target markets
   - Consider tax implications for users
   - Ensure compliance with securities laws

## Launch Checklist

- [ ] Code reviewed and audited
- [ ] Mainnet configuration verified
- [ ] Nostr relays tested and stable
- [ ] Security measures implemented
- [ ] Documentation complete
- [ ] Legal terms prepared
- [ ] Domain and hosting configured
- [ ] SSL certificate active
- [ ] Genesis event prepared
- [ ] Test mints on mainnet successful
- [ ] Monitoring tools configured
- [ ] Emergency procedures documented
- [ ] Community announcement ready
- [ ] Support channels established

## Support Resources

- **Arkade Protocol**: https://arkade.network
- **Nostr Documentation**: https://github.com/nostr-protocol/nostr
- **Bitcoin Development**: https://bitcoin.org/en/developer-documentation
- **Vue.js**: https://vuejs.org/guide/
- **Community**: Create Discord/Telegram for ArkPunks

## Future Enhancements

Potential improvements for post-launch:

1. **Wallet Integration**:
   - Hardware wallet support (Ledger, Trezor)
   - WalletConnect integration
   - Multi-signature support

2. **Features**:
   - Punk rarity scoring
   - Advanced marketplace filters
   - Bulk operations
   - Punk collections/sets
   - Social features (comments, likes)

3. **Scaling**:
   - IPFS metadata storage
   - Indexer service for fast queries
   - GraphQL API for external apps
   - Mobile app (iOS/Android)

4. **Monetization**:
   - Marketplace fee revenue
   - Premium features
   - Artist collaborations
   - Branded punks

---

**Last Updated**: 2025-01-10
**Version**: 1.0
**Network**: Bitcoin Mainnet via Arkade Protocol
**Supply**: 1000 Official ArkPunks

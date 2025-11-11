# 🚀 Getting Started with Arkade Punks on Testnet

**Welcome!** This guide will get you up and running with Arkade Punks on Mutinynet testnet in under 10 minutes.

---

## 📋 What You'll Need

- **Node.js 18+** installed
- **Web browser** (Chrome, Firefox, Brave, etc.)
- **5-10 minutes** of your time

---

## ⚡ Quick Start (3 Steps)

### Step 1: Install & Run

```bash
# Clone or navigate to project
cd arkade-punks

# Install dependencies
npm install

# Start the development server
npm run serve
```

Open **http://localhost:8080** in your browser.

### Step 2: Create Wallet

1. Click **"Create New Wallet"**
2. Copy your wallet address (starts with `tark1p...`)
3. ⚠️ **Save your private key** (it's in browser localStorage - check DevTools)

### Step 3: Get Testnet Coins

1. Go to **https://faucet.mutinynet.com**
2. Paste your wallet address
3. Request coins (you'll get 10,000-100,000 testnet sats)
4. Wait ~10 seconds
5. Click **"Refresh Balance"** in the app

**Done! You're ready to mint punks!** 🎉

---

## 🎨 Mint Your First Punk

1. Go to the **"Mint"** tab
2. Click **"Generate Random Punk"**
3. Check out the preview:
   - Type (Alien, Ape, Zombie, Male, Female)
   - Attributes (Mohawk, Glasses, etc.)
   - Rarity score
4. Click **"Mint This Punk"**
5. Wait for confirmation

**Your punk is now on Arkade Mutinynet testnet!** 🚀

---

## 🔍 What Just Happened?

### Behind the Scenes

When you minted a punk:

1. **Metadata generated** (type, attributes, background)
2. **Compressed to 6 bytes** using bitmap encoding
3. **VTXO created** on Arkade with Taproot scripts
4. **Transaction broadcast** to Mutinynet
5. **Punk stored on-chain** with all metadata in just 6 bytes!

### The Compression Magic

```
Original JSON:  ~500 bytes
Compressed:     6 bytes
Ratio:          83x smaller! 🚀

Your punk metadata lives on Bitcoin forever,
in just 6 bytes!
```

---

## 📚 Next Steps

### Learn More

- **[TESTNET.md](TESTNET.md)** - Full testnet guide
- **[ONCHAIN_COMPRESSION.md](ONCHAIN_COMPRESSION.md)** - How compression works
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Technical deep dive
- **[COMPRESSION_VISUAL.md](COMPRESSION_VISUAL.md)** - Visual diagrams

### Try the Demos

```bash
# Run compression demo
npm run demo

# Run compression tests
npm run test:compression
```

### Build Features

- [ ] Implement listing (sell punks)
- [ ] Implement buying (purchase from others)
- [ ] Add marketplace UI
- [ ] Publish events to Nostr
- [ ] Add collection explorer

---

## 🛠️ Development Mode

### Mock Wallet (Default)

By default, the app uses a **mock wallet** that simulates Arkade functionality without requiring the full SDK.

**Good for:**
- UI development
- Testing punk generation
- Learning the flow

**Limitations:**
- No real transactions
- No actual blockchain interaction
- Balance/VTXOs are simulated

### Real Wallet (Advanced)

To use the **real Arkade SDK**:

```bash
# Install SDK
npm install @arkade-os/sdk

# Edit src/utils/arkadeWallet.ts
# Uncomment the real implementation (see TODO comments)

# Restart server
npm run serve
```

**Good for:**
- Real testnet transactions
- Full VTXO management
- Integration testing

---

## ⚙️ Configuration

### Network Settings

Edit [src/config/arkade.ts](src/config/arkade.ts):

```typescript
export const MUTINYNET_CONFIG = {
  network: 'testnet',
  arkServerUrl: 'https://mutinynet.arkade.sh',
  esploraUrl: 'https://mutinynet.com/api',
  bitcoinNetwork: 'mutinynet'
}
```

### Environment Variables

Create `.env`:

```bash
VITE_ARKADE_NETWORK=testnet
```

---

## 🧪 Testing

### Compression Tests

```bash
npm run test:compression
```

Expected output:
```
✅ Compress and decompress punk metadata
✅ Compressed data is exactly 6 bytes
✅ Same seed produces same punk
✅ Different seeds produce different punks
✅ Verify punk integrity
...
🎉 All tests passed!
```

### Compression Demo

```bash
npm run demo
```

Shows:
- Punk generation
- Compression stats
- Cost savings
- Reconstruction

---

## 🔗 Useful Links

### Arkade Resources

- **Docs**: https://docs.arkadeos.com
- **SDK**: https://github.com/arkade-os/ts-sdk
- **Server**: https://github.com/arkade-os/arkd

### Testnet Resources

- **Faucet**: https://faucet.mutinynet.com
- **Explorer**: https://mutinynet.com
- **API**: https://mutinynet.com/api

---

## ❓ Common Questions

### Q: Is this real Bitcoin?

**A:** It's Bitcoin **testnet** (Mutinynet signet). Testnet coins have no value - they're for testing only!

### Q: Can I use this on mainnet?

**A:** Not yet! Arkade is still in development. Testnet only for now.

### Q: What if I lose my private key?

**A:** You'll lose access to your punks! For testnet, just create a new wallet. For mainnet (future), always backup your keys!

### Q: Why only 6 bytes?

**A:** We use bitmap encoding to compress punk traits:
- **Byte 0**: Type + Background
- **Bytes 1-4**: Attribute bitmap (32 bits)
- **Byte 5**: Attribute count

This is **83x smaller** than JSON while being fully reconstructable!

### Q: Can I sell my punk?

**A:** Not yet implemented, but the architecture supports it! The buy/sell functions exist in the code - we just need to wire them up.

---

## 🐛 Troubleshooting

### "Insufficient funds"

→ Get more sats from faucet: https://faucet.mutinynet.com

### "Failed to create wallet"

→ Check console for errors
→ Clear localStorage and try again

### "Transaction failed"

→ Check Arkade server status
→ Verify you have enough balance
→ Try refreshing the page

### "Can't connect to server"

→ Check internet connection
→ Verify server URL in config
→ Server might be down (check status)

---

## 🎯 What's Next?

### Immediate (You can help!)

- [ ] Wire up real Arkade SDK
- [ ] Implement list/buy functions
- [ ] Add marketplace UI
- [ ] Nostr event publishing
- [ ] Better error handling

### Medium Term

- [ ] Mobile-responsive design
- [ ] Wallet backup/recovery
- [ ] Advanced filtering/search
- [ ] Rarity ranking
- [ ] Collection stats

### Long Term

- [ ] Mainnet support
- [ ] Multi-sig wallets
- [ ] Royalties system
- [ ] Fractional ownership
- [ ] Cross-chain bridges

---

## 🤝 Contributing

Want to contribute?

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a PR!

**Areas that need help:**
- SDK integration (wire up real Arkade functions)
- UI/UX improvements
- Testing
- Documentation
- Bug fixes

---

## 📄 License

MIT License - See [LICENSE](LICENSE)

---

## 🙏 Credits

**Inspired by:**
- Original CryptoPunks (Larva Labs)
- Bitcoin Ordinals
- Arkade Protocol

**Built with:**
- Bitcoin + Taproot
- Arkade Protocol
- Vue.js
- TypeScript
- Love ❤️

---

**Ready to build the future of Bitcoin NFTs?** 🚀

Start here: **http://localhost:8080**

Questions? Check [TESTNET.md](TESTNET.md) or [ARCHITECTURE.md](ARCHITECTURE.md).

**Happy minting! 🎨⚡**

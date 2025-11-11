# 🚀 Run the Compression Demo

## Quick Start

```bash
# Install dependencies
npm install

# Add tsx for running TypeScript
npm install -D tsx

# Run the compression demo
npx tsx demo-compression.ts
```

## What You'll See

The demo will show you:

1. **Punk generation** - Creating a deterministic punk from a seed
2. **Compression** - How 500+ bytes becomes just 6 bytes
3. **Statistics** - Compression ratio, cost savings, etc.
4. **Verification** - Proving integrity of compressed data
5. **Reconstruction** - Rebuilding metadata from 6 bytes
6. **Different types** - Alien, Ape, Zombie, Male, Female

## Expected Output

```
🎨 Arkade Punks - On-Chain Compression Demo

============================================================

1️⃣  Generating deterministic punk from seed...

📊 Punk Metadata:
   Punk ID: a1b2c3d4e5f6...
   Name: Punk #a1b2c3d4
   Type: Alien
   Attributes: Alien Cap, Laser Eyes, UFO
   Background: Purple

2️⃣  Compressed on-chain data:
   Hex: 6c0700000003
   Bytes: 6
   Binary: 01101100 00000111 00000000 00000000 00000000 00000011

3️⃣  Compression statistics:
   Original JSON size: 487 bytes
   Compressed size: 6 bytes
   Compression ratio: 81.2x
   Savings: 98.8%

...
```

## Try It Yourself

Edit the `seed` variable in [demo-compression.ts](demo-compression.ts):

```typescript
const seed = 'your-custom-seed-here'
```

Each seed generates a unique, deterministic punk!

## Next Steps

- Read [ONCHAIN_COMPRESSION.md](ONCHAIN_COMPRESSION.md) for technical details
- See [EXAMPLE.md](EXAMPLE.md) for integration examples
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for the full design

---

**Questions?** Open an issue or read the docs!

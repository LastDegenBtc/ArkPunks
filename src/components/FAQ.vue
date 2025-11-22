<template>
  <div class="faq-container">
    <h2>Frequently Asked Questions</h2>

    <div class="faq-categories">
      <!-- Getting Started -->
      <div class="faq-category">
        <h3>🚀 Getting Started</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-is-arkpunks')">
            <span>What is ArkPunks?</span>
            <span class="faq-icon">{{ isOpen('what-is-arkpunks') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-is-arkpunks')" class="faq-answer">
            <p>ArkPunks is a CryptoPunks-style NFT collection built on Bitcoin using the Arkade Protocol. Each punk is a unique 24x24 pixel character generated from your Bitcoin transaction data and stored as an off-chain asset on Arkade's Layer 2.</p>
            <p>Unlike traditional NFTs, ArkPunks are native to Arkade's off-chain environment, allowing for instant, fee-less trading while maintaining Bitcoin's security through the Arkade Protocol.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-create-wallet')">
            <span>How do I create a wallet?</span>
            <span class="faq-icon">{{ isOpen('how-create-wallet') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-create-wallet')" class="faq-answer">
            <p>Click the "Create New Wallet" button on the wallet section. This generates a new Bitcoin keypair that controls both your Bitcoin funds and your Nostr identity (used for punk ownership).</p>
            <p><strong>Important:</strong> Make sure to export your wallet using the "💾 Export Wallet" button and keep the JSON file safe. This is your only backup!</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-fund-wallet')">
            <span>How do I fund my wallet?</span>
            <span class="faq-icon">{{ isOpen('how-fund-wallet') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-fund-wallet')" class="faq-answer">
            <p>You can fund your wallet through on-chain boarding:</p>
            <ol>
              <li>Copy your boarding address (bc1p... address) from the wallet section</li>
              <li>Send Bitcoin to this address from any Bitcoin wallet</li>
              <li>Wait for on-chain confirmation (~10 minutes)</li>
              <li>Your funds will appear as "Boarding Balance"</li>
              <li>Click "Refresh" to check for incoming funds</li>
            </ol>
            <p>Minimum amount: 10,000 sats (0.0001 BTC)</p>
          </div>
        </div>
      </div>

      <!-- Minting & Collecting -->
      <div class="faq-category">
        <h3>🎨 Minting & Collecting</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-mint')">
            <span>How do I mint a punk?</span>
            <span class="faq-icon">{{ isOpen('how-mint') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-mint')" class="faq-answer">
            <p>Go to the "Mint" tab and click "Mint New Punk". Each mint costs 10,000 sats (0.0001 BTC).</p>
            <p>Your punk's appearance is deterministically generated from the Bitcoin transaction data (VTXO outpoint), making each one unique and verifiable.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-official')">
            <span>What does the green check ✓ mean?</span>
            <span class="faq-icon">{{ isOpen('what-official') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-official')" class="faq-answer">
            <p>The green check mark ✓ indicates <strong>Official ArkPunks</strong> - the first 1,000 punks published to the relay.damus.io Nostr relay by the project creator (PPRGB20).</p>
            <p>These verified punks are numbered #0 to #999 (you can see the number next to their type) and are considered the "genesis collection". They may have special significance for collectors.</p>
            <p>All punks after #999 are still valid ArkPunks with the same functionality, but won't have the verification badge.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('punk-traits')">
            <span>How are punk traits generated?</span>
            <span class="faq-icon">{{ isOpen('punk-traits') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('punk-traits')" class="faq-answer">
            <p>Each punk's appearance is deterministically generated from its VTXO outpoint (Bitcoin transaction data). The generation process includes:</p>
            <ul>
              <li><strong>Skin tone:</strong> 6 options (Light, Medium, Dark, Alien, Zombie, Ape)</li>
              <li><strong>Hair:</strong> Various styles and colors</li>
              <li><strong>Eyes:</strong> Different eye types</li>
              <li><strong>Accessories:</strong> Hats, glasses, pipes, earrings, etc.</li>
            </ul>
            <p>Rarer traits like Alien and Zombie skins have lower probability, making them more valuable to collectors.</p>
          </div>
        </div>
      </div>

      <!-- Marketplace -->
      <div class="faq-category">
        <h3>🛒 Marketplace</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-sell')">
            <span>How do I sell a punk?</span>
            <span class="faq-icon">{{ isOpen('how-sell') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-sell')" class="faq-answer">
            <p>In the Gallery tab, click on one of your punks and click "List for Sale". Set your desired price in sats and confirm.</p>
            <p>Your punk will appear in the Marketplace immediately. You can delist it at any time from the Gallery.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('marketplace-fees')">
            <span>What are the marketplace fees?</span>
            <span class="faq-icon">{{ isOpen('marketplace-fees') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('marketplace-fees')" class="faq-answer">
            <p>ArkPunks charges a <strong>1% marketplace fee</strong> on all sales.</p>
            <p>For example:</p>
            <ul>
              <li>Punk listed at 100,000 sats</li>
              <li>Marketplace fee: 1,000 sats (1%)</li>
              <li>Buyer pays: 101,000 sats total</li>
              <li>Seller receives: 100,000 sats</li>
            </ul>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-buy')">
            <span>How do I buy a punk?</span>
            <span class="faq-icon">{{ isOpen('how-buy') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-buy')" class="faq-answer">
            <p>Go to the Marketplace tab, browse the available punks, and click "Buy" on the one you want. The transaction is instant and fee-less on Arkade!</p>
            <p>After purchase, the punk will appear in your Gallery immediately.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-escrow')">
            <span>What is the Escrow system?</span>
            <span class="faq-icon">{{ isOpen('what-escrow') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-escrow')" class="faq-answer">
            <p>ArkPunks uses an <strong>OpenSea-style escrow marketplace</strong> to ensure secure trading with zero risk for both buyers and sellers.</p>
            <p><strong>How it works:</strong></p>
            <ol>
              <li><strong>Seller lists punk:</strong> The punk is transferred to the escrow wallet and marked as "For Sale"</li>
              <li><strong>Buyer sends payment:</strong> Buyer pays the asking price + 1% fee to the escrow wallet</li>
              <li><strong>Atomic swap:</strong> The escrow automatically transfers the punk to the buyer via Nostr and sends payment to the seller</li>
            </ol>
            <p><strong>Key benefits:</strong></p>
            <ul>
              <li><strong>Zero risk:</strong> Funds never go directly between buyer and seller</li>
              <li><strong>Automated:</strong> Swap executes automatically when both deposits are confirmed</li>
              <li><strong>Fast:</strong> Typically completes in 2-3 seconds</li>
              <li><strong>Secure:</strong> Punk ownership transferred via signed Nostr events</li>
            </ul>
            <p>The escrow wallet is controlled by a server-side private key and operates on Bitcoin mainnet using the Arkade Protocol.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-htlc')">
            <span>What about P2P trading? (Coming Soon)</span>
            <span class="faq-icon">{{ isOpen('what-htlc') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-htlc')" class="faq-answer">
            <p><strong>🚀 Coming soon:</strong> Peer-to-peer trading using Hash Time-Locked Contracts (HTLCs)!</p>
            <p><strong>HTLC advantages over escrow:</strong></p>
            <ul>
              <li><strong>Fully trustless:</strong> No escrow wallet needed, completely peer-to-peer</li>
              <li><strong>Atomic swaps:</strong> Trade punks for Bitcoin with cryptographic guarantees</li>
              <li><strong>No intermediary:</strong> Direct wallet-to-wallet trading</li>
              <li><strong>Smart contract security:</strong> Either both parties get their assets, or both get refunded</li>
            </ul>
            <p><strong>How HTLCs work:</strong></p>
            <ol>
              <li>Buyer and seller agree on a price</li>
              <li>Both parties create time-locked contracts with a shared secret hash</li>
              <li>Once the secret is revealed, both transfers execute atomically</li>
              <li>If anything fails, both parties get their funds back after the timeout</li>
            </ol>
            <p>HTLCs will enable completely decentralized trading while maintaining the same security guarantees as the escrow system. The marketplace will support both methods!</p>
          </div>
        </div>
      </div>

      <!-- Technical -->
      <div class="faq-category">
        <h3>⚙️ Technical</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-arkade')">
            <span>What is the Arkade Protocol?</span>
            <span class="faq-icon">{{ isOpen('what-arkade') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-arkade')" class="faq-answer">
            <p>Arkade is a Bitcoin Layer 2 protocol that enables instant, off-chain transactions while maintaining Bitcoin's security. It uses Virtual UTXOs (VTXOs) to represent off-chain balances.</p>
            <p>Key benefits:</p>
            <ul>
              <li><strong>Instant transactions:</strong> No waiting for block confirmations</li>
              <li><strong>No fees:</strong> Off-chain transfers are free</li>
              <li><strong>Bitcoin security:</strong> You can always exit to Bitcoin L1</li>
              <li><strong>Unilateral exit:</strong> Exit without coordinator permission</li>
            </ul>
            <p>Learn more at <a href="https://docs.arkadeos.com" target="_blank">docs.arkadeos.com</a></p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-vtxo')">
            <span>What is a VTXO?</span>
            <span class="faq-icon">{{ isOpen('what-vtxo') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-vtxo')" class="faq-answer">
            <p>A VTXO (Virtual UTXO) is an off-chain representation of Bitcoin that lives on the Arkade Layer 2. Think of it as a Bitcoin IOU that you can instantly transfer without on-chain fees.</p>
            <p>VTXOs are backed by real Bitcoin locked in Arkade smart contracts, and you can always convert them back to regular Bitcoin UTXOs by exiting to L1.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-nostr')">
            <span>What is Nostr and how is it used?</span>
            <span class="faq-icon">{{ isOpen('what-nostr') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-nostr')" class="faq-answer">
            <p>Nostr (Notes and Other Stuff Transmitted by Relays) is a decentralized protocol for sharing data. ArkPunks uses Nostr for:</p>
            <ul>
              <li><strong>Ownership registry:</strong> Each punk mint is published to Nostr relays</li>
              <li><strong>Official punks list:</strong> The first 1,000 punks are tracked on relay.damus.io</li>
              <li><strong>Marketplace listings:</strong> Sale offers are shared via Nostr</li>
              <li><strong>L1 exit preservation:</strong> Punk data is published to Nostr before exiting to L1</li>
            </ul>
            <p>Your Nostr pubkey (npub) is derived from your Bitcoin private key, creating a unified identity.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('punk-data')">
            <span>Where is punk data stored?</span>
            <span class="faq-icon">{{ isOpen('punk-data') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('punk-data')" class="faq-answer">
            <p>Punk data is stored in three places:</p>
            <ol>
              <li><strong>Nostr relays:</strong> Permanent, decentralized record of ownership and mint events</li>
              <li><strong>Browser localStorage:</strong> Local cache for fast loading and offline viewing</li>
              <li><strong>Bitcoin blockchain (on exit):</strong> Punk metadata is linked to L1 address via Nostr events</li>
            </ol>
            <p>Each punk's visual appearance can be regenerated from its 6-byte compressed data, ensuring permanence.</p>
          </div>
        </div>
      </div>

      <!-- L1 Exit & Recovery -->
      <div class="faq-category">
        <h3>🟠 L1 Exit & Recovery</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('what-l1-exit')">
            <span>What is an L1 Exit?</span>
            <span class="faq-icon">{{ isOpen('what-l1-exit') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('what-l1-exit')" class="faq-answer">
            <p>An L1 Exit is the process of converting your Arkade VTXOs back into regular Bitcoin UTXOs on the Bitcoin blockchain (Layer 1).</p>
            <p>Before exiting, ArkPunks publishes your punk data to Nostr relays and links them to your destination Bitcoin address. This ensures your punks remain recoverable even after leaving Arkade.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('punks-destroyed')">
            <span>Will my punks be destroyed when I exit to L1?</span>
            <span class="faq-icon">{{ isOpen('punks-destroyed') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('punks-destroyed')" class="faq-answer">
            <p><strong>No!</strong> Your punks are preserved via Nostr.</p>
            <p>When you exit to L1, ArkPunks automatically:</p>
            <ol>
              <li>Publishes exit events to Nostr relays (KIND 1404)</li>
              <li>Links each punk to your destination Bitcoin address</li>
              <li>Stores compressed punk metadata in Nostr events</li>
            </ol>
            <p>After exiting, you can recover your punks by re-entering Arkade with the same Bitcoin address or Nostr key.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-exit')">
            <span>How do I exit to Bitcoin L1?</span>
            <span class="faq-icon">{{ isOpen('how-exit') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-exit')" class="faq-answer">
            <p>In the wallet section, click "🟠 Exit to L1". Follow these steps:</p>
            <ol>
              <li>Enter your Bitcoin L1 destination address (bc1q... or bc1p...)</li>
              <li>Click "1️⃣ Prepare Exit" - this publishes your punks to Nostr</li>
              <li>Wait for confirmation that punks are published</li>
              <li>Click "2️⃣ Proceed with L1 Exit" - this converts VTXOs to UTXOs</li>
            </ol>
            <p>Your Bitcoin will be sent to the destination address, and your punks will be linked to it via Nostr.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('how-recover')">
            <span>How do I recover my punks after exiting?</span>
            <span class="faq-icon">{{ isOpen('how-recover') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('how-recover')" class="faq-answer">
            <p>To recover punks after exiting to L1:</p>
            <ol>
              <li>Import your wallet using the same private key</li>
              <li>Go to the wallet section and click "🔍 Nostr Diagnostic"</li>
              <li>Check the browser console (F12) to see your punks linked to L1 addresses</li>
              <li>Re-enter Arkade by boarding funds from your L1 address</li>
              <li>Your punks will be automatically recovered from Nostr</li>
            </ol>
            <p>Your Nostr pubkey (npub) is your recovery key - keep it safe!</p>
          </div>
        </div>
      </div>

      <!-- Troubleshooting -->
      <div class="faq-category">
        <h3>🔧 Troubleshooting</h3>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('punks-not-showing')">
            <span>Why aren't my punks showing up?</span>
            <span class="faq-icon">{{ isOpen('punks-not-showing') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('punks-not-showing')" class="faq-answer">
            <p>Try these steps:</p>
            <ol>
              <li>Click "🔄 Refresh" in the wallet section</li>
              <li>Check your balance - you need funds to mint punks</li>
              <li>Click "🔍 Nostr Diagnostic" to query Nostr relays</li>
              <li>Check browser console (F12) for any errors</li>
              <li>Make sure you're using the correct wallet (check address)</li>
            </ol>
            <p>Punks are loaded from Nostr relays, so there may be a delay after minting.</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('lost-wallet')">
            <span>What if I lose my wallet?</span>
            <span class="faq-icon">{{ isOpen('lost-wallet') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('lost-wallet')" class="faq-answer">
            <p><strong>If you exported your wallet:</strong> Import the JSON file using "Import Wallet" → "Import from File"</p>
            <p><strong>If you have your private key (hex):</strong> Import using "Import Wallet" → "Hex Private Key"</p>
            <p><strong>If you lost everything:</strong> Unfortunately, there's no way to recover your wallet without the private key. Your funds and punks will be permanently lost.</p>
            <p>This is why it's critical to export and backup your wallet immediately after creating it!</p>
          </div>
        </div>

        <div class="faq-item">
          <button class="faq-question" @click="toggle('is-it-safe')">
            <span>Is ArkPunks safe to use?</span>
            <span class="faq-icon">{{ isOpen('is-it-safe') ? '−' : '+' }}</span>
          </button>
          <div v-if="isOpen('is-it-safe')" class="faq-answer">
            <p><strong>⚠️ ArkPunks is alpha software.</strong></p>
            <p>Risks to be aware of:</p>
            <ul>
              <li>Bugs may exist that could result in loss of funds</li>
              <li>Arkade Protocol is experimental Layer 2 technology</li>
              <li>Your private key is stored in browser localStorage (export it!)</li>
              <li>No insurance or guarantees</li>
            </ul>
            <p><strong>Best practices:</strong></p>
            <ul>
              <li>Only use amounts you can afford to lose</li>
              <li>Export your wallet immediately after creating it</li>
              <li>Test with small amounts first</li>
              <li>Keep backups of your private key in multiple safe places</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const openItems = ref<Set<string>>(new Set())

function toggle(id: string) {
  if (openItems.value.has(id)) {
    openItems.value.delete(id)
  } else {
    openItems.value.add(id)
  }
}

function isOpen(id: string): boolean {
  return openItems.value.has(id)
}
</script>

<style scoped>
.faq-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.faq-container h2 {
  text-align: center;
  color: #ff6b35;
  font-size: 32px;
  margin-bottom: 40px;
}

.faq-categories {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.faq-category {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 24px;
}

.faq-category h3 {
  color: #ff6b35;
  font-size: 24px;
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 2px solid #333;
}

.faq-item {
  margin-bottom: 16px;
}

.faq-item:last-child {
  margin-bottom: 0;
}

.faq-question {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 8px;
  padding: 16px 20px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.faq-question:hover {
  background: #333;
  border-color: #ff6b35;
}

.faq-icon {
  font-size: 24px;
  color: #ff6b35;
  font-weight: bold;
  min-width: 24px;
  text-align: center;
}

.faq-answer {
  background: #0a0a0a;
  border: 2px solid #333;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 20px;
  margin-top: -8px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.faq-answer p {
  color: #ccc;
  line-height: 1.6;
  margin: 0 0 12px 0;
}

.faq-answer p:last-child {
  margin-bottom: 0;
}

.faq-answer strong {
  color: #fff;
}

.faq-answer ul,
.faq-answer ol {
  color: #ccc;
  line-height: 1.6;
  margin: 12px 0;
  padding-left: 24px;
}

.faq-answer li {
  margin-bottom: 8px;
}

.faq-answer a {
  color: #ff6b35;
  text-decoration: none;
  font-weight: 600;
  transition: color 0.2s;
}

.faq-answer a:hover {
  color: #ff8555;
  text-decoration: underline;
}

@media (max-width: 768px) {
  .faq-container {
    padding: 16px;
  }

  .faq-container h2 {
    font-size: 24px;
    margin-bottom: 24px;
  }

  .faq-category {
    padding: 16px;
  }

  .faq-category h3 {
    font-size: 20px;
  }

  .faq-question {
    padding: 12px 16px;
    font-size: 14px;
  }

  .faq-answer {
    padding: 16px;
    font-size: 14px;
  }
}
</style>

-- Arkade Punks Database Schema
-- Single source of truth for all punk data and marketplace
-- Uses Nostr as authoritative source (minter_pubkey)

-- Punks table: ownership and metadata
CREATE TABLE IF NOT EXISTS punks (
  punk_id TEXT PRIMARY KEY,              -- 64-char hex punk ID
  minter_pubkey TEXT,                    -- Original minter's Nostr pubkey (NULL if not available)
  owner_address TEXT,                    -- Current owner ark1... address (derived/cached)
  bitcoin_address TEXT,                  -- Bitcoin address from Nostr mint event (bc1p...)
  minted_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  compressed_metadata BLOB,              -- 6-byte compressed punk metadata (hex)
  vtxo_outpoint TEXT,                    -- Original VTXO outpoint from mint
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Marketplace listings
CREATE TABLE IF NOT EXISTS listings (
  punk_id TEXT PRIMARY KEY,              -- References punks(punk_id)
  seller_address TEXT NOT NULL,          -- Seller's ark1... address
  seller_pubkey TEXT NOT NULL,           -- Seller's nostr pubkey
  price_sats INTEGER NOT NULL,           -- Price in satoshis
  status TEXT NOT NULL CHECK(status IN ('pending', 'deposited', 'sold', 'cancelled')),
  escrow_address TEXT,                   -- Static escrow address
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deposited_at INTEGER,                  -- When punk deposited to escrow
  sold_at INTEGER,                       -- When sale completed
  cancelled_at INTEGER,                  -- When listing cancelled
  buyer_address TEXT,                    -- Buyer's ark1... address (for sold)
  buyer_pubkey TEXT,                     -- Buyer's nostr pubkey (for sold)
  punk_transfer_txid TEXT,               -- Transaction ID for punk transfer
  payment_txid TEXT,                     -- Transaction ID for payment transfer
  FOREIGN KEY (punk_id) REFERENCES punks(punk_id)
);

-- Sales history (denormalized for fast stats queries)
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  punk_id TEXT NOT NULL,
  price_sats INTEGER NOT NULL,
  seller_address TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  sold_at INTEGER NOT NULL,
  punk_transfer_txid TEXT,
  payment_txid TEXT,
  compressed_metadata BLOB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_punks_minter ON punks(minter_pubkey);
CREATE INDEX IF NOT EXISTS idx_punks_owner ON punks(owner_address);
CREATE INDEX IF NOT EXISTS idx_punks_bitcoin ON punks(bitcoin_address);
CREATE INDEX IF NOT EXISTS idx_punks_minted ON punks(minted_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_address);
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_punk_id ON sales(punk_id);

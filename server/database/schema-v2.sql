-- Arkade Punks Database Schema v2
-- User-centric ownership model
-- Source of truth: User wallets (localStorage)

-- Punks table: Simple punk registry with current owner
-- Note: vtxo_outpoint NOT stored here (changes every round, wallet-side only)
-- Stores compressed metadata (6 bytes = 12 hex chars) for punk regeneration
CREATE TABLE IF NOT EXISTS punks (
  punk_id TEXT PRIMARY KEY,              -- 64-char hex punk ID (permanent identifier)
  owner_address TEXT NOT NULL,           -- Bitcoin address (bc1p...) or Ark address (ark1...)
  punk_metadata_compressed TEXT,         -- 12-char hex (6 bytes): type, background, attributes bitmap
  server_signature TEXT,                 -- Server signature (proves official punk)
  minted_at INTEGER,                     -- Unix timestamp (ms) - when first seen
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Ownership history: Track punk transfers
CREATE TABLE IF NOT EXISTS ownership_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  punk_id TEXT NOT NULL,
  from_address TEXT,                     -- NULL for first mint
  to_address TEXT NOT NULL,              -- New owner
  transferred_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (punk_id) REFERENCES punks(punk_id)
);

-- Marketplace listings (unchanged)
CREATE TABLE IF NOT EXISTS listings (
  punk_id TEXT PRIMARY KEY,
  seller_address TEXT NOT NULL,
  seller_pubkey TEXT NOT NULL,
  price_sats INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'deposited', 'sold', 'cancelled')),
  escrow_address TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  deposited_at INTEGER,
  sold_at INTEGER,
  cancelled_at INTEGER,
  buyer_address TEXT,
  buyer_pubkey TEXT,
  punk_transfer_txid TEXT,
  payment_txid TEXT,
  FOREIGN KEY (punk_id) REFERENCES punks(punk_id)
);

-- Sales history (unchanged)
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  punk_id TEXT NOT NULL,
  price_sats INTEGER NOT NULL,
  seller_address TEXT NOT NULL,
  buyer_address TEXT NOT NULL,
  sold_at INTEGER NOT NULL,
  punk_transfer_txid TEXT,
  payment_txid TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_punks_owner ON punks(owner_address);
CREATE INDEX IF NOT EXISTS idx_ownership_history_punk ON ownership_history(punk_id);
CREATE INDEX IF NOT EXISTS idx_ownership_history_to ON ownership_history(to_address);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_address);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at DESC);

-- Reference data: Legacy registry and Nostr data (for info only)
CREATE TABLE IF NOT EXISTS legacy_data (
  punk_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                  -- 'registry' or 'nostr'
  minter_pubkey TEXT,                    -- From Nostr/registry
  bitcoin_address TEXT,                  -- From Nostr mint event
  minted_at INTEGER,
  vtxo_outpoint TEXT,
  imported_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Audit log: Track all critical operations for security/debugging
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  action TEXT NOT NULL,                  -- 'LIST', 'DEPOSIT', 'BUY', 'CANCEL', 'PAYMENT', 'REFUND'
  punk_id TEXT,
  seller_address TEXT,
  buyer_address TEXT,
  amount_sats INTEGER,
  txid TEXT,                             -- Ark transaction ID if applicable
  status TEXT,                           -- 'SUCCESS', 'FAILED', 'PENDING'
  error_message TEXT,                    -- Error details if failed
  details TEXT                           -- JSON with extra info
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_punk ON audit_log(punk_id);
CREATE INDEX IF NOT EXISTS idx_audit_seller ON audit_log(seller_address);
CREATE INDEX IF NOT EXISTS idx_audit_buyer ON audit_log(buyer_address);

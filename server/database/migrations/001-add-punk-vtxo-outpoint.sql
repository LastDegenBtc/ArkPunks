-- Add punk_vtxo_outpoint column to listings table
-- This stores the VTXO outpoint of the punk when deposited to escrow

ALTER TABLE listings ADD COLUMN punk_vtxo_outpoint TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_listings_punk_vtxo_outpoint ON listings(punk_vtxo_outpoint);

import { Bytes } from "@scure/btc-signer/utils"

export interface PunkMetadata {
  punkId: string      // hex encoded
  name: string        // e.g., "Punk #1234"
  traits: {
    type: string      // Male/Female/Zombie/Ape/Alien
    attributes: string[] // ["Mohawk", "Glasses", "Cigarette"]
    background: string
  }
  imageUrl: string    // IPFS or data URL
  description?: string
}

export interface PunkVTXO {
  punkId: Bytes        // 32 bytes - unique hash of punk
  owner: Bytes         // 32 bytes - x-only pubkey of current owner
  listingPrice: bigint // Price in sats (0 = not for sale)
  serverPubkey: Bytes  // 32 bytes - Arkade server pubkey
  compressedData: Bytes // 6 bytes - compressed punk metadata (on-chain)
}

export interface VtxoInput {
  vtxo: {
    amount: string
    outpoint: {
      txid: string
      vout: number
    }
    tapscripts: string[]
  }
  leaf: string // The specific tapscript leaf being spent
}

export interface PunkState {
  punkId: string
  owner: string        // hex pubkey
  listingPrice: bigint
  metadata: PunkMetadata
  vtxoOutpoint: string // txid:vout
  vtxo?: VtxoInput     // Full VTXO data if available
  inEscrow?: boolean   // true if punk is currently held in escrow
}

export enum PunkAction {
  Mint = 'mint',
  Transfer = 'transfer',
  List = 'list',
  Delist = 'delist',
  Buy = 'buy'
}

// Nostr event types for punk actions
export type PunkEvent =
  | MintEvent
  | TransferEvent
  | ListEvent
  | DelistEvent
  | BuyEvent

export interface MintEvent {
  type: 'mint'
  punkId: string        // hex
  owner: string         // hex pubkey
  metadata: PunkMetadata
  vtxoOutpoint: string  // txid:vout
  timestamp: number
}

export interface TransferEvent {
  type: 'transfer'
  punkId: string
  fromOwner: string     // hex pubkey
  toOwner: string       // hex pubkey
  signature: string     // hex signature of fromOwner
  vtxoOutpoint: string  // new VTXO outpoint
  timestamp: number
}

export interface ListEvent {
  type: 'list'
  punkId: string
  owner: string
  listingPrice: string  // sats as string
  signature: string
  vtxoOutpoint: string  // new VTXO with price
  timestamp: number
}

export interface DelistEvent {
  type: 'delist'
  punkId: string
  owner: string
  signature: string
  vtxoOutpoint: string  // new VTXO with price = 0
  timestamp: number
}

export interface BuyEvent {
  type: 'buy'
  punkId: string
  seller: string        // hex pubkey
  buyer: string         // hex pubkey
  price: string         // sats as string
  vtxoOutpoint: string  // new VTXO with buyer as owner
  timestamp: number
}

// Type guards
export function isMintEvent(event: unknown): event is MintEvent {
  return typeof event === 'object'
    && event !== null
    && 'type' in event
    && event.type === 'mint'
    && 'punkId' in event
    && 'owner' in event
    && 'metadata' in event
}

export function isTransferEvent(event: unknown): event is TransferEvent {
  return typeof event === 'object'
    && event !== null
    && 'type' in event
    && event.type === 'transfer'
    && 'punkId' in event
    && 'fromOwner' in event
    && 'toOwner' in event
}

export function isListEvent(event: unknown): event is ListEvent {
  return typeof event === 'object'
    && event !== null
    && 'type' in event
    && event.type === 'list'
    && 'punkId' in event
    && 'listingPrice' in event
}

export function isBuyEvent(event: unknown): event is BuyEvent {
  return typeof event === 'object'
    && event !== null
    && 'type' in event
    && event.type === 'buy'
    && 'punkId' in event
    && 'buyer' in event
    && 'seller' in event
}

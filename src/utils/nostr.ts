import { nip19, SimplePool, Event as NostrEvent, getPublicKey } from 'nostr-tools'
import { PunkEvent, isMintEvent, isTransferEvent, isListEvent, isBuyEvent } from '@/types/punk'
import { hex } from '@scure/base'

// Custom event kind for ArkPunks
export const PUNK_KIND = 32001

// Default Nostr relays for punk events
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social'
]

/**
 * Parses a Nostr event containing punk data
 */
export function parsePunkEvent(event: NostrEvent): PunkEvent {
  try {
    const data = JSON.parse(event.content) as PunkEvent

    // Validate event type
    if (!isMintEvent(data) && !isTransferEvent(data) && !isListEvent(data) && !isBuyEvent(data)) {
      throw new Error('Invalid punk event type')
    }

    return data
  } catch (err) {
    throw new Error(`Failed to parse punk event: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

/**
 * Creates a Nostr event for a punk action
 * @param punkEvent - Punk event data
 * @param privateKey - User's Nostr private key (hex)
 * @returns Signed Nostr event
 */
export async function createPunkNostrEvent(
  punkEvent: PunkEvent,
  privateKey: string
): Promise<NostrEvent> {
  const pubkey = getPublicKey(hex.decode(privateKey))

  const event: NostrEvent = {
    kind: PUNK_KIND,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', punkEvent.type], // Event type tag
      ['punk', punkEvent.punkId], // Punk ID tag for filtering
    ],
    content: JSON.stringify(punkEvent),
    id: '',
    sig: ''
  }

  // Sign the event
  // Note: In production, use nostr-tools signing
  // event = await signEvent(event, privateKey)

  return event
}

/**
 * Publishes a punk event to Nostr relays
 * @param event - Signed Nostr event
 * @param relays - Array of relay URLs
 */
export async function publishPunkEvent(
  event: NostrEvent,
  relays: string[] = DEFAULT_RELAYS
): Promise<void> {
  const pool = new SimplePool()

  try {
    await Promise.any(
      pool.publish(relays, event)
    )
  } catch (err) {
    throw new Error(`Failed to publish event: ${err instanceof Error ? err.message : 'Unknown error'}`)
  } finally {
    pool.close(relays)
  }
}

/**
 * Subscribes to punk events for a specific punk ID
 * @param punkId - Punk ID to filter for
 * @param onEvent - Callback for new events
 * @param relays - Array of relay URLs
 * @returns Cleanup function
 */
export function subscribeToPunk(
  punkId: string,
  onEvent: (event: PunkEvent) => void,
  relays: string[] = DEFAULT_RELAYS
): () => void {
  const pool = new SimplePool()

  const sub = pool.sub(relays, [
    {
      kinds: [PUNK_KIND],
      '#punk': [punkId]
    }
  ])

  sub.on('event', (nostrEvent: NostrEvent) => {
    try {
      const punkEvent = parsePunkEvent(nostrEvent)
      onEvent(punkEvent)
    } catch (err) {
      console.error('Failed to parse punk event:', err)
    }
  })

  // Return cleanup function
  return () => {
    sub.unsub()
    pool.close(relays)
  }
}

/**
 * Subscribes to all punk events
 * @param onEvent - Callback for new events
 * @param relays - Array of relay URLs
 * @returns Cleanup function
 */
export function subscribeToAllPunks(
  onEvent: (event: PunkEvent) => void,
  relays: string[] = DEFAULT_RELAYS
): () => void {
  const pool = new SimplePool()

  const sub = pool.sub(relays, [
    {
      kinds: [PUNK_KIND]
    }
  ])

  sub.on('event', (nostrEvent: NostrEvent) => {
    try {
      const punkEvent = parsePunkEvent(nostrEvent)
      onEvent(punkEvent)
    } catch (err) {
      console.error('Failed to parse punk event:', err)
    }
  })

  return () => {
    sub.unsub()
    pool.close(relays)
  }
}

/**
 * Fetches historical punk events for a specific punk
 * @param punkId - Punk ID
 * @param relays - Array of relay URLs
 * @returns Array of punk events sorted by timestamp
 */
export async function fetchPunkHistory(
  punkId: string,
  relays: string[] = DEFAULT_RELAYS
): Promise<PunkEvent[]> {
  const pool = new SimplePool()

  try {
    const events = await pool.list(relays, [
      {
        kinds: [PUNK_KIND],
        '#punk': [punkId]
      }
    ])

    const punkEvents = events
      .map(event => {
        try {
          return parsePunkEvent(event)
        } catch {
          return null
        }
      })
      .filter((e): e is PunkEvent => e !== null)
      .sort((a, b) => a.timestamp - b.timestamp)

    return punkEvents
  } finally {
    pool.close(relays)
  }
}

/**
 * Fetches all listed punks from Nostr
 * @param relays - Array of relay URLs
 * @returns Array of punk IDs that are currently listed
 */
export async function fetchListedPunks(
  relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const pool = new SimplePool()

  try {
    const events = await pool.list(relays, [
      {
        kinds: [PUNK_KIND],
        '#p': ['list'] // Filter for list events
      }
    ])

    const listedPunks = new Set<string>()

    for (const event of events) {
      try {
        const punkEvent = parsePunkEvent(event)
        if (isListEvent(punkEvent) && BigInt(punkEvent.listingPrice) > 0n) {
          listedPunks.add(punkEvent.punkId)
        }
      } catch {
        continue
      }
    }

    return Array.from(listedPunks)
  } finally {
    pool.close(relays)
  }
}

/**
 * Converts private key between formats
 */
export function privateKeyToNsec(privateKey: string): string {
  return nip19.nsecEncode(privateKey)
}

export function nsecToPrivateKey(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec')
  }
  return decoded.data as string
}

/**
 * Converts public key between formats
 */
export function publicKeyToNpub(publicKey: string): string {
  return nip19.npubEncode(publicKey)
}

export function npubToPublicKey(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub')
  }
  return decoded.data as string
}

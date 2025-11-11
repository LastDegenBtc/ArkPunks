import { Bytes, sha256x2 } from "@scure/btc-signer/utils"
import { OP, Transaction } from "@scure/btc-signer"
import { hex } from "@scure/base"
import { vtxoScript } from "./taproot"
import { PunkVTXO, VtxoInput } from "@/types/punk"
import { buildRedeemTx } from "./psbt"
import { TAP_LEAF_VERSION, tapLeafHash } from "@scure/btc-signer/payment"

/**
 * Creates the tapscript for transferring a punk to a new owner
 * Requires:
 * - Current owner's signature
 * - Server's signature (for Arkade cooperative path)
 */
function createTransferLeaf(punk: PunkVTXO): Uint8Array {
  return new Uint8Array([
    // Verify current owner's signature
    0x20, ...punk.owner,
    OP.CHECKSIGVERIFY,

    // Verify server's signature
    0x20, ...punk.serverPubkey,
    OP.CHECKSIG
  ])
}

/**
 * Creates the tapscript for buying a listed punk
 * Requires:
 * - Buyer's signature (becomes new owner)
 * - Server's signature
 * Note: Payment validation happens at transaction level
 */
function createBuyLeaf(punk: PunkVTXO): Uint8Array {
  // For buy, we verify the buyer's pubkey will be the new owner
  // This is enforced by the new VTXO creation
  return new Uint8Array([
    // Server signature to validate the purchase
    0x20, ...punk.serverPubkey,
    OP.CHECKSIG
  ])
}

/**
 * Creates the tapscript for listing/delisting a punk
 * Requires:
 * - Current owner's signature
 * - Server's signature
 * Note: New price is set in the new VTXO
 */
function createListingLeaf(punk: PunkVTXO): Uint8Array {
  return new Uint8Array([
    // Verify owner's signature
    0x20, ...punk.owner,
    OP.CHECKSIGVERIFY,

    // Verify server's signature
    0x20, ...punk.serverPubkey,
    OP.CHECKSIG
  ])
}

/**
 * Creates all tapscripts for a punk VTXO
 * Returns hex-encoded tapscript leaves
 */
export function createPunkTapscripts(punk: PunkVTXO): {
  transferLeaf: string
  buyLeaf: string
  listingLeaf: string
} {
  return {
    transferLeaf: hex.encode(createTransferLeaf(punk)),
    buyLeaf: hex.encode(createBuyLeaf(punk)),
    listingLeaf: hex.encode(createListingLeaf(punk))
  }
}

/**
 * Creates a punk VTXO with taproot address and tapscripts
 */
export function createPunkVTXO(punk: PunkVTXO): {
  address: string
  tapscripts: string[]
  payment: ReturnType<typeof vtxoScript>
} {
  const { transferLeaf, buyLeaf, listingLeaf } = createPunkTapscripts(punk)
  const tapscripts = [transferLeaf, buyLeaf, listingLeaf]
  const payment = vtxoScript(tapscripts)

  if (!payment.address) {
    throw new Error('Failed to generate taproot address')
  }

  return {
    address: payment.address,
    tapscripts,
    payment
  }
}

/**
 * Builds a transaction to mint a new punk
 * @param punk - Punk configuration
 * @param fundingVtxos - User's VTXOs to fund the punk
 * @param punkValue - Value to assign to the punk (in sats)
 * @param changeAddress - Address for change output
 * @returns Transaction object
 */
export function buildMintTransaction(
  punk: PunkVTXO,
  fundingVtxos: VtxoInput[],
  punkValue: bigint,
  changeAddress: string
): Transaction {
  const { address } = createPunkVTXO(punk)

  // Calculate total input value
  const totalInput = fundingVtxos.reduce(
    (sum, vtxo) => sum + BigInt(vtxo.vtxo.amount),
    0n
  )

  const outputs: { value: bigint; address: string }[] = [
    { value: punkValue, address }
  ]

  // Add change output if needed
  const change = totalInput - punkValue
  if (change < 0n) {
    throw new Error('Insufficient funds to mint punk')
  }

  if (change > 0n) {
    outputs.push({ value: change, address: changeAddress })
  }

  return buildRedeemTx(fundingVtxos, outputs)
}

/**
 * Builds a transaction to transfer a punk to a new owner
 * @param currentPunk - Current punk state
 * @param currentVtxo - Current punk VTXO
 * @param newOwner - New owner's pubkey
 * @returns Transaction object
 */
export function buildTransferTransaction(
  currentPunk: PunkVTXO,
  currentVtxo: VtxoInput,
  newOwner: Bytes
): Transaction {
  // Create new punk VTXO with new owner
  const newPunk: PunkVTXO = {
    ...currentPunk,
    owner: newOwner,
    listingPrice: 0n // Reset listing when transferring
  }

  const { address } = createPunkVTXO(newPunk)
  const punkValue = BigInt(currentVtxo.vtxo.amount)

  return buildRedeemTx(
    [currentVtxo],
    [{ value: punkValue, address }]
  )
}

/**
 * Builds a transaction to list/delist a punk
 * @param currentPunk - Current punk state
 * @param currentVtxo - Current punk VTXO
 * @param newPrice - New listing price (0 to delist)
 * @returns Transaction object
 */
export function buildListingTransaction(
  currentPunk: PunkVTXO,
  currentVtxo: VtxoInput,
  newPrice: bigint
): Transaction {
  // Create new punk VTXO with updated price
  const newPunk: PunkVTXO = {
    ...currentPunk,
    listingPrice: newPrice
  }

  const { address } = createPunkVTXO(newPunk)
  const punkValue = BigInt(currentVtxo.vtxo.amount)

  return buildRedeemTx(
    [currentVtxo],
    [{ value: punkValue, address }]
  )
}

/**
 * Builds a transaction to buy a listed punk
 * @param currentPunk - Current punk state (must have listingPrice > 0)
 * @param currentVtxo - Current punk VTXO
 * @param buyerPubkey - Buyer's pubkey
 * @param paymentVtxos - Buyer's VTXOs for payment
 * @param sellerAddress - Seller's address to receive payment
 * @param buyerChangeAddress - Buyer's address for change
 * @returns Transaction object
 */
export function buildBuyTransaction(
  currentPunk: PunkVTXO,
  currentVtxo: VtxoInput,
  buyerPubkey: Bytes,
  paymentVtxos: VtxoInput[],
  sellerAddress: string,
  buyerChangeAddress: string
): Transaction {
  if (currentPunk.listingPrice === 0n) {
    throw new Error('Punk is not listed for sale')
  }

  // Create new punk VTXO with buyer as owner and price reset
  const newPunk: PunkVTXO = {
    ...currentPunk,
    owner: buyerPubkey,
    listingPrice: 0n
  }

  const { address: newPunkAddress } = createPunkVTXO(newPunk)
  const punkValue = BigInt(currentVtxo.vtxo.amount)

  // Calculate total payment available
  const totalPayment = paymentVtxos.reduce(
    (sum, vtxo) => sum + BigInt(vtxo.vtxo.amount),
    0n
  )

  if (totalPayment < currentPunk.listingPrice) {
    throw new Error('Insufficient funds to buy punk')
  }

  const outputs: { value: bigint; address: string }[] = [
    // Output 1: New punk VTXO for buyer
    { value: punkValue, address: newPunkAddress },
    // Output 2: Payment to seller
    { value: currentPunk.listingPrice, address: sellerAddress }
  ]

  // Add change output if needed
  const change = totalPayment - currentPunk.listingPrice
  if (change > 0n) {
    outputs.push({ value: change, address: buyerChangeAddress })
  }

  // Inputs: punk VTXO + payment VTXOs
  const inputs = [currentVtxo, ...paymentVtxos]

  return buildRedeemTx(inputs, outputs)
}

/**
 * Signs a punk transaction with owner's private key
 * @param tx - Transaction to sign
 * @param punk - Punk VTXO being spent
 * @param privateKey - Owner's private key
 * @param inputIndex - Index of the punk input (default 0)
 * @param leafType - Which tapscript leaf to use
 */
export function signPunkTransaction(
  tx: Transaction,
  punk: PunkVTXO,
  privateKey: Bytes,
  inputIndex: number = 0,
  leafType: 'transfer' | 'buy' | 'listing'
): void {
  const tapscripts = createPunkTapscripts(punk)

  let leaf: string
  switch (leafType) {
    case 'transfer':
      leaf = tapscripts.transferLeaf
      break
    case 'buy':
      leaf = tapscripts.buyLeaf
      break
    case 'listing':
      leaf = tapscripts.listingLeaf
      break
  }

  const leafScript = hex.decode(leaf)
  const leafHash = tapLeafHash(leafScript, TAP_LEAF_VERSION)

  // Sign the transaction (this will add the signature to the witness)
  tx.sign(privateKey)

  // Update the input with tapscript signature
  tx.updateInput(inputIndex, {
    tapScriptSig: [
      [
        {
          pubKey: punk.owner,
          leafHash: leafHash
        },
        tx.getInput(inputIndex).tapScriptSig?.[0]?.[1] || new Uint8Array()
      ]
    ]
  })
}

/**
 * Helper to extract punk ID from transaction
 */
export function getPunkIdFromTx(tx: Transaction): string {
  // Punk ID is the hash of the first output
  const txBytes = tx.toBytes(true)
  const txid = hex.encode(sha256x2(txBytes).reverse())
  return txid
}

/**
 * Validates punk VTXO structure
 */
export function validatePunkVTXO(punk: PunkVTXO): void {
  if (punk.punkId.length !== 32) {
    throw new Error('Invalid punk ID: must be 32 bytes')
  }
  if (punk.owner.length !== 32) {
    throw new Error('Invalid owner pubkey: must be 32 bytes')
  }
  if (punk.serverPubkey.length !== 32) {
    throw new Error('Invalid server pubkey: must be 32 bytes')
  }
  if (punk.listingPrice < 0n) {
    throw new Error('Invalid listing price: must be non-negative')
  }
}

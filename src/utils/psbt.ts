import { Transaction, p2tr } from "@scure/btc-signer"
import { hex } from "@scure/base"
import { VtxoInput } from "@/types/punk"
import { TAP_LEAF_VERSION, tapLeafHash } from "@scure/btc-signer/payment"

export interface Output {
  value: bigint
  address: string
}

/**
 * Builds a redeem transaction that spends VTXOs
 * @param inputs - VTXOs to spend
 * @param outputs - Outputs to create
 * @returns Partially signed transaction
 */
export function buildRedeemTx(
  inputs: VtxoInput[],
  outputs: Output[]
): Transaction {
  const tx = new Transaction()

  // Add inputs
  for (const input of inputs) {
    const { txid, vout } = input.vtxo.outpoint

    // Parse the tapscripts for witness data
    const witnessUtxo = {
      script: new Uint8Array(), // Will be filled with taproot output script
      amount: BigInt(input.vtxo.amount)
    }

    tx.addInput({
      txid: hex.decode(txid).reverse(),
      index: vout,
      witnessUtxo,
      sequence: 0xfffffffd // Enable RBF
    })
  }

  // Add outputs
  for (const output of outputs) {
    // Decode the address to get the script
    const script = addressToScript(output.address)

    tx.addOutput({
      script,
      amount: output.value
    })
  }

  return tx
}

/**
 * Converts a Bitcoin address to output script
 * Supports bech32m (Taproot) addresses
 */
function addressToScript(address: string): Uint8Array {
  // For Taproot addresses (starting with 'bc1p' or 'tark1p')
  // We need to decode the bech32m address

  // This is a simplified version - in production you'd use a proper address decoder
  // For now, we'll use the p2tr payment to encode it back

  // Strip the prefix and decode
  const prefix = address.startsWith('tark') ? 'tark' : 'bc'

  // Simple bech32m decoding (you'd use @scure/base in production)
  // For demo purposes, we'll create a placeholder

  throw new Error('Address decoding not fully implemented - use payment.script directly')
}

/**
 * Adds tapscript signature to a transaction input
 * @param tx - Transaction
 * @param inputIndex - Input index
 * @param pubkey - Public key
 * @param signature - Signature bytes
 * @param leafScript - Tapscript leaf being spent
 */
export function addTapscriptSig(
  tx: Transaction,
  inputIndex: number,
  pubkey: Uint8Array,
  signature: Uint8Array,
  leafScript: Uint8Array
): void {
  const leafHash = tapLeafHash(leafScript, TAP_LEAF_VERSION)

  tx.updateInput(inputIndex, {
    tapScriptSig: [
      [
        {
          pubKey: pubkey,
          leafHash: leafHash
        },
        signature
      ]
    ]
  })
}

/**
 * Finalizes and extracts the transaction hex
 */
export function finalizeTx(tx: Transaction): string {
  tx.finalize()
  return hex.encode(tx.extract())
}

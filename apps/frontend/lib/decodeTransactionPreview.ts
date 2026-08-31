/**
 * Human-readable transaction preview decoder (#585).
 *
 * Wallet extensions show raw XDR most users can't evaluate before signing.
 * We hold the domain context (which contract, which method, which amounts)
 * this app is about to invoke, so we can decode the built transaction into
 * a plain-language summary before ever handing it to the wallet adapter.
 *
 * `decodeTransactionPreview` never guesses at unknown operations — anything
 * it doesn't recognize surfaces as an honest "unrecognized operation"
 * fallback carrying the raw operation type/function name, rather than a
 * fabricated summary.
 */
import {
  Address,
  Operation,
  Transaction,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { NetworkId } from "./networks";
import { getNetworkConfig } from "./networks";

/** A single decoded operation within the preview. */
export type DecodedOperation =
  | {
      kind: "escrow_release";
      summary: string;
      recipient: string;
      amount: string;
      asset: string;
    }
  | {
      kind: "permission_spend";
      summary: string;
      spender: string;
      amount: string;
      asset: string;
    }
  | {
      kind: "unrecognized";
      summary: string;
      /** The raw operation type, for the "raw details" fallback view. */
      operationType: string;
      /** The invoked contract function name, when this was a contract call. */
      functionName?: string;
    };

export interface TransactionPreview {
  /** Network the transaction was built for (from its passphrase). */
  networkId: NetworkId | null;
  /** Source account of the transaction (truncated display is the caller's job). */
  sourceAccount: string;
  /** Fee in stroops, as a decimal string. */
  fee: string;
  /** Memo text, if present. */
  memo: string | null;
  operations: DecodedOperation[];
}

/** Known contract method names this decoder maps to a friendly summary. */
const ESCROW_RELEASE_METHODS = new Set(["release", "release_escrow"]);
const PERMISSION_SPEND_METHODS = new Set(["spend", "permission_spend"]);

const STROOPS_PER_UNIT = 10_000_000n;

/** Formats a raw i128/i64 stroop amount as a decimal XLM-style string. */
function formatAmount(raw: bigint): string {
  const whole = raw / STROOPS_PER_UNIT;
  const frac = raw % STROOPS_PER_UNIT;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/** Truncates a Stellar address for display: "GABC…WXYZ". */
export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function decodeAddressArg(scVal: xdr.ScVal): string | null {
  try {
    const native = scValToNative(scVal);
    if (typeof native === "string") return native;
    return Address.fromScVal(scVal).toString();
  } catch {
    return null;
  }
}

function decodeAmountArg(scVal: xdr.ScVal): bigint | null {
  try {
    const native = scValToNative(scVal);
    if (typeof native === "bigint") return native;
    if (typeof native === "number") return BigInt(native);
    return null;
  } catch {
    return null;
  }
}

/**
 * Decodes a single `invokeHostFunction` operation whose host function is a
 * contract call, mapping known Delego contract methods to a friendly
 * summary. Falls back to an honest "unrecognized operation" result for
 * anything else — this function never fabricates a summary for a method
 * it doesn't have an exact mapping for.
 */
function decodeInvokeHostFunctionOp(
  op: Operation.InvokeHostFunction
): DecodedOperation {
  const hostFn = op.func;

  if (hostFn.switch().name !== "hostFunctionTypeInvokeContract") {
    return {
      kind: "unrecognized",
      summary: "Unrecognized operation (not a contract invocation)",
      operationType: "invokeHostFunction",
    };
  }

  const invokeArgs = hostFn.invokeContract();
  const functionName = invokeArgs.functionName().toString();
  const args = invokeArgs.args();

  if (ESCROW_RELEASE_METHODS.has(functionName) && args.length >= 2) {
    const recipient = decodeAddressArg(args[0]);
    const amount = decodeAmountArg(args[1]);
    if (recipient !== null && amount !== null) {
      const formatted = formatAmount(amount);
      return {
        kind: "escrow_release",
        summary: `Release ${formatted} XLM from escrow to ${truncateAddress(recipient)}`,
        recipient,
        amount: formatted,
        asset: "XLM",
      };
    }
  }

  if (PERMISSION_SPEND_METHODS.has(functionName) && args.length >= 2) {
    const spender = decodeAddressArg(args[0]);
    const amount = decodeAmountArg(args[1]);
    if (spender !== null && amount !== null) {
      const formatted = formatAmount(amount);
      return {
        kind: "permission_spend",
        summary: `Spend ${formatted} XLM via delegated permission (${truncateAddress(spender)})`,
        spender,
        amount: formatted,
        asset: "XLM",
      };
    }
  }

  return {
    kind: "unrecognized",
    summary: `Unrecognized operation: contract call "${functionName}"`,
    operationType: "invokeHostFunction",
    functionName,
  };
}

function decodeOperation(op: Operation): DecodedOperation {
  if (op.type === "invokeHostFunction") {
    return decodeInvokeHostFunctionOp(op as Operation.InvokeHostFunction);
  }

  return {
    kind: "unrecognized",
    summary: `Unrecognized operation type: ${op.type}`,
    operationType: op.type,
  };
}

function resolveNetworkId(passphrase: string): NetworkId | null {
  const candidates: NetworkId[] = ["testnet", "mainnet"];
  for (const id of candidates) {
    if (getNetworkConfig(id).networkPassphrase === passphrase) return id;
  }
  return null;
}

/**
 * Decodes a built (unsigned) transaction XDR into a human-readable preview.
 *
 * @param xdrString - Base64 transaction envelope XDR, as produced by
 *   `TransactionBuilder.build().toXDR()` — i.e. before it's handed to the
 *   wallet adapter's `signTransaction`.
 * @param networkPassphrase - The passphrase the transaction was built
 *   against (required by `TransactionBuilder.fromXDR` to parse correctly).
 * @throws Error if the XDR is malformed or not a `Transaction` (e.g. a fee-bump).
 */
export function decodeTransactionPreview(
  xdrString: string,
  networkPassphrase: string
): TransactionPreview {
  const parsed = TransactionBuilder.fromXDR(xdrString, networkPassphrase);

  if (!(parsed instanceof Transaction)) {
    throw new Error(
      "decodeTransactionPreview does not support fee-bump transaction envelopes"
    );
  }

  return {
    networkId: resolveNetworkId(networkPassphrase),
    sourceAccount: parsed.source,
    fee: parsed.fee,
    memo: parsed.memo.value ? String(parsed.memo.value) : null,
    operations: parsed.operations.map(decodeOperation),
  };
}

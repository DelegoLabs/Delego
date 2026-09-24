/**
 * Escrow timeout auto-refund (#713).
 *
 * Once the Soroban ledger passes the escrow's timeout ledger without a
 * delivery confirmation, the buyer can call the escrow contract's `refund()`
 * method to reclaim the full amount.
 */

import {
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  rpc,
} from "@stellar/stellar-sdk";

export interface TimeoutRefundState {
  canRefund: boolean;
  currentLedger: number;
  timeoutLedger: number;
  remainingLedgers: number;
  refundAmountStroops: string;
}

/** Average Stellar ledger close time, used only for the countdown estimate. */
export const LEDGER_CLOSE_SECONDS = 5;

export function computeTimeoutRefundState(
  currentLedger: number,
  timeoutLedger: number,
  refundAmountStroops: string
): TimeoutRefundState {
  const remainingLedgers = Math.max(0, timeoutLedger - currentLedger);
  return {
    canRefund: currentLedger >= timeoutLedger,
    currentLedger,
    timeoutLedger,
    remainingLedgers,
    refundAmountStroops,
  };
}

/** Approximate wall-clock countdown for the remaining ledgers, e.g. "~1h 5m". */
export function formatLedgerCountdown(remainingLedgers: number): string {
  const totalSeconds = Math.max(0, remainingLedgers) * LEDGER_CLOSE_SECONDS;
  if (totalSeconds < 60) return `~${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `~${days}d ${hours}h`;
  if (hours > 0) return `~${hours}h ${minutes}m`;
  return `~${minutes}m`;
}

export async function fetchCurrentLedger(rpcUrl: string): Promise<number> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const latest = await server.getLatestLedger();
  return latest.sequence;
}

export interface InvokeRefundInput {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  buyerAddress: string;
  /** Signs the prepared transaction XDR and returns the signed XDR (e.g. Freighter). */
  signTransaction: (xdr: string) => Promise<string>;
  /** Max polls while waiting for the transaction to land. */
  maxPolls?: number;
  pollIntervalMs?: number;
}

export interface InvokeRefundResult {
  txHash: string;
}

/**
 * Builds, simulates, signs and submits `refund(buyer)` against the escrow
 * contract, then waits for the transaction to be applied.
 */
export async function invokeEscrowRefund({
  rpcUrl,
  networkPassphrase,
  contractId,
  buyerAddress,
  signTransaction,
  maxPolls = 20,
  pollIntervalMs = 1_500,
}: InvokeRefundInput): Promise<InvokeRefundResult> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const account = await server.getAccount(buyerAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(contract.call("refund", new Address(buyerAddress).toScVal()))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTransaction(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error("The network rejected the refund transaction. Please try again.");
  }

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await server.getTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { txHash: sent.hash };
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("The refund transaction failed on-chain.");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Timed out waiting for the refund transaction to confirm.");
}

/** Signs with the Freighter extension; loaded lazily since it only exists in the browser. */
export async function signWithFreighter(
  xdr: string,
  networkPassphrase: string,
  address: string
): Promise<string> {
  const freighter = await import("@stellar/freighter-api");
  const res = await freighter.signTransaction(xdr, { networkPassphrase, address });
  if (res.error || !res.signedTxXdr) {
    throw new Error(res.error?.message ?? "Signing was rejected.");
  }
  return res.signedTxXdr;
}

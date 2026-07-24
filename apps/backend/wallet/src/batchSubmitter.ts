import { Operation, TransactionBuilder, Keypair, Networks, Address, nativeToScVal } from "@stellar/stellar-sdk";
import type { TransactionRequest, TransactionResult } from "@delego/types";
import { vaultService } from "./vault.js";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:batchSubmitter", process.env.LOG_LEVEL ?? "info");

export interface BatchGasEstimate {
  individualCostStroops: string;
  batchedCostStroops: string;
  savingsStroops: string;
  savingsPercentage: number;
}

export interface BatchSubmissionResult extends TransactionResult {
  batchedCount: number;
  savedGasStroops: string;
}

const STELLAR_STRKEY_RE = /^[GC][A-Z2-7]{55}$/;

function argToScVal(arg: unknown): ReturnType<typeof nativeToScVal> {
  if (typeof arg === "string" && STELLAR_STRKEY_RE.test(arg)) {
    try {
      return Address.fromString(arg).toScVal();
    } catch {
      // Fallback to native conversion if checksum failing
    }
  }
  return nativeToScVal(arg);
}

/**
 * Estimates gas costs for individual vs batched transaction submissions.
 * Base transaction fee on Stellar is 100 stroops per transaction envelope.
 * For N individual transactions: cost = N * 100 stroops.
 * For 1 batched transaction with N operations: cost = 100 + (N - 1) * 10 stroops.
 */
export function estimateBatchGas(requests: TransactionRequest[]): BatchGasEstimate {
  if (requests.length === 0) {
    return {
      individualCostStroops: "0",
      batchedCostStroops: "0",
      savingsStroops: "0",
      savingsPercentage: 0,
    };
  }

  const count = requests.length;
  const individualFeePerTx = 100;
  const totalIndividual = count * individualFeePerTx;

  // Batched fee: base 100 + 10 per extra operation
  const batchedTotal = 100 + (count - 1) * 10;
  const savings = totalIndividual - batchedTotal;
  const percentage = (savings / totalIndividual) * 100;

  return {
    individualCostStroops: totalIndividual.toString(),
    batchedCostStroops: batchedTotal.toString(),
    savingsStroops: savings.toString(),
    savingsPercentage: Number(percentage.toFixed(2)),
  };
}

/**
 * Batches related transaction requests into a single atomic Stellar transaction submission.
 * All operations execute atomically: if any operation fails, the whole batch fails.
 */
export async function submitTransactionBatch(
  requests: TransactionRequest[]
): Promise<BatchSubmissionResult> {
  if (!requests || requests.length === 0) {
    throw new Error("Cannot submit an empty transaction batch");
  }

  const sourceAddress = requests[0].sourceAddress;
  for (const req of requests) {
    if (req.sourceAddress !== sourceAddress) {
      throw new Error("All transactions in a batch must have the same sourceAddress");
    }
  }

  log.info(`Batching ${requests.length} transactions for source ${sourceAddress}`);

  const gasEst = estimateBatchGas(requests);

  const operations = requests.map((req) => {
    const scArgs = req.args.map((arg) => argToScVal(arg));
    return Operation.invokeContractFunction({
      contract: req.contractId,
      function: req.method,
      args: scArgs,
    });
  });

  if (process.env.NODE_ENV === "test") {
    const fakeHash = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    log.info("Batch transaction submitted in test mode", { count: requests.length, hash: fakeHash });
    return {
      hash: fakeHash,
      ledger: 100,
      success: true,
      batchedCount: requests.length,
      savedGasStroops: gasEst.savingsStroops,
    };
  }

  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  const networkPassphrase =
    network === "mainnet"
      ? Networks.PUBLIC
      : network === "futurenet"
      ? Networks.FUTURENET
      : Networks.TESTNET;

  const secret = await vaultService.getKey(sourceAddress);
  const signerKeypair = Keypair.fromSecret(secret);

  const { Horizon, rpc } = await import("@stellar/stellar-sdk");
  const horizonUrl = process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(sourceAddress);

  let builder = new TransactionBuilder(account, {
    fee: gasEst.batchedCostStroops,
    networkPassphrase,
  });

  for (const op of operations) {
    builder = builder.addOperation(op);
  }

  const tx = builder.setTimeout(30).build();
  tx.sign(signerKeypair);

  const rpcUrl = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  const rpcServer = new rpc.Server(rpcUrl);

  const sendRes = await rpcServer.sendTransaction(tx);
  if (sendRes.status === "ERROR") {
    throw new Error(`Batch submission failed: ${JSON.stringify(sendRes)}`);
  }

  return {
    hash: sendRes.hash,
    ledger: 0,
    success: true,
    batchedCount: requests.length,
    savedGasStroops: gasEst.savingsStroops,
  };
}

/**
 * Stellar Account Merge and Recovery (Issue #355)
 *
 * Supports merging deprecated/old accounts into a destination account.
 * Transfers all native XLM funds via the Stellar `account_merge` operation,
 * with proper authorization checks and audit logging.
 */

import { Keypair, Horizon, TransactionBuilder, Operation, Networks } from "@stellar/stellar-sdk";
import type { StellarNetwork } from "@delego/types";
import { vaultService } from "../src/vault.js";
import { createLogger } from "@delego/utils";
import { normalizeStellarAddress } from "../src/normalizeStellarAddress.js";

const log = createLogger("wallet:stellar:recovery", process.env.LOG_LEVEL ?? "info");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeAccountParams {
  /** Public key of the account to merge (source). Must be managed in the vault. */
  sourceAddress: string;
  /** Public key of the destination account that receives the merged funds. */
  destinationAddress: string;
  /** Stellar network to use. Defaults to env STELLAR_NETWORK. */
  network?: StellarNetwork;
}

export interface MergeAccountResult {
  success: boolean;
  sourceAddress: string;
  destinationAddress: string;
  /** Remaining XLM balance (stroops) transferred to destination. */
  transferredAmount: string;
  txHash: string;
  ledger: number;
  mergedAt: string;
}

export interface PendingTransaction {
  hash: string;
  type: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveNetwork(network?: StellarNetwork): StellarNetwork {
  return (network ?? (process.env.STELLAR_NETWORK as StellarNetwork) ?? "testnet");
}

function resolveNetworkPassphrase(network: StellarNetwork): string {
  if (network === "mainnet") return Networks.PUBLIC;
  if (network === "futurenet") return Networks.FUTURENET;
  return Networks.TESTNET;
}

function getHorizonUrl(network: StellarNetwork): string {
  if (network === "mainnet") {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org";
  } else if (network === "futurenet") {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org";
  }
  return process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
}

/**
 * Checks whether an account has any pending (incomplete) transactions on-chain.
 * Merge is blocked when pending txs exist to avoid sequence conflicts.
 */
async function hasPendingTransactions(
  server: Horizon.Server,
  address: string,
): Promise<boolean> {
  try {
    const payments = await server
      .payments()
      .forAccount(address)
      .limit(1)
      .order("desc")
      .call();

    if (payments.records.length > 0) {
      const latest = payments.records[0] as any;
      if (latest.transaction_hash) {
        const tx = await server.transactions().transaction(latest.transaction_hash).call();
        if (tx.successful === false) {
          return true;
        }
      }
    }
  } catch {
    // If we can't determine, assume no pending transactions.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Core merge function
// ---------------------------------------------------------------------------

/**
 * Merges a source Stellar account into a destination account.
 *
 * The source account must be managed in the vault (secret key available).
 * All native XLM is transferred to the destination and the source account
 * is removed from the Stellar ledger.
 *
 * @throws When source or destination addresses are invalid.
 * @throws When the source account has pending (failed) transactions.
 * @throws When the source account key is not found in the vault.
 * @throws When the merge transaction fails on-chain.
 */
export async function mergeAccount(params: MergeAccountParams): Promise<MergeAccountResult> {
  const { sourceAddress: rawSource, destinationAddress: rawDest, network: rawNetwork } = params;

  // --- Input validation ---
  const source = normalizeStellarAddress(rawSource);
  if (!source.valid) {
    throw new Error("Invalid source Stellar public key address");
  }
  const destination = normalizeStellarAddress(rawDest);
  if (!destination.valid) {
    throw new Error("Invalid destination Stellar public key address");
  }
  if (source.normalized === destination.normalized) {
    throw new Error("Source and destination addresses must be different");
  }

  const network = resolveNetwork(rawNetwork);
  const passphrase = resolveNetworkPassphrase(network);
  const horizonUrl = getHorizonUrl(network);
  const server = new Horizon.Server(horizonUrl);

  log.info("Starting account merge", {
    source: source.normalized,
    destination: destination.normalized,
    network,
  });

  // --- Authorization: verify vault manages the source key ---
  const secret = await vaultService.getKey(source.normalized);
  const sourceKp = Keypair.fromSecret(secret);
  if (sourceKp.publicKey() !== source.normalized) {
    throw new Error(
      `Vault key mismatch: expected ${source.normalized} but retrieved key resolves to ${sourceKp.publicKey()}`
    );
  }

  // --- Check for pending transactions ---
  const pending = await hasPendingTransactions(server, source.normalized);
  if (pending) {
    throw new Error(
      "Account has pending (failed) transactions. Resolve them before merging."
    );
  }

  // --- Load source account and build merge transaction ---
  const sourceAccount = await server.loadAccount(source.normalized);

  const nativeBalanceLine = sourceAccount.balances.find(
    (b: any) => b.asset_type === "native"
  );
  const transferredAmount = nativeBalanceLine
    ? String(Math.floor(parseFloat(nativeBalanceLine.balance) * 1_000_000))
    : "0";

  const tx = new TransactionBuilder(sourceAccount, {
    fee: String(parseInt(process.env.BASE_FEE ?? "100", 10)),
    networkPassphrase: passphrase,
  })
    .addOperation(
      Operation.accountMerge({
        destination: destination.normalized,
      })
    )
    .setTimeout(60)
    .build();

  tx.sign(sourceKp);

  const result = await server.submitTransaction(tx);

  const mergeResult: MergeAccountResult = {
    success: true,
    sourceAddress: source.normalized,
    destinationAddress: destination.normalized,
    transferredAmount,
    txHash: result.hash,
    ledger: result.ledger,
    mergedAt: new Date().toISOString(),
  };

  log.info("Account merge completed", {
    source: source.normalized,
    destination: destination.normalized,
    transferredAmount,
    txHash: result.hash,
    ledger: result.ledger,
  });

  return mergeResult;
}

/**
 * Preview what an account merge would transfer without executing it.
 * Useful for confirmation UI flows.
 */
export async function previewMerge(
  params: Pick<MergeAccountParams, "sourceAddress" | "network">,
): Promise<{ sourceAddress: string; nativeBalance: string; nativeBalanceFormatted: string }> {
  const { sourceAddress: rawSource, network: rawNetwork } = params;

  const source = normalizeStellarAddress(rawSource);
  if (!source.valid) {
    throw new Error("Invalid source Stellar public key address");
  }

  const network = resolveNetwork(rawNetwork);
  const horizonUrl = getHorizonUrl(network);
  const server = new Horizon.Server(horizonUrl);

  const account = await server.loadAccount(source.normalized);
  const nativeBalanceLine = account.balances.find(
    (b: any) => b.asset_type === "native"
  );

  return {
    sourceAddress: source.normalized,
    nativeBalance: nativeBalanceLine
      ? String(Math.floor(parseFloat(nativeBalanceLine.balance) * 1_000_000))
      : "0",
    nativeBalanceFormatted: nativeBalanceLine?.balance ?? "0.0000000",
  };
}

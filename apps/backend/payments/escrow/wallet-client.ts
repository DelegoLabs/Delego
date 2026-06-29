import type {
  ApiResponse,
  TransactionRequest,
  TransactionResult,
} from "@delego/types";
import { createLogger } from "@delego/utils";
import { getWalletUrl } from "./config.js";
import { estimateTransactionFee, type FeeEstimate } from "./feeEstimator.js";

const log = createLogger(
  "payments:wallet-client",
  process.env.LOG_LEVEL ?? "info",
);

/**
 * Gets the Horizon URL from environment configuration
 * Falls back to testnet default if not configured
 */
function getHorizonUrl(): string {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return process.env.STELLAR_HORIZON_URL ?? "https://horizon.stellar.org";
  } else if (network === "futurenet") {
    return (
      process.env.STELLAR_HORIZON_URL ?? "https://horizon-futurenet.stellar.org"
    );
  } else {
    return (
      process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org"
    );
  }
}

/**
 * Estimates transaction fee dynamically from Horizon
 * Tries p95 percentile for reliable fee calculation during normal conditions
 *
 * @returns FeeEstimate with current network fees
 */
export async function getTransactionFeeEstimate(): Promise<FeeEstimate> {
  const horizonUrl = getHorizonUrl();
  return estimateTransactionFee(horizonUrl, "p95");
}

export async function submitContractCall(
  request: TransactionRequest,
): Promise<TransactionResult> {
  const walletUrl = getWalletUrl();
  const url = `${walletUrl}/transactions/submit`;

  // Estimate current network fees
  const feeEstimate = await getTransactionFeeEstimate();

  log.info("Submitting escrow contract call via wallet service", {
    method: request.method,
    contractId: request.contractId,
    sourceAddress: request.sourceAddress,
    estimatedFee: feeEstimate.recommendedFeeStroops,
    feeSource: feeEstimate.source,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceAddress: request.sourceAddress,
        contractId: request.contractId,
        method: request.method,
        args: request.args,
        memo: request.memo,
        feeEstimate,
      }),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach wallet service";
    log.error("Wallet service request failed", {
      error: message,
      method: request.method,
    });
    throw new Error(`Wallet service unavailable: ${message}`);
  }

  const rawBody = await response.text();
  let body: ApiResponse<TransactionResult>;
  try {
    body = JSON.parse(rawBody) as ApiResponse<TransactionResult>;
  } catch {
    log.error("Wallet service returned non-JSON response", {
      status: response.status,
      method: request.method,
    });
    throw new Error(
      `Wallet service returned invalid response (status ${response.status})`,
    );
  }

  if (!response.ok || body.error) {
    const message =
      body.error?.message ??
      `Wallet service returned status ${response.status}`;
    log.error("Wallet service submission failed", {
      error: message,
      method: request.method,
    });
    throw new Error(message);
  }

  if (!body.data) {
    throw new Error("Wallet service returned empty transaction result");
  }

  log.info("Escrow contract transaction submitted", {
    txHash: body.data.hash,
    ledger: body.data.ledger,
    method: request.method,
    estimatedFee: feeEstimate.recommendedFeeStroops,
  });

  return body.data;
}

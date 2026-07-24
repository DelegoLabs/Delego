import { createLogger } from "@delego/utils";
import { escrowService } from "../escrow/index.js";
import { getTransactionFeeEstimate } from "../escrow/wallet-client.js";
import { publishPaymentEvent } from "../events/index.js";

const log = createLogger("payments:settlement", process.env.LOG_LEVEL ?? "info");

export interface SettlementCommand {
  orderId: string;
  escrowId: string;
  releaseTo: string;
  amountStroops: string;
  deliveryProofId: string;
}

export interface SettlementResult {
  orderId: string;
  txHash: string;
  status: "submitted" | "confirmed" | "failed";
}

export interface SettlementDryRunResult {
  orderId: string;
  canSettle: boolean;
  simulationFee?: string;
  reason?: string;
}

/**
 * Dry-run settlement validation and simulation path.
 * Validates settlement inputs and simulates fee estimation without submitting
 * transactions to the wallet/ledger queue or publishing completion events.
 */
export async function dryRunSettlement(
  orderIdOrCommand: string | Partial<SettlementCommand>
): Promise<SettlementDryRunResult> {
  const orderId =
    typeof orderIdOrCommand === "string"
      ? orderIdOrCommand.trim()
      : orderIdOrCommand?.orderId?.trim() ?? "";

  log.info("Starting settlement dry-run simulation", { orderId });

  if (!orderId) {
    return {
      orderId: "",
      canSettle: false,
      reason: "Invalid or missing order ID",
    };
  }

  const sourceAddress = process.env.SETTLEMENT_SOURCE_ADDRESS;
  if (!sourceAddress) {
    log.warn("Dry-run failed: missing SETTLEMENT_SOURCE_ADDRESS", { orderId });
    return {
      orderId,
      canSettle: false,
      reason: "SETTLEMENT_SOURCE_ADDRESS environment variable is not configured",
    };
  }

  try {
    const escrowId =
      (typeof orderIdOrCommand === "object" && orderIdOrCommand.escrowId) ||
      (await resolveEscrowForOrder(orderId));
    const releaseTo =
      (typeof orderIdOrCommand === "object" && orderIdOrCommand.releaseTo) ||
      (await resolveReleaseAddress(orderId));
    const amountStroops =
      (typeof orderIdOrCommand === "object" && orderIdOrCommand.amountStroops) ||
      (await resolveSettlementAmount(orderId));

    if (!escrowId || escrowId.trim() === "") {
      return {
        orderId,
        canSettle: false,
        reason: "Invalid or missing escrow ID",
      };
    }

    // Simulate transaction fee estimation without submitting transaction to queue
    const feeEstimate = await getTransactionFeeEstimate();
    const simulationFee = String(feeEstimate.recommendedFeeStroops);

    log.info("Settlement dry-run simulation successful", {
      orderId,
      escrowId,
      releaseTo,
      amountStroops,
      simulationFee,
    });

    return {
      orderId,
      canSettle: true,
      simulationFee,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.error("Settlement dry-run simulation failed", {
      orderId,
      error: reason,
    });
    return {
      orderId,
      canSettle: false,
      reason,
    };
  }
}

export async function settleOrder(_orderId: string): Promise<void> {
  throw new Error("Not implemented — TODO: settlement flow");
}

export async function coordinateSettlement(orderId: string): Promise<void> {
  log.info("Starting settlement coordination", { orderId });

  let ledgerResult: Awaited<ReturnType<typeof escrowService.release>> | null =
    null;

  try {
    const escrowId = await resolveEscrowForOrder(orderId);
    const releaseTo = await resolveReleaseAddress(orderId);
    const amountStroops = await resolveSettlementAmount(orderId);

    log.info("Releasing escrow funds", {
      orderId,
      escrowId,
      releaseTo,
      amountStroops,
    });

    const sourceAddress = process.env.SETTLEMENT_SOURCE_ADDRESS;
    if (!sourceAddress) {
      throw new Error(
        "SETTLEMENT_SOURCE_ADDRESS environment variable is not configured"
      );
    }

    // ── Ledger release (critical path) ──────────────────────────────────────
    // Any error here is fatal and should propagate to the caller.
    ledgerResult = await escrowService.release({ sourceAddress, escrowId });

    log.info("Settlement release submitted to ledger", {
      orderId,
      escrowId,
      txHash: ledgerResult.txHash,
    });

    // ── Event publish (non-critical, fire-and-forget) ────────────────────────
    // The funds have already moved on-chain.  A transient Redis failure must
    // NOT propagate back as a settlement failure — that would cause callers to
    // retry the ledger release and double-spend.  We log the error and move on.
    publishPaymentEvent({
      type: "settlement_complete",
      orderId,
      payload: {
        escrowId,
        releaseTo,
        amountStroops,
        txHash: ledgerResult.txHash,
      },
      occurredAt: new Date().toISOString(),
    }).catch((err) =>
      log.error("Settlement event publish failed (non-fatal)", {
        orderId,
        error: err instanceof Error ? err.message : String(err),
      })
    );

    log.info("Settlement coordination completed successfully", {
      orderId,
      txHash: ledgerResult.txHash,
    });
  } catch (err) {
    log.error("Settlement coordination failed", {
      orderId,
      error: err instanceof Error ? err.message : "Unknown error",
    });

    // Only emit a failure event when the ledger release itself failed
    // (i.e. ledgerResult is still null).  If we already have a txHash, the
    // funds moved and the failure is in downstream logic — don't mislead
    // consumers with a "failed" settlement event.
    if (!ledgerResult) {
      publishPaymentEvent({
        type: "settlement_complete",
        orderId,
        payload: {
          error: err instanceof Error ? err.message : "Unknown error",
          status: "failed",
        },
        occurredAt: new Date().toISOString(),
      }).catch((publishErr) =>
        log.error("Settlement failure event publish failed", {
          orderId,
          error:
            publishErr instanceof Error
              ? publishErr.message
              : String(publishErr),
        })
      );
    }

    throw err;
  }
}

async function resolveEscrowForOrder(orderId: string): Promise<string> {
  return `${orderId}`;
}

async function resolveReleaseAddress(orderId: string): Promise<string> {
  return process.env.SETTLEMENT_RELEASE_ADDRESS ?? orderId;
}

async function resolveSettlementAmount(_orderId: string): Promise<string> {
  return "0";
}

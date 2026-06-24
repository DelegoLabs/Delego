import { createLogger } from "@delego/utils";
import { escrowService } from "../escrow/index.js";
import { emitPaymentEvent } from "../events/index.js";
import { getEscrowContractId } from "../escrow/config.js";
import { submitContractCall } from "../escrow/wallet-client.js";

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

export async function settleOrder(_orderId: string): Promise<void> {
  throw new Error("Not implemented — TODO: settlement flow");
}

export async function coordinateSettlement(orderId: string): Promise<void> {
  log.info("Starting settlement coordination", { orderId });

  try {
    const escrowId = await resolveEscrowForOrder(orderId);
    const releaseTo = await resolveReleaseAddress(orderId);
    const amountStroops = await resolveSettlementAmount(orderId);

    log.info("Releasing escrow funds", { orderId, escrowId, releaseTo, amountStroops });

    const sourceAddress = process.env.SETTLEMENT_SOURCE_ADDRESS;
    if (!sourceAddress) {
      throw new Error("SETTLEMENT_SOURCE_ADDRESS environment variable is not configured");
    }

    const result = await escrowService.release({
      sourceAddress,
      escrowId,
    });

    log.info("Settlement release submitted to ledger", {
      orderId,
      escrowId,
      txHash: result.txHash,
    });

    emitPaymentEvent({
      type: "settlement_complete",
      orderId,
      timestamp: new Date().toISOString(),
      payload: {
        escrowId,
        releaseTo,
        amountStroops,
        txHash: result.txHash,
      },
    });

    log.info("Settlement coordination completed successfully", { orderId, txHash: result.txHash });
  } catch (err) {
    log.error("Settlement coordination failed", {
      orderId,
      error: err instanceof Error ? err.message : "Unknown error",
    });

    emitPaymentEvent({
      type: "settlement_complete",
      orderId,
      timestamp: new Date().toISOString(),
      payload: {
        error: err instanceof Error ? err.message : "Unknown error",
        status: "failed",
      },
    });

    throw err;
  }
}

async function resolveEscrowForOrder(orderId: string): Promise<string> {
  const escrowId = `${orderId}`;
  return escrowId;
}

async function resolveReleaseAddress(orderId: string): Promise<string> {
  const releaseTo = process.env.SETTLEMENT_RELEASE_ADDRESS;
  if (!releaseTo) {
    return orderId;
  }
  return releaseTo;
}

async function resolveSettlementAmount(orderId: string): Promise<string> {
  return "0";
}

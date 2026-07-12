import { createLogger } from "@delego/utils";
import {
  extractEscrowIdFromTx,
  getContractReadSourceAddress,
  mapChainEscrowStatus,
  orderIdToContractBytes,
  readEscrowFromChain,
  submitContractInvocation,
} from "./contractClient.js";
import {
  createPaymentRecord,
  findPaymentRecordByEscrowId,
  findPaymentRecordByOrderId,
  updatePaymentRecord,
} from "./paymentRecordStore.js";
import { publishPaymentStatusEvent } from "./redisEvents.js";
import type {
  EscrowCoordinator,
  EscrowStatusResult,
  FundEscrowParams,
  FundEscrowResult,
  PaymentRecord,
  RefundEscrowParams,
  RefundResult,
  ReleaseEscrowParams,
  ReleaseResult,
} from "./types.js";

const log = createLogger("payments:escrow-coordinator", process.env.LOG_LEVEL ?? "info");

function parseEscrowId(escrowId: string): number {
  const id = Number(escrowId);
  if (!Number.isInteger(id) || id < 0) {
    throw new Error(`Invalid escrow ID: ${escrowId}`);
  }
  return id;
}

function toFundResult(record: PaymentRecord, ledger = 0): FundEscrowResult {
  const funded =
    record.status === "funded" ||
    record.status === "released" ||
    record.status === "refunded" ||
    Boolean(record.fundTxHash);

  return {
    escrowId: record.escrowId ?? "",
    txHash: record.fundTxHash ?? "",
    ledger,
    status: funded ? "funded" : "failed",
  };
}

function toEscrowStatusResult(
  escrowId: string,
  buyer: string,
  seller: string,
  amount: string,
  status: EscrowStatusResult["status"],
  createdAt: number
): EscrowStatusResult {
  return { escrowId, buyer, seller, amount, status, createdAt };
}

function mapRecordStatusToEscrowStatus(
  status: PaymentRecord["status"]
): EscrowStatusResult["status"] | null {
  switch (status) {
    case "funded":
      return "funded";
    case "released":
      return "released";
    case "refunded":
      return "refunded";
    default:
      return null;
  }
}

async function emitStatusEvent(
  channel: "payment:funded" | "payment:released" | "payment:refunded" | "payment:failed",
  record: PaymentRecord,
  txHash?: string,
  reason?: string
): Promise<void> {
  await publishPaymentStatusEvent(channel, {
    orderId: record.orderId,
    escrowId: record.escrowId ?? undefined,
    txHash,
    status: record.status,
    reason,
    occurredAt: new Date().toISOString(),
  });
}

export const escrowCoordinator: EscrowCoordinator = {
  async fundEscrow(params: FundEscrowParams): Promise<FundEscrowResult> {
    const existing = await findPaymentRecordByOrderId(params.orderId);
    if (existing) {
      log.info("Returning existing payment record for duplicate fund request", {
        orderId: params.orderId,
        paymentRecordId: existing.id,
      });
      return toFundResult(existing);
    }

    let record = await createPaymentRecord({
      orderId: params.orderId,
      escrowContractId: params.escrowContractId,
      buyerAddress: params.buyerAddress,
      sellerAddress: params.sellerAddress,
      tokenContractId: params.tokenContractId,
      amountStroops: params.amountStroops,
    });

    try {
      const tx = await submitContractInvocation({
        sourceAddress: params.buyerAddress,
        contractId: params.escrowContractId,
        method: "deposit",
        args: [
          params.buyerAddress,
          params.sellerAddress,
          params.tokenContractId,
          params.amountStroops,
          orderIdToContractBytes(params.orderId),
          params.timeoutLedgers,
        ],
        memo: `Fund escrow for order ${params.orderId}`,
        amountStroops: params.amountStroops,
      });

      if (!tx.success) {
        record = await updatePaymentRecord(record.id, {
          status: "failed",
          failureReason: "Fund transaction failed on-chain",
        });
        await emitStatusEvent("payment:failed", record, tx.hash, "Fund transaction failed on-chain");
        return {
          escrowId: "",
          txHash: tx.hash,
          ledger: tx.ledger,
          status: "failed",
        };
      }

      const escrowId = await extractEscrowIdFromTx(tx.hash);
      record = await updatePaymentRecord(record.id, {
        escrowId,
        status: "funded",
        fundTxHash: tx.hash,
        failureReason: null,
      });
      await emitStatusEvent("payment:funded", record, tx.hash);

      return {
        escrowId,
        txHash: tx.hash,
        ledger: tx.ledger,
        status: "funded",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown fund error";
      log.error("Escrow fund failed", { orderId: params.orderId, error: message });
      record = await updatePaymentRecord(record.id, {
        status: "failed",
        failureReason: message,
      });
      await emitStatusEvent("payment:failed", record, undefined, message);
      return {
        escrowId: record.escrowId ?? "",
        txHash: record.fundTxHash ?? "",
        ledger: 0,
        status: "failed",
      };
    }
  },

  async releaseEscrow(params: ReleaseEscrowParams): Promise<ReleaseResult> {
    const record = await findPaymentRecordByEscrowId(params.escrowId);
    if (!record) {
      throw new Error(`Payment record not found for escrow ${params.escrowId}`);
    }

    if (record.status === "released" && record.releaseTxHash) {
      return {
        txHash: record.releaseTxHash,
        ledger: 0,
        status: "released",
        sellerAddress: record.sellerAddress,
        amount: record.amountStroops,
      };
    }

    await updatePaymentRecord(record.id, { failureReason: null });

    try {
      const tx = await submitContractInvocation({
        sourceAddress: params.callerAddress,
        contractId: params.escrowContractId,
        method: "release",
        args: [parseEscrowId(params.escrowId), params.callerAddress],
        memo: `Release escrow ${params.escrowId}`,
      });

      if (!tx.success) {
        const updated = await updatePaymentRecord(record.id, {
          status: "failed",
          failureReason: "Release transaction failed on-chain",
        });
        await emitStatusEvent("payment:failed", updated, tx.hash, "Release transaction failed on-chain");
        return {
          txHash: tx.hash,
          ledger: tx.ledger,
          status: "failed",
          sellerAddress: record.sellerAddress,
          amount: record.amountStroops,
        };
      }

      const updated = await updatePaymentRecord(record.id, {
        status: "released",
        releaseTxHash: tx.hash,
        failureReason: null,
      });
      await emitStatusEvent("payment:released", updated, tx.hash);

      return {
        txHash: tx.hash,
        ledger: tx.ledger,
        status: "released",
        sellerAddress: record.sellerAddress,
        amount: record.amountStroops,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown release error";
      log.error("Escrow release failed", { escrowId: params.escrowId, error: message });
      const updated = await updatePaymentRecord(record.id, {
        status: "failed",
        failureReason: message,
      });
      await emitStatusEvent("payment:failed", updated, undefined, message);
      return {
        txHash: record.releaseTxHash ?? "",
        ledger: 0,
        status: "failed",
        sellerAddress: record.sellerAddress,
        amount: record.amountStroops,
      };
    }
  },

  async refundEscrow(params: RefundEscrowParams): Promise<RefundResult> {
    const record = await findPaymentRecordByEscrowId(params.escrowId);
    if (!record) {
      throw new Error(`Payment record not found for escrow ${params.escrowId}`);
    }

    if (record.status === "refunded" && record.refundTxHash) {
      return {
        txHash: record.refundTxHash,
        ledger: 0,
        status: "refunded",
        buyerAddress: record.buyerAddress,
        amount: record.amountStroops,
      };
    }

    await updatePaymentRecord(record.id, { failureReason: null });

    try {
      const tx = await submitContractInvocation({
        sourceAddress: params.callerAddress,
        contractId: params.escrowContractId,
        method: "refund",
        args: [parseEscrowId(params.escrowId), params.callerAddress],
        memo: `Refund escrow ${params.escrowId} (${params.reason})`,
      });

      if (!tx.success) {
        const updated = await updatePaymentRecord(record.id, {
          status: "failed",
          failureReason: "Refund transaction failed on-chain",
        });
        await emitStatusEvent(
          "payment:failed",
          updated,
          tx.hash,
          `Refund transaction failed on-chain (${params.reason})`
        );
        return {
          txHash: tx.hash,
          ledger: tx.ledger,
          status: "failed",
          buyerAddress: record.buyerAddress,
          amount: record.amountStroops,
        };
      }

      const updated = await updatePaymentRecord(record.id, {
        status: "refunded",
        refundTxHash: tx.hash,
        failureReason: null,
      });
      await emitStatusEvent("payment:refunded", updated, tx.hash);

      return {
        txHash: tx.hash,
        ledger: tx.ledger,
        status: "refunded",
        buyerAddress: record.buyerAddress,
        amount: record.amountStroops,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown refund error";
      log.error("Escrow refund failed", {
        escrowId: params.escrowId,
        reason: params.reason,
        error: message,
      });
      const updated = await updatePaymentRecord(record.id, {
        status: "failed",
        failureReason: message,
      });
      await emitStatusEvent("payment:failed", updated, undefined, message);
      return {
        txHash: record.refundTxHash ?? "",
        ledger: 0,
        status: "failed",
        buyerAddress: record.buyerAddress,
        amount: record.amountStroops,
      };
    }
  },

  async getEscrowStatus(escrowId: string): Promise<EscrowStatusResult> {
    const record = await findPaymentRecordByEscrowId(escrowId);
    if (record) {
      const mapped = mapRecordStatusToEscrowStatus(record.status);
      if (mapped) {
        return toEscrowStatusResult(
          escrowId,
          record.buyerAddress,
          record.sellerAddress,
          record.amountStroops,
          mapped,
          Math.floor(record.createdAt.getTime() / 1000)
        );
      }
    }

    const contractId = record?.escrowContractId ?? process.env.ESCROW_CONTRACT_ID;
    if (!contractId) {
      throw new Error("ESCROW_CONTRACT_ID is not configured");
    }

    const sourceAddress = getContractReadSourceAddress(record?.buyerAddress);
    const onChain = await readEscrowFromChain(contractId, escrowId, sourceAddress);

    return toEscrowStatusResult(
      String(onChain.escrow_id),
      onChain.buyer,
      onChain.seller,
      String(onChain.amount),
      mapChainEscrowStatus(onChain.status),
      Number(onChain.created_at)
    );
  },
};

export type {
  EscrowCoordinator,
  EscrowStatusResult,
  FundEscrowParams,
  FundEscrowResult,
  RefundEscrowParams,
  RefundResult,
  ReleaseEscrowParams,
  ReleaseResult,
} from "./types.js";

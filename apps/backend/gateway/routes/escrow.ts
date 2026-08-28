import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@delego/utils";
import { EscrowFeeConfig } from "../src/models/EscrowFeeConfig.js";
import {
  getEscrowRecord,
  getReleaseEligibility,
  type ContractEscrowStatus,
} from "../src/soroban/escrowContract.js";

const G_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function toEscrowStatus(status: ContractEscrowStatus): "active" | "released" | "refunded" | "disputed" {
  switch (status) {
    case "Active":
      return "active";
    case "Released":
      return "released";
    case "Refunded":
      return "refunded";
    case "Disputed":
      return "disputed";
  }
}

function parseEscrowId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export interface FeeBreakdownResponse {
  grossStroops: string;
  feeStroops: string | null;
  feeBasisPoints: number | null;
  isEstimated: boolean;
  netStroops: string | null;
  treasuries: Array<{ name: string; address: string; splitBasisPoints: number; amountStroops: string }>;
}

export interface FeeConfigInput {
  feeBasisPoints: number | null;
  isDynamic: boolean;
  treasuries: Array<{ name: string; address: string; splitBasisPoints: number }>;
}

/** Never renders a false-precision "0" — feeStroops/netStroops stay null when fee config is missing or dynamic */
export function computeFeeBreakdown(grossStroops: bigint, config: FeeConfigInput | null): FeeBreakdownResponse {
  const isEstimated = config?.isDynamic ?? false;
  const hasStaticFee = Boolean(config) && !config!.isDynamic && config!.feeBasisPoints !== null;

  if (!hasStaticFee) {
    return {
      grossStroops: grossStroops.toString(),
      feeStroops: null,
      feeBasisPoints: null,
      isEstimated,
      netStroops: null,
      treasuries: [],
    };
  }

  const feeBasisPoints = config!.feeBasisPoints as number;
  const feeStroops = (grossStroops * BigInt(feeBasisPoints)) / 10000n;
  const netStroops = grossStroops - feeStroops;
  const treasuries = (config!.treasuries ?? []).map((t) => ({
    name: t.name,
    address: t.address,
    splitBasisPoints: t.splitBasisPoints,
    amountStroops: ((feeStroops * BigInt(t.splitBasisPoints)) / 10000n).toString(),
  }));

  return {
    grossStroops: grossStroops.toString(),
    feeStroops: feeStroops.toString(),
    feeBasisPoints,
    isEstimated: false,
    netStroops: netStroops.toString(),
    treasuries,
  };
}

export async function getEscrowDetailHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  try {
    const escrowId = parseEscrowId(params.escrowId);
    if (escrowId === null) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "escrowId must be a non-negative integer" } });
      return;
    }

    const record = await getEscrowRecord(escrowId);
    const feeConfig = await EscrowFeeConfig.findOne({ where: { token: record.token } });

    json(res, 200, {
      data: {
        escrowId: escrowId.toString(),
        orderId: null,
        buyer: record.buyer,
        seller: record.seller,
        token: record.token,
        status: toEscrowStatus(record.status),
        unlockTime: new Date(Number(record.unlockTime) * 1000).toISOString(),
        fees: computeFeeBreakdown(record.amount, feeConfig),
      },
      error: null,
    });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

export interface ReleaseEligibilityInput {
  isAuthorizedCaller: boolean;
  alreadyReleased: boolean;
  invalidStatus: boolean;
}

/** Derives the exact unmet-condition reason codes, mirroring release()'s own checks */
export function deriveIneligibilityReasons(elig: ReleaseEligibilityInput): string[] {
  const reasons: string[] = [];
  if (!elig.isAuthorizedCaller) reasons.push("unauthorized_caller");
  if (elig.alreadyReleased) reasons.push("already_released");
  if (elig.invalidStatus && !elig.alreadyReleased) reasons.push("invalid_status");
  return reasons;
}

export async function getReleaseEligibilityHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  try {
    const escrowId = parseEscrowId(params.escrowId);
    if (escrowId === null) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "escrowId must be a non-negative integer" } });
      return;
    }

    const url = new URL(req.url ?? "", "http://internal");
    const caller = url.searchParams.get("caller") ?? "";
    if (!G_ADDRESS_RE.test(caller)) {
      json(res, 400, { data: null, error: { code: "VALIDATION_ERROR", message: "caller must be a valid Stellar account address" } });
      return;
    }

    const elig = await getReleaseEligibility(escrowId, caller);
    const reasons = deriveIneligibilityReasons(elig);

    const nowSeconds = Number(elig.currentTime);
    const unlockSeconds = Number(elig.unlockTime);
    const buyerRefundSecondsRemaining = Math.max(0, unlockSeconds - nowSeconds);

    json(res, 200, {
      data: {
        escrowId: escrowId.toString(),
        eligible: elig.eligible,
        status: toEscrowStatus(elig.status),
        isAuthorizedCaller: elig.isAuthorizedCaller,
        reasons,
        buyerRefundUnlockTime: new Date(unlockSeconds * 1000).toISOString(),
        buyerRefundSecondsRemaining,
        checkedAt: new Date(nowSeconds * 1000).toISOString(),
      },
      error: null,
    });
  } catch (err: any) {
    json(res, 500, { data: null, error: { code: "INTERNAL_ERROR", message: err.message } });
  }
}

import type { ApprovalSignature, DualControlState } from "@delegolabs/types";

/**
 * Pure state machine for dual-control approvals (#574): behind the
 * DUAL_CONTROL_APPROVALS feature flag, orders above a configurable
 * threshold require two distinct signers before they execute. Kept
 * side-effect free — the server remains the source of truth for what
 * actually executes; this only decides what the UI should show and
 * whether a given signer may act, so it can be unit tested without a
 * network round trip.
 */

/** Whether `totalStroops` requires dual control, given the flag and threshold. */
export function isDualControlRequired(
  totalStroops: bigint,
  thresholdStroops: bigint,
  flagEnabled: boolean
): boolean {
  return flagEnabled && totalStroops >= thresholdStroops;
}

/** Records the first approval, transitioning into "awaiting countersign". */
export function applyFirstApproval(
  approverId: string,
  approverAddress: string | undefined,
  timestamp: string,
  delegationOwners: string[] = []
): DualControlState {
  return {
    required: true,
    status: "awaiting_countersign",
    delegationOwners,
    firstApproval: { approverId, approverAddress, timestamp },
  };
}

export interface CountersignCheck {
  allowed: boolean;
  reason?: string;
}

/** Shown to the first approver explaining why they can't complete the action alone. */
export const SELF_COUNTERSIGN_MESSAGE =
  "Waiting for secondary countersignature from an authorized delegate";

/**
 * Whether `signerId` may provide the second signature: must be a different
 * identity than the first approver, and — when a delegation owner list is
 * present — must be on it.
 */
export function canCountersign(
  dualControl: DualControlState,
  signerId: string
): CountersignCheck {
  if (dualControl.status !== "awaiting_countersign" || !dualControl.firstApproval) {
    return { allowed: false, reason: "No approval is awaiting a countersignature." };
  }
  if (dualControl.firstApproval.approverId === signerId) {
    return { allowed: false, reason: SELF_COUNTERSIGN_MESSAGE };
  }
  if (
    dualControl.delegationOwners &&
    dualControl.delegationOwners.length > 0 &&
    !dualControl.delegationOwners.includes(signerId)
  ) {
    return { allowed: false, reason: "Not an authorized delegate for this delegation." };
  }
  return { allowed: true };
}

/** Records the second approval, completing the dual-control flow. */
export function applySecondApproval(
  dualControl: DualControlState,
  signerId: string,
  signerAddress: string | undefined,
  timestamp: string
): DualControlState {
  const signature: ApprovalSignature = {
    approverId: signerId,
    approverAddress: signerAddress,
    timestamp,
  };
  return { ...dualControl, status: "completed", secondApproval: signature };
}

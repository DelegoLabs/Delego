import type { SnapshotValidationResult, WorkflowSnapshot } from "./types.js";

const VALID_STATES = new Set([
  "Discovery",
  "SpendingCheck",
  "UserApprovalPending",
  "EscrowLocking",
  "MerchantFulfillment",
  "DeliveryVerification",
  "Completed",
  "Refunded",
]);

export const SNAPSHOT_VERSION = 1;

export function validateSnapshot(snapshot: unknown): SnapshotValidationResult {
  const errors: string[] = [];

  if (typeof snapshot !== "object" || snapshot === null) {
    return { valid: false, errors: ["snapshot must be a non-null object"] };
  }

  const s = snapshot as Record<string, unknown>;

  if (!s["workflowId"] || typeof s["workflowId"] !== "string") {
    errors.push("missing or invalid field: workflowId");
  }

  if (!s["currentState"] || !VALID_STATES.has(s["currentState"] as string)) {
    errors.push(`missing or invalid field: currentState (got ${JSON.stringify(s["currentState"])})`);
  }

  if (typeof s["context"] !== "object" || s["context"] === null) {
    errors.push("missing or invalid field: context");
  } else {
    const ctx = s["context"] as Record<string, unknown>;
    for (const field of ["workflowId", "delegationId", "userId"]) {
      if (!ctx[field] || typeof ctx[field] !== "string") {
        errors.push(`missing or invalid context field: ${field}`);
      }
    }
  }

  if (!Array.isArray(s["history"])) {
    errors.push("missing or invalid field: history");
  }

  if (s["version"] !== SNAPSHOT_VERSION) {
    errors.push(`unsupported snapshot version: expected ${SNAPSHOT_VERSION}, got ${JSON.stringify(s["version"])}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Throws a descriptive error if the snapshot is invalid, preventing a corrupt
 * state machine from being booted during crash recovery.
 */
export function assertValidSnapshot(snapshot: unknown): asserts snapshot is WorkflowSnapshot {
  const result = validateSnapshot(snapshot);
  if (!result.valid) {
    throw new Error(`Invalid workflow snapshot — quarantined: ${result.errors.join("; ")}`);
  }
}

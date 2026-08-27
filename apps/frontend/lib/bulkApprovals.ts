import type { Order } from "@delegolabs/types";
import { needsApproval } from "./orders";
import { runBatch, type BatchItemResult, type BatchRunnerOptions } from "./batchRunner";

/**
 * Bulk approve/reject for the approvals queue, built on the same
 * `runBatch` utility as the escrow batch actions (#582) — one shared
 * concurrency-capped, error-isolated runner behind both surfaces instead of
 * a bespoke bulk loop per screen.
 */

export interface BulkApprovalActions {
  approve: (id: string) => Promise<Order | null>;
  reject: (id: string, reason?: string) => Promise<Order | null>;
}

export type BulkApprovalOptions = Pick<
  BatchRunnerOptions<Order, Order | null>,
  "concurrency" | "onItemSettled"
>;

function eligibility(order: Order) {
  return needsApproval(order)
    ? { eligible: true as const }
    : { eligible: false as const, reason: "Not pending approval" };
}

/** Approves every eligible order in `orders`; ineligible orders are skipped with a reason, failures isolated per item. */
export function runBulkApprove(
  orders: Order[],
  actions: BulkApprovalActions,
  options: BulkApprovalOptions = {}
): Promise<BatchItemResult<Order, Order | null>[]> {
  return runBatch(orders, (order) => actions.approve(order.id), {
    ...options,
    isEligible: eligibility,
  });
}

/** Rejects every eligible order in `orders` with the same optional `reason`; ineligible orders are skipped with a reason, failures isolated per item. */
export function runBulkReject(
  orders: Order[],
  actions: BulkApprovalActions,
  reason: string | undefined,
  options: BulkApprovalOptions = {}
): Promise<BatchItemResult<Order, Order | null>[]> {
  return runBatch(orders, (order) => actions.reject(order.id, reason), {
    ...options,
    isEligible: eligibility,
  });
}

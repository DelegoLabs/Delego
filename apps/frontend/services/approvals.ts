import type { ApiResponse, Order } from "@delegolabs/types";
import { env } from "../lib/env";

/**
 * Thin client for the dual-control-aware approval submission (#574). The
 * ordinary single-approval path continues to go through the existing
 * `useOrders` / generated-SDK flow unchanged; this is used specifically for
 * the dual-control branch, where the caller's identity (the connected
 * wallet address) needs to travel with the request so the server can decide
 * whether this is the first or second signature.
 */

const BASE_URL = env.NEXT_PUBLIC_API_URL;

async function post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResponse<T>;
    if (!res.ok && !json.error) {
      return {
        data: null,
        error: { code: String(res.status), message: res.statusText || "Request failed" },
      };
    }
    return json;
  } catch (err) {
    return {
      data: null,
      error: {
        code: "network_error",
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }
}

/**
 * Submits an approval (or countersignature) for `orderId` as `approverAddress`.
 *
 * `note` (#573) is only included in the request body when the caller passes
 * one — sites that haven't confirmed `approvalNoteSupported` via
 * `detectApprovalNoteCapability` should omit it and keep the note local-only.
 */
export function submitApproval(
  orderId: string,
  approverAddress: string,
  note?: string
): Promise<ApiResponse<Order>> {
  return post(`/orders/${orderId}/approve`, {
    approverAddress,
    ...(note ? { approvalNote: note } : {}),
  });
}

/** Submits a rejection for `orderId` as `approverAddress`. */
export function submitRejection(
  orderId: string,
  approverAddress: string,
  reason?: string
): Promise<ApiResponse<Order>> {
  return post(`/orders/${orderId}/reject`, { approverAddress, reason });
}

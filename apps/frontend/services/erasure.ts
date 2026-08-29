import type { ApiResponse, ErasureRequest } from "@delegolabs/types";
import { env } from "../lib/env";

/**
 * Thin client for the server-side data-erasure request lifecycle (#610).
 * Only exists once `detectDataErasureCapability` (services/payments.ts)
 * confirms the backend advertises support — callers should feature-detect
 * before offering the server tier at all. Never throws; always resolves
 * with an `ApiResponse` so a network failure and a server-reported error
 * are handled uniformly by the caller.
 */

const BASE_URL = env.NEXT_PUBLIC_API_URL;

async function post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
 * Logs a full account-erasure request. Never destructive on its own — the
 * server confirms and starts the cooldown; the account isn't touched until
 * `finalizesAt` elapses without a cancellation.
 */
export function requestDataErasure(): Promise<ApiResponse<ErasureRequest>> {
  return post("/account/erasure", {});
}

/** Cancels a pending erasure request while still within its cooldown window. */
export function cancelDataErasure(): Promise<ApiResponse<ErasureRequest>> {
  return post("/account/erasure/cancel", {});
}

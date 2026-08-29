import type { ApiResponse, CancellationGrace, Escrow } from "@delegolabs/types";
import { env } from "../lib/env";

/**
 * Thin client for payments-adjacent escrow actions not yet covered by the
 * generated SDK (@delegolabs/api-generated): cancellation grace (#580) and
 * deadline extension requests (#577). Kept intentionally thin per
 * services/README — parsing/adapting belongs in lib/, this module only
 * knows how to call the endpoints and always resolves (never throws) with
 * an `ApiResponse`, so callers get a uniform error shape whether the
 * failure was a network error or a server-reported one.
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

async function get<T>(path: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
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

export interface CancelEscrowResponse {
  escrow: Escrow;
  cancellation: CancellationGrace;
}

/** Requests cancellation of an escrow; the response carries the server-issued grace window (#580). */
export function requestCancellation(
  escrowId: string
): Promise<ApiResponse<CancelEscrowResponse>> {
  return post(`/escrows/${escrowId}/cancel`, {});
}

/** Undoes an in-flight cancellation while still within its grace window. */
export function undoCancellation(escrowId: string): Promise<ApiResponse<Escrow>> {
  return post(`/escrows/${escrowId}/cancel/undo`, {});
}

/**
 * Finalizes a lapsed cancellation. Normally the server finalizes on its own
 * timer once the grace window elapses; the client also calls this so the UI
 * doesn't have to wait on a poll to reflect the terminal state, and so the
 * permanent timeline event lands promptly.
 */
export function finalizeCancellation(escrowId: string): Promise<ApiResponse<Escrow>> {
  return post(`/escrows/${escrowId}/cancel/finalize`, {});
}

export type ExtensionPreset = "+1d" | "+1w" | "+1m";

export interface ExtensionRequestResponse {
  escrow: Escrow;
  timelineEvent: { id: string; label: string; timestamp: string };
}

/** Submits a deadline extension request for an escrow (#577). */
export function requestExtension(
  escrowId: string,
  preset: ExtensionPreset
): Promise<ApiResponse<ExtensionRequestResponse>> {
  return post(`/escrows/${escrowId}/extend`, { preset });
}

/** Fetches the latest timeout metadata (originalDeadline, extensionsConsumed, ...) for an escrow. */
export function getEscrowExtensionMeta(escrowId: string): Promise<ApiResponse<Escrow>> {
  return get(`/escrows/${escrowId}`);
}

export interface DualControlCapability {
  dualControlApprovals?: boolean;
  /** Whether the API accepts an `approvalNote` field on the approve payload (#573). */
  approvalNoteSupported?: boolean;
  /** Whether the API exposes the server-side data-erasure request endpoints (#610). */
  dataErasureRequestSupported?: boolean;
}

/**
 * Best-effort capability probe (#574): whether the API exposes dual-control
 * approval endpoints/fields. Callers fall back to the standard
 * single-approval path whenever this resolves `false` — including on
 * network failure or a non-2xx response — so an outage degrades to the
 * already-shipped flow instead of blocking approvals.
 */
export async function detectDualControlCapability(): Promise<boolean> {
  const res = await get<DualControlCapability>("/capabilities");
  if (res.error || !res.data) return false;
  return Boolean(res.data.dualControlApprovals);
}

/**
 * Best-effort capability probe (#573): whether the API accepts an
 * `approvalNote` field on the approve payload. Resolves `false` on any
 * failure (network error, non-2xx, or the field simply not advertised),
 * so callers degrade to a local-only note display instead of sending a
 * field an older API might reject.
 */
export async function detectApprovalNoteCapability(): Promise<boolean> {
  const res = await get<DualControlCapability>("/capabilities");
  if (res.error || !res.data) return false;
  return Boolean(res.data.approvalNoteSupported);
}

/**
 * Best-effort capability probe (#610): whether the API exposes the
 * server-side data-erasure request endpoints. Resolves `false` on any
 * failure — network error, non-2xx, or the field simply not advertised —
 * so the erasure UI hides the server tier entirely rather than offering a
 * request the backend can't yet honor. The local-only "clear local data"
 * tier is unaffected either way; it never depends on this probe.
 */
export async function detectDataErasureCapability(): Promise<boolean> {
  const res = await get<DualControlCapability>("/capabilities");
  if (res.error || !res.data) return false;
  return Boolean(res.data.dataErasureRequestSupported);
}

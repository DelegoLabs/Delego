import { DelegoClient } from "@delegolabs/sdk";
import { env } from "./env";
import { isDemoMode } from "./demoMode";
import { apiFetch } from "./apiFetch";
import type { PurchaseProposal } from "../types/proposal";

/** Thrown when a mutating request is attempted while demo mode is active. */
export class DemoModeWriteBlockedError extends Error {
  constructor(method: string, url: string) {
    super(`Demo mode is read-only — blocked ${method} ${url}`);
    this.name = "DemoModeWriteBlockedError";
  }
}

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | null {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const dateMs = Date.parse(retryAfter);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function getBackoffDelayMs(
  attempt: number,
  response: Response | null,
  options: Required<RetryOptions>
) {
  const retryAfterMs = response ? parseRetryAfterMs(response) : null;
  if (retryAfterMs != null) return retryAfterMs;

  const exponential = options.baseDelayMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * options.baseDelayMs);
  return Math.min(options.maxDelayMs, exponential + jitter);
}

function shouldRetryResponse(response: Response) {
  return response.status === 429 || response.status >= 500;
}

export function createRetryingFetch(
  baseFetch?: typeof fetch,
  retryOptions: RetryOptions = {}
): typeof fetch {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };

  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();

    // Resolved per request rather than captured as a default parameter at
    // factory time. Most callers build their wrapper at module scope, which
    // runs before `server.listen()` installs MSW's fetch interceptor — binding
    // the global there would send every request to the real network and make
    // the mocked suites hit DNS instead of the handlers.
    const doFetch = baseFetch ?? globalThis.fetch;

    // Defense in depth (#632): the UI disables mutating controls in demo
    // mode, but every write is also rejected here regardless of how the
    // request was triggered — this is the one place all API calls funnel
    // through, so it's the backstop if a control is ever missed.
    if (method !== "GET" && isDemoMode()) {
      const url = typeof input === "string" ? input : input.toString();
      throw new DemoModeWriteBlockedError(method, url);
    }

    if (method !== "GET") return doFetch(input, init);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      try {
        const response = await doFetch(input, init);
        const hasMoreAttempts = attempt < options.attempts - 1;
        if (!hasMoreAttempts || !shouldRetryResponse(response)) {
          return response;
        }
        await sleep(getBackoffDelayMs(attempt, response, options));
      } catch (err) {
        lastError = err;
        const hasMoreAttempts = attempt < options.attempts - 1;
        if (!hasMoreAttempts) break;
        await sleep(getBackoffDelayMs(attempt, null, options));
      }
    }
    throw lastError;
  };
}

/**
 * Shared API client instance for the web app.
 *
 * Persists the auth token in localStorage (via the SDK's default storage)
 * and redirects to /login when a request comes back 401 (#405).
 *
 * Safe/idempotent GET requests are retried for transient failures (#509).
 */
export const api = new DelegoClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  fetch: createRetryingFetch(),
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  },
} as ConstructorParameters<typeof DelegoClient>[0] & { fetch?: typeof fetch });

/**
 * Approve a purchase proposal (#678). Triggers a 1-click escrow
 * authorisation on the backend.
 */
export async function approveProposal(proposalId: string) {
  return apiFetch<PurchaseProposal>(`/proposals/${proposalId}/approve`, {
    method: "POST",
  });
}

/**
 * Decline a purchase proposal (#678) with an optional free-text reason.
 */
export async function declineProposal(proposalId: string, reason?: string) {
  return apiFetch<PurchaseProposal>(`/proposals/${proposalId}/decline`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

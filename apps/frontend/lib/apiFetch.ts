import type { ApiResponse } from "@delegolabs/types";
import { env } from "./env";
import { isDemoMode } from "./demoMode";

/** Thrown when a mutating apiFetch call is attempted while demo mode is active. */
export class DemoModeWriteBlockedError extends Error {
  constructor(method: string, path: string) {
    super(`Demo mode is read-only — blocked ${method} ${path}`);
    this.name = "DemoModeWriteBlockedError";
  }
}

/**
 * Minimal JSON fetch helper for endpoints not yet exposed on the
 * `@delegolabs/sdk` client (disputes, contract versions). Mirrors the
 * `ApiResponse` envelope and demo-mode write guard from lib/api.ts so these
 * calls behave consistently with the rest of the app until the SDK exposes
 * typed methods for them.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && isDemoMode()) {
    throw new DemoModeWriteBlockedError(method, path);
  }

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });

  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok && !body.error) {
    return { data: null, error: { code: String(res.status), message: res.statusText } };
  }
  return body;
}

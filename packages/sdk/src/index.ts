/**
 * Local implementation of the `@delegolabs/sdk` client surface used by the
 * web app.
 *
 * The published SDK is served from GitHub Packages, which is unreachable for
 * pull requests opened from forks (the runner's token has no package access),
 * so the small surface this app depends on is vendored here as a workspace
 * package. It mirrors the public shape — `DelegoClient` plus `health`/
 * `getToken`/REST helpers — so existing call sites and tests are unaffected.
 *
 * Issue #1194: typed methods for delegations, escrows, subscriptions, and
 * user profile/preferences now replace the previous `[key: string]: any`
 * escape hatch.
 */

import type {
  Delegation,
  CreateDelegationInput,
  UpdateDelegationInput,
  Escrow,
  User,
  UserPreferences,
  ApiResponse,
} from "@delegolabs/types";

export type {
  Delegation,
  CreateDelegationInput,
  UpdateDelegationInput,
  Escrow,
  User,
  UserPreferences,
  ApiResponse,
};

// ─── Subscription types ───────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "expired"
  | "trial";

export type SubscriptionInterval = "daily" | "weekly" | "monthly" | "yearly";

export interface Subscription {
  id: string;
  userId: string;
  delegationId?: string;
  merchantId: string;
  label?: string;
  status: SubscriptionStatus;
  interval: SubscriptionInterval;
  /** Amount in stroops (string to avoid bigint serialisation issues). */
  amountStroops: string;
  currency: string;
  nextBillingAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSubscriptionInput {
  delegationId?: string;
  merchantId: string;
  label?: string;
  interval: SubscriptionInterval;
  amountStroops: string;
  currency: string;
  /** ISO-8601 timestamp of the first billing date. */
  startAt?: string;
}

export interface UpdateSubscriptionInput {
  status?: SubscriptionStatus;
  label?: string;
  interval?: SubscriptionInterval;
  amountStroops?: string;
}

// ─── Profile update types ─────────────────────────────────────────────────────

export interface UpdateProfileInput {
  name?: string;
  displayName?: string;
  walletAddress?: string;
  stellarAddress?: string;
}

export interface UpdatePreferencesInput {
  currency?: string;
  theme?: "light" | "dark" | "system";
  notificationsEnabled?: boolean;
  defaultSpendingLimit?: string | number;
  requireApproval?: boolean;
  notificationEmail?: boolean;
  notificationPush?: boolean;
}

// ─── Client config / options ──────────────────────────────────────────────────

const TOKEN_STORAGE_KEY = "delego.auth.token";

export interface DelegoClientConfig {
  /** Base URL of the Delego gateway. A trailing slash is ignored. */
  baseUrl?: string;
  /** Override the fetch implementation (e.g. the app's retrying fetch). */
  fetch?: typeof fetch;
  /** Invoked when a request comes back 401 so the app can redirect to login. */
  onUnauthorized?: () => void;
}

export class DelegoApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown
  ) {
    super(
      getErrorMessage(body) ??
        (`${status} ${statusText}`.trim() || `HTTP ${status}`)
    );
    this.name = "DelegoApiError";
  }
}

function getErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const record = body as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  return null;
}

export interface DelegoRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

// ─── DelegoClient ─────────────────────────────────────────────────────────────

export class DelegoClient {
  baseUrl: string;
  protectedFetch: typeof fetch;
  onUnauthorized?: () => void;

  constructor(config: DelegoClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "");
    this.protectedFetch =
      config.fetch ?? ((input, init) => fetch(input, init));
    this.onUnauthorized = config.onUnauthorized;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /** Current auth token, or `null` when signed out. */
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Persist (or clear) the auth token. */
  setToken(token: string | null): void {
    if (typeof window === "undefined") return;
    try {
      if (token === null) window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      else window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* Storage disabled — the token simply isn't persisted. */
    }
  }

  // ── Core request helper ────────────────────────────────────────────────────

  /**
   * Low-level request helper: joins the base URL, merges caller-supplied
   * `init.headers` (e.g. from `DelegoRequestOptions.headers`) with the auth
   * and content-type headers, then parses JSON.
   */
  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers ?? {});
    const token = this.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.protectedFetch(url, { ...init, headers });

    if (response.status === 401) this.onUnauthorized?.();
    if (!response.ok) {
      let body: unknown = null;
      if (typeof response.json === "function") {
        try {
          body = await response.json();
        } catch {
          // Keep the HTTP failure actionable even when the response body is invalid JSON.
        }
      }
      throw new DelegoApiError(response.status, response.statusText, body);
    }
    if (response.status === 204 || typeof response.json !== "function") {
      return null as T;
    }
    return response.json() as Promise<T>;
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  health(options: DelegoRequestOptions = {}): Promise<{ status: string }> {
    return this.request("/health", {
      method: "GET",
      signal: options.signal,
      headers: options.headers,
    });
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  getOrders(options: DelegoRequestOptions = {}): Promise<ApiResponse<import("@delegolabs/types").Order[]>> {
    return this.request("/orders", {
      method: "GET",
      signal: options.signal,
      headers: options.headers,
    });
  }

  getOrder(id: string, options: DelegoRequestOptions = {}): Promise<ApiResponse<import("@delegolabs/types").Order>> {
    return this.request(`/orders/${encodeURIComponent(id)}`, {
      method: "GET",
      signal: options.signal,
      headers: options.headers,
    });
  }

  approveOrder(id: string, options: DelegoRequestOptions = {}): Promise<ApiResponse<import("@delegolabs/types").Order>> {
    return this.request(`/orders/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      signal: options.signal,
      headers: options.headers,
    });
  }

  rejectOrder(
    id: string,
    options: { reason?: string; reasonCode?: string } & DelegoRequestOptions = {}
  ): Promise<ApiResponse<import("@delegolabs/types").Order>> {
    const { reason, reasonCode, ...restOptions } = options;
    return this.request(`/orders/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason, reasonCode }),
      signal: restOptions.signal,
      headers: restOptions.headers,
    });
  }

  // ── Delegations ────────────────────────────────────────────────────────────

  /** List all delegations for the authenticated user. */
  getDelegations(
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Delegation[]>> {
    return this.request<ApiResponse<Delegation[]>>("/delegations", {
      method: "GET",
      signal: options.signal,
      headers: options.headers,
    });
  }

  /** Retrieve a single delegation by id. */
  getDelegation(
    id: string,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Delegation>> {
    return this.request<ApiResponse<Delegation>>(
      `/delegations/${encodeURIComponent(id)}`,
      { method: "GET", signal: options.signal }
    );
  }

  /** Create a new delegation. */
  createDelegation(
    input: CreateDelegationInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Delegation>> {
    return this.request<ApiResponse<Delegation>>("/delegations", {
      method: "POST",
      body: JSON.stringify(input),
      signal: options.signal,
      headers: options.headers,
    });
  }

  /** Partially update an existing delegation. */
  updateDelegation(
    id: string,
    input: UpdateDelegationInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Delegation>> {
    return this.request<ApiResponse<Delegation>>(
      `/delegations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal: options.signal,
        headers: options.headers,
      }
    );
  }

  /** Revoke (delete) a delegation. Returns 204 — resolves to `null`. */
  revokeDelegation(
    id: string,
    options: DelegoRequestOptions = {}
  ): Promise<null> {
    return this.request<null>(`/delegations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: options.signal,
      headers: options.headers,
    });
  }

  // ── Escrows ────────────────────────────────────────────────────────────────

  /** List all escrows for the authenticated user. */
  getEscrows(
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Escrow[]>> {
    return this.request<ApiResponse<Escrow[]>>("/escrows", {
      method: "GET",
      signal: options.signal,
      headers: options.headers,
    });
  }

  /** Retrieve a single escrow by id. */
  getEscrow(
    id: string,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Escrow>> {
    return this.request<ApiResponse<Escrow>>(
      `/escrows/${encodeURIComponent(id)}`,
      { method: "GET", signal: options.signal }
    );
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  /** List all subscriptions for the authenticated user. */
  getSubscriptions(
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Subscription[]>> {
    return this.request<ApiResponse<Subscription[]>>("/subscriptions", {
      method: "GET",
      signal: options.signal,
    });
  }

  /** Retrieve a single subscription by id. */
  getSubscription(
    id: string,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Subscription>> {
    return this.request<ApiResponse<Subscription>>(
      `/subscriptions/${encodeURIComponent(id)}`,
      { method: "GET", signal: options.signal }
    );
  }

  /** Create a new subscription. */
  createSubscription(
    input: CreateSubscriptionInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Subscription>> {
    return this.request<ApiResponse<Subscription>>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(input),
      signal: options.signal,
    });
  }

  /** Partially update an existing subscription. */
  updateSubscription(
    id: string,
    input: UpdateSubscriptionInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<Subscription>> {
    return this.request<ApiResponse<Subscription>>(
      `/subscriptions/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
        signal: options.signal,
      }
    );
  }

  /** Cancel a subscription. Returns 204 — resolves to `null`. */
  cancelSubscription(
    id: string,
    options: DelegoRequestOptions = {}
  ): Promise<null> {
    return this.request<null>(`/subscriptions/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }

  // ── User profile & preferences ─────────────────────────────────────────────

  /** Retrieve the authenticated user's profile. */
  getProfile(options: DelegoRequestOptions = {}): Promise<ApiResponse<User>> {
    return this.request<ApiResponse<User>>("/me", {
      method: "GET",
      signal: options.signal,
    });
  }

  /** Partially update the authenticated user's profile. */
  updateProfile(
    input: UpdateProfileInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<User>> {
    return this.request<ApiResponse<User>>("/me", {
      method: "PATCH",
      body: JSON.stringify(input),
      signal: options.signal,
      headers: options.headers,
    });
  }

  /** Retrieve the authenticated user's preferences. */
  getPreferences(
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<UserPreferences>> {
    return this.request<ApiResponse<UserPreferences>>("/me/preferences", {
      method: "GET",
      signal: options.signal,
    });
  }

  /** Partially update the authenticated user's preferences. */
  updatePreferences(
    input: UpdatePreferencesInput,
    options: DelegoRequestOptions = {}
  ): Promise<ApiResponse<UserPreferences>> {
    return this.request<ApiResponse<UserPreferences>>("/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
      signal: options.signal,
      headers: options.headers,
    });
  }
}

export default DelegoClient;

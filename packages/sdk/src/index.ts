/**
 * Local implementation of the `@delegolabs/sdk` client surface used by the
 * web app.
 *
 * The published SDK is served from GitHub Packages, which is unreachable for
 * pull requests opened from forks (the runner's token has no package access),
 * so the small surface this app depends on is vendored here as a workspace
 * package. It mirrors the public shape — `DelegoClient` plus `health`/
 * `getToken`/REST helpers — so existing call sites and tests are unaffected.
 */

const TOKEN_STORAGE_KEY = "delego.auth.token";

export interface DelegoClientConfig {
  /** Base URL of the Delego gateway. A trailing slash is ignored. */
  baseUrl?: string;
  /** Override the fetch implementation (e.g. the app's retrying fetch). */
  fetch?: typeof fetch;
  /** Invoked when a request comes back 401 so the app can redirect to login. */
  onUnauthorized?: () => void;
}

export interface DelegoRequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export class DelegoClient {
  baseUrl: string;
  protectedFetch: typeof fetch;
  onUnauthorized?: () => void;

  /**
   * Call sites occasionally reach for gateway endpoints that are not modeled
   * here yet (the app also talks to REST directly via `lib/apiFetch`). The
   * index signature keeps those accesses type-safe at the call site.
   */
  [key: string]: any;

  constructor(config: DelegoClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "");
    this.protectedFetch =
      config.fetch ?? ((input, init) => fetch(input, init));
    this.onUnauthorized = config.onUnauthorized;
  }

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

  /** Low-level request helper: joins the base URL, adds auth, parses JSON. */
  async request(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init.headers ?? {});
    const token = this.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.protectedFetch(url, { ...init, headers });

    if (response.status === 401) this.onUnauthorized?.();
    if (response.status === 204 || typeof response.json !== "function") {
      return null;
    }
    return response.json();
  }

  health(options: DelegoRequestOptions = {}): Promise<any> {
    return this.request("/health", { method: "GET", signal: options.signal });
  }

  getOrders(options: DelegoRequestOptions = {}): Promise<any> {
    return this.request("/orders", { method: "GET", signal: options.signal });
  }

  getOrder(id: string, options: DelegoRequestOptions = {}): Promise<any> {
    return this.request(`/orders/${encodeURIComponent(id)}`, {
      method: "GET",
      signal: options.signal,
    });
  }

  approveOrder(id: string, options: DelegoRequestOptions = {}): Promise<any> {
    return this.request(`/orders/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      signal: options.signal,
    });
  }

  rejectOrder(
    id: string,
    reason?: string,
    reasonCode?: string,
    options: DelegoRequestOptions = {}
  ): Promise<any> {
    return this.request(`/orders/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason, reasonCode }),
      signal: options.signal,
    });
  }

  getDelegations(options: DelegoRequestOptions = {}): Promise<any> {
    return this.request("/delegations", {
      method: "GET",
      signal: options.signal,
    });
  }

  createDelegation(
    input: unknown,
    options: DelegoRequestOptions = {}
  ): Promise<any> {
    return this.request("/delegations", {
      method: "POST",
      body: JSON.stringify(input),
      signal: options.signal,
    });
  }

  updateDelegation(
    id: string,
    input: unknown,
    options: DelegoRequestOptions = {}
  ): Promise<any> {
    return this.request(`/delegations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
      signal: options.signal,
    });
  }

  revokeDelegation(id: string, options: DelegoRequestOptions = {}): Promise<any> {
    return this.request(`/delegations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: options.signal,
    });
  }

  getEscrows(options: DelegoRequestOptions = {}): Promise<any> {
    return this.request("/escrows", { method: "GET", signal: options.signal });
  }

  updatePreferences(
    input: unknown,
    options: DelegoRequestOptions = {}
  ): Promise<any> {
    return this.request("/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
      signal: options.signal,
    });
  }

  updateProfile(input: unknown, options: DelegoRequestOptions = {}): Promise<any> {
    return this.request("/me", {
      method: "PATCH",
      body: JSON.stringify(input),
      signal: options.signal,
    });
  }
}

export default DelegoClient;

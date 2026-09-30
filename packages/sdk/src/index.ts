// Stub @delegolabs/sdk — replaces the private GitHub Packages dependency
// for local development and CI environments without a GitHub token.
import type {
  ApiResponse,
  CreateDelegationInput,
  Delegation,
  Escrow,
  Order,
  UpdateDelegationInput,
} from "@delegolabs/types";

export interface DelegoClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
  onUnauthorized?: () => void;
  [key: string]: unknown;
}

/**
 * Minimal stub DelegoClient that performs real HTTP requests (intercepted by
 * MSW in tests) so the application code works end-to-end without the private
 * @delegolabs/sdk package.
 */
export class DelegoClient {
  private baseUrl: string;
  private _fetch: typeof fetch;
  private onUnauthorized?: () => void;
  private authToken: string | null = null;

  constructor(config: DelegoClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this._fetch = config.fetch ?? fetch;
    this.onUnauthorized = config.onUnauthorized;
  }

  /** Shared default instance used by `api` in the web app. */
  static defaultClient: DelegoClient | null = null;

  /** Auth token for the default client (null unless a token was set). */
  static get defaultToken(): string | null {
    return DelegoClient.defaultClient?.authToken ?? null;
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    signal?: AbortSignal
  ): Promise<ApiResponse<T>> {
    try {
      const res = await this._fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (res.status === 401) {
        this.onUnauthorized?.();
        return { data: null, error: { code: "unauthorized", message: "Unauthorized" } };
      }
      const json = (await res.json()) as ApiResponse<T>;
      return json;
    } catch (err) {
      return {
        data: null,
        error: {
          code: "network_error",
          message: err instanceof Error ? err.message : "Network error",
        },
      };
    }
  }

  /** GET /health — service heartbeat. */
  async health(): Promise<ApiResponse<{ status: string }>> {
    return this.request<{ status: string }>("/health", { method: "GET" });
  }

  /** GET /orders */
  async getOrders(options?: { signal?: AbortSignal }): Promise<ApiResponse<Order[]>> {
    return this.request<Order[]>("/orders", { method: "GET" }, options?.signal);
  }

  /** GET /escrows */
  async getEscrows(options?: { signal?: AbortSignal }): Promise<ApiResponse<Escrow[]>> {
    return this.request<Escrow[]>("/escrows", { method: "GET" }, options?.signal);
  }

  /** GET /delegations */
  async getDelegations(options?: { signal?: AbortSignal }): Promise<ApiResponse<Delegation[]>> {
    return this.request<Delegation[]>("/delegations", { method: "GET" }, options?.signal);
  }

  /** POST /delegations */
  async createDelegation(
    input: CreateDelegationInput
  ): Promise<ApiResponse<Delegation>> {
    return this.request<Delegation>("/delegations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** PATCH /delegations/{id} */
  async updateDelegation(
    id: string,
    input: UpdateDelegationInput
  ): Promise<ApiResponse<Delegation>> {
    return this.request<Delegation>(`/delegations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  /** DELETE /delegations/{id} */
  async revokeDelegation(id: string): Promise<ApiResponse<{ id: string; status: string }>> {
    return this.request<{ id: string; status: string }>(`/delegations/${id}`, {
      method: "DELETE",
    });
  }

  /** POST /orders/{id}/approve */
  async approveOrder(id: string, approverAddress?: string): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/orders/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(approverAddress ? { approverAddress } : {}),
    });
  }

  /** POST /orders/{id}/reject */
  async rejectOrder(
    id: string,
    reason?: string,
    reasonCode?: string
  ): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/orders/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason, rejectionReason: reasonCode }),
    });
  }

  /** Returns the stored auth token, or null when unauthenticated. */
  getToken(): string | null {
    return this.authToken;
  }

  /** Stores or clears (null) the auth token. */
  setToken(token: string | null): void {
    this.authToken = token;
  }
}

export function createClient(config: DelegoClientConfig): DelegoClient {
  return new DelegoClient(config);
}

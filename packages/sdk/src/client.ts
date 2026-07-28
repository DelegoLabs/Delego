import type {
  ApiResponse,
  Delegation,
  Escrow,
  HealthCheckResponse,
} from "@delego/types";
import {
  ApiResponseSchema,
  DelegationSchema,
  HealthCheckResponseSchema,
  OrderSchema,
  validateResponse,
} from "./schemas.js";

export interface DelegoClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated requests */
  token?: string;
  /** Timeout in milliseconds for requests (default: 30000) */
  timeout?: number;
  /**
   * Called whenever a request receives a 401 response. The stored token is
   * cleared before this fires, so callers should redirect to login here.
   */
  onUnauthorized?: () => void;
  /** Storage to persist the token in across page reloads (default: localStorage). */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

const TOKEN_STORAGE_KEY = "delego_auth_token";

function getDefaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
  if (typeof window === "undefined" || !window.localStorage) return undefined;
  return window.localStorage;
}

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match?.[1];
}

/**
 * HTTP client for the Delego API Gateway.
 * TODO: Implement full endpoint coverage as routes are added.
 */
export class DelegoClient {
  private readonly baseUrl: string;
  private token?: string;
  private readonly timeout: number;
  private readonly onUnauthorized?: () => void;
  private readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;

  constructor(options: DelegoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout ?? 30000;
    this.onUnauthorized = options.onUnauthorized;
    this.storage = options.storage ?? getDefaultStorage();
    this.token = options.token ?? this.storage?.getItem(TOKEN_STORAGE_KEY) ?? undefined;
  }

  /** Store the auth token in memory and persist it (localStorage by default). */
  setToken(token: string): void {
    this.token = token;
    this.storage?.setItem(TOKEN_STORAGE_KEY, token);
  }

  /** Return the current auth token, or null if none is set. */
  getToken(): string | null {
    return this.token ?? null;
  }

  /** Clear the auth token from memory and persisted storage (e.g. on logout). */
  clearToken(): void {
    this.token = undefined;
    this.storage?.removeItem(TOKEN_STORAGE_KEY);
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { timeout?: number; signal?: AbortSignal },
    dataSchema?: import("zod").ZodType<unknown>
  ): Promise<ApiResponse<T>> {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (STATE_CHANGING_METHODS.has(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
    }

    const controller = new AbortController();
    const timeoutMs = init?.timeout ?? this.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const externalSignal = init?.signal;
    let onExternalAbort: (() => void) | undefined;
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        throw new DOMException("The operation was aborted", "AbortError");
      }
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener("abort", onExternalAbort, {
        once: true,
      });
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }

      if (response.status === 401) {
        this.clearToken();
        this.onUnauthorized?.();
      }

      const rawData = await response.json();
      if (dataSchema) {
        const schema = ApiResponseSchema(dataSchema);
        return validateResponse(rawData, schema) as ApiResponse<T>;
      }
      return rawData as ApiResponse<T>;
    } catch (error) {
      clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        controller.signal.aborted
      ) {
        if (externalSignal?.aborted) {
          throw new DOMException("The operation was aborted", "AbortError");
        }
        throw new TimeoutError();
      }
      throw error;
    }
  }

  async health(): Promise<ApiResponse<HealthCheckResponse>> {
    return this.request<HealthCheckResponse>(
      "/health",
      undefined,
      HealthCheckResponseSchema
    );
  }

  async getDelegations(
    options?: { signal?: AbortSignal }
  ): Promise<ApiResponse<import("@delego/types").Delegation[]>> {
    return this.request<import("@delego/types").Delegation[]>(
      "/api/v1/delegations",
      { signal: options?.signal },
      z.array(DelegationSchema)
    );
  }

  async getOrders(
    options?: { signal?: AbortSignal }
  ): Promise<ApiResponse<import("@delego/types").Order[]>> {
    return this.request<import("@delego/types").Order[]>(
      "/api/v1/orders",
      { signal: options?.signal },
      z.array(OrderSchema)
    );
  }

  /** Approve a high-value order awaiting manual review. */
  async approveOrder(
    id: string
  ): Promise<ApiResponse<import("@delego/types").Order>> {
    return this.request<import("@delego/types").Order>(
      `/api/v1/orders/${encodeURIComponent(id)}/approve`,
      { method: "POST" },
      OrderSchema
    );
  }

  /** Reject a high-value order awaiting manual review, with an optional reason. */
  async rejectOrder(
    id: string,
    reason?: string
  ): Promise<ApiResponse<import("@delego/types").Order>> {
    return this.request<import("@delego/types").Order>(
      `/api/v1/orders/${encodeURIComponent(id)}/reject`,
      { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
      OrderSchema
    );
  }

  async createDelegation(
    input: import("@delego/types").CreateDelegationInput
  ): Promise<ApiResponse<import("@delego/types").Delegation>> {
    return this.request<import("@delego/types").Delegation>(
      "/api/v1/delegations",
      { method: "POST", body: JSON.stringify(input) },
      DelegationSchema
    );
  }

  async updateDelegation(
    id: string,
    input: import("@delego/types").UpdateDelegationInput
  ): Promise<ApiResponse<import("@delego/types").Delegation>> {
    return this.request<import("@delego/types").Delegation>(
      `/api/v1/delegations/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(input) },
      DelegationSchema
    );
  }

  async revokeDelegation(
    id: string
  ): Promise<ApiResponse<{ id: string; status: string }>> {
    return this.request<{ id: string; status: string }>(
      `/api/v1/delegations/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  }

  async getEscrows(): Promise<ApiResponse<Escrow[]>> {
    return this.request<Escrow[]>("/api/v1/escrows");
  }
}

import { z } from "zod";

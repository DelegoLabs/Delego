import type {
  ApiResponse,
  ApprovalItem,
  ApprovalListFilters,
  ApprovalsBulkActionPayload,
  Delegation,
  EscalateIssueToDisputePayload,
  EscrowDetail,
  HealthCheckResponse,
  Order,
  OrderDispute,
  OrderIssue,
  PaginatedResponse,
  ReleaseEligibility,
  ReportOrderIssuePayload,
} from "@delego/types";

export interface DelegoClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated requests */
  token?: string;
  /** Soroban RPC URL — used for direct contract reads (e.g., release_eligibility) */
  sorobanRpcUrl?: string;
}

/**
 * HTTP client for the Delego API Gateway.
 * TODO: Implement full endpoint coverage as routes are added.
 */
export class DelegoClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  readonly sorobanRpcUrl: string;

  constructor(options: DelegoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.sorobanRpcUrl =
      options.sorobanRpcUrl ??
      (typeof process !== "undefined"
        ? (process.env as Record<string, string | undefined>).NEXT_PUBLIC_SOROBAN_RPC_URL ??
          "https://soroban-testnet.stellar.org"
        : "https://soroban-testnet.stellar.org");
  }

  private async request<T>(
    path: string,
    init?: RequestInit
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    return response.json() as Promise<ApiResponse<T>>;
  }

  async health(): Promise<ApiResponse<HealthCheckResponse>> {
    return this.request<HealthCheckResponse>("/health");
  }

  async getDelegations(): Promise<ApiResponse<Delegation[]>> {
    return this.request<Delegation[]>("/api/v1/delegations");
  }

  async getOrders(): Promise<ApiResponse<Order[]>> {
    return this.request<Order[]>("/api/v1/orders");
  }

  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    return this.request<Order>(`/api/v1/orders/${orderId}`);
  }

  async reportOrderIssue(
    payload: ReportOrderIssuePayload
  ): Promise<ApiResponse<OrderIssue>> {
    return this.request<OrderIssue>("/api/v1/orders/issues/report", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async escalateIssueToDispute(
    payload: EscalateIssueToDisputePayload
  ): Promise<ApiResponse<OrderDispute>> {
    return this.request<OrderDispute>("/api/v1/disputes/escalate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getEscrowDetail(escrowId: string): Promise<ApiResponse<EscrowDetail>> {
    return this.request<EscrowDetail>(`/api/v1/escrows/${escrowId}`);
  }

  async getReleaseEligibility(
    escrowId: string,
    callerAddress: string
  ): Promise<ApiResponse<ReleaseEligibility>> {
    return this.request<ReleaseEligibility>(
      `/api/v1/escrows/${escrowId}/release-eligibility?caller=${encodeURIComponent(
        callerAddress
      )}`
    );
  }

  async releaseEscrow(
    escrowId: string,
    sourceAddress: string
  ): Promise<ApiResponse<{ txHash: string; ledger: number; success: boolean }>> {
    return this.request(`/api/v1/escrows/${escrowId}/release`, {
      method: "POST",
      body: JSON.stringify({ sourceAddress }),
    });
  }

  async getApprovals(
    filters: ApprovalListFilters = {},
    page = 1,
    limit = 100
  ): Promise<ApiResponse<PaginatedResponse<ApprovalItem>>> {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (filters.status && filters.status !== "ALL") {
      params.set("status", filters.status);
    }
    if (filters.kind && filters.kind !== "ALL") {
      params.set("kind", filters.kind);
    }
    if (filters.search) {
      params.set("search", filters.search);
    }
    return this.request<PaginatedResponse<ApprovalItem>>(
      `/api/v1/approvals?${params.toString()}`
    );
  }

  async bulkApprovalsAction(
    payload: ApprovalsBulkActionPayload
  ): Promise<ApiResponse<{ processed: number; failed: string[] }>> {
    return this.request("/api/v1/approvals/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

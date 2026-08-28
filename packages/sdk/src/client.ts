import type {
  ApiResponse,
  Approval,
  ApprovalStatus,
  CreateDisputePayload,
  CreateOrderIssuePayload,
  Delegation,
  Dispute,
  EscrowDetail,
  EscrowFeeBreakdown,
  EscrowTreasurySplit,
  HealthCheckResponse,
  Order,
  OrderIssue,
  ReleaseEligibility,
} from "@delego/types";

export interface DelegoClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated requests */
  token?: string;
}

/** Wire shape for Order — BIGINT amounts and dates travel as strings over JSON */
interface OrderDto extends Omit<Order, "totalStroops" | "createdAt" | "updatedAt"> {
  totalStroops: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderIssueDto extends Omit<OrderIssue, "createdAt" | "updatedAt" | "resolvedAt"> {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface DisputeDto extends Omit<Dispute, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

function toOrder(dto: OrderDto): Order {
  return {
    ...dto,
    totalStroops: BigInt(dto.totalStroops),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function toOrderIssue(dto: OrderIssueDto): OrderIssue {
  return {
    ...dto,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    resolvedAt: dto.resolvedAt ? new Date(dto.resolvedAt) : null,
  };
}

function toDispute(dto: DisputeDto): Dispute {
  return {
    ...dto,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

interface TreasurySplitDto extends Omit<EscrowTreasurySplit, "amountStroops"> {
  amountStroops: string;
}

interface EscrowFeeBreakdownDto extends Omit<EscrowFeeBreakdown, "grossStroops" | "feeStroops" | "netStroops" | "treasuries"> {
  grossStroops: string;
  feeStroops: string | null;
  netStroops: string | null;
  treasuries: TreasurySplitDto[];
}

interface EscrowDetailDto extends Omit<EscrowDetail, "fees"> {
  fees: EscrowFeeBreakdownDto;
}

function toFeeBreakdown(dto: EscrowFeeBreakdownDto): EscrowFeeBreakdown {
  return {
    ...dto,
    grossStroops: BigInt(dto.grossStroops),
    feeStroops: dto.feeStroops === null ? null : BigInt(dto.feeStroops),
    netStroops: dto.netStroops === null ? null : BigInt(dto.netStroops),
    treasuries: dto.treasuries.map((t) => ({ ...t, amountStroops: BigInt(t.amountStroops) })),
  };
}

function toEscrowDetail(dto: EscrowDetailDto): EscrowDetail {
  return { ...dto, fees: toFeeBreakdown(dto.fees) };
}

interface ApprovalDto extends Omit<Approval, "amountStroops" | "createdAt" | "updatedAt"> {
  amountStroops: string | null;
  createdAt: string;
  updatedAt: string;
}

function toApproval(dto: ApprovalDto): Approval {
  return {
    ...dto,
    amountStroops: dto.amountStroops === null ? null : BigInt(dto.amountStroops),
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
  };
}

function mapResponse<T, U>(res: ApiResponse<T>, fn: (data: T) => U): ApiResponse<U> {
  return { data: res.data === null ? null : fn(res.data), error: res.error };
}

/**
 * HTTP client for the Delego API Gateway.
 * TODO: Implement full endpoint coverage as routes are added.
 */
export class DelegoClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: DelegoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
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

  // TODO: Implement delegation endpoints
  async getDelegations(): Promise<ApiResponse<Delegation[]>> {
    return this.request<Delegation[]>("/api/v1/delegations");
  }

  async getOrders(): Promise<ApiResponse<Order[]>> {
    const res = await this.request<OrderDto[]>("/api/v1/orders");
    return mapResponse(res, (list) => list.map(toOrder));
  }

  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    const res = await this.request<OrderDto>(`/api/v1/orders/${orderId}`);
    return mapResponse(res, toOrder);
  }

  /** Report a lightweight issue on an order — distinct from creating a formal Dispute */
  async createOrderIssue(
    orderId: string,
    payload: CreateOrderIssuePayload
  ): Promise<ApiResponse<OrderIssue>> {
    const res = await this.request<OrderIssueDto>(`/api/v1/orders/${orderId}/issues`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return mapResponse(res, toOrderIssue);
  }

  async listOrderIssues(orderId: string): Promise<ApiResponse<OrderIssue[]>> {
    const res = await this.request<OrderIssueDto[]>(`/api/v1/orders/${orderId}/issues`);
    return mapResponse(res, (list) => list.map(toOrderIssue));
  }

  /** Create a formal Dispute, optionally escalated from an existing OrderIssue via `issueId` */
  async createDispute(
    orderId: string,
    payload: CreateDisputePayload
  ): Promise<ApiResponse<Dispute>> {
    const res = await this.request<DisputeDto>(`/api/v1/orders/${orderId}/disputes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return mapResponse(res, toDispute);
  }

  /** Gross/fee/net breakdown plus on-chain status for an escrow, proxied through the gateway */
  async getEscrowDetail(escrowId: string): Promise<ApiResponse<EscrowDetail>> {
    const res = await this.request<EscrowDetailDto>(`/api/v1/escrows/${escrowId}`);
    return mapResponse(res, toEscrowDetail);
  }

  /**
   * Queries the contract's release-eligibility getter (via the gateway proxy) for `caller` —
   * used to explain exactly why the release CTA is disabled, rather than a frontend heuristic.
   */
  async getReleaseEligibility(escrowId: string, caller: string): Promise<ApiResponse<ReleaseEligibility>> {
    return this.request<ReleaseEligibility>(
      `/api/v1/escrows/${escrowId}/release-eligibility?caller=${encodeURIComponent(caller)}`
    );
  }

  async listApprovals(): Promise<ApiResponse<Approval[]>> {
    const res = await this.request<ApprovalDto[]>("/api/v1/approvals");
    return mapResponse(res, (list) => list.map(toApproval));
  }

  async bulkUpdateApprovals(
    ids: string[],
    status: Extract<ApprovalStatus, "approved" | "rejected">
  ): Promise<ApiResponse<{ updated: number }>> {
    return this.request<{ updated: number }>("/api/v1/approvals/bulk", {
      method: "PATCH",
      body: JSON.stringify({ ids, status }),
    });
  }
}

import { describe, it, expect } from "vitest";
import type {
  User,
  Delegation,
  SpendingPolicy,
  Order,
  WalletAccount,
  AgentDefinition,
  ApiResponse,
  HealthCheckResponse,
} from "@delego/types";

describe("@delego/types", () => {
  it("exports User interface", () => {
    const user: User = {
      id: "u1",
      stellarAddress: "GABC",
      displayName: "Alice",
      email: "alice@example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(user.id).toBe("u1");
  });

  it("exports Delegation with SpendingPolicy", () => {
    const policy: SpendingPolicy = {
      maxPerTransaction: 100n,
      maxTotal: 1000n,
      allowedMerchants: [],
      expiresAt: null,
    };
    const delegation: Delegation = {
      id: "d1",
      userId: "u1",
      agentId: "a1",
      status: "active",
      policy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(delegation.status).toBe("active");
    expect(delegation.policy.maxPerTransaction).toBe(100n);
  });

  it("exports ApiResponse generic type", () => {
    const resp: ApiResponse<{ name: string }> = {
      data: { name: "test" },
      error: null,
    };
    expect(resp.data?.name).toBe("test");
  });

  it("exports HealthCheckResponse", () => {
    const health: HealthCheckResponse = {
      status: "ok",
      service: "types",
      version: "0.0.1",
      timestamp: new Date().toISOString(),
    };
    expect(health.status).toBe("ok");
  });

  it("exports WalletAccount type", () => {
    const acct: WalletAccount = {
      address: "GXYZ",
      network: "testnet",
    };
    expect(acct.network).toBe("testnet");
  });

  it("exports Order type", () => {
    const order: Order = {
      id: "o1",
      userId: "u1",
      delegationId: "d1",
      merchantId: "m1",
      status: "pending_approval",
      lineItems: [],
      totalStroops: 500n,
      escrowContractId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(order.status).toBe("pending_approval");
  });

  it("exports AgentDefinition type", () => {
    const agent: AgentDefinition = {
      id: "a1",
      role: "buyer",
      name: "BuyerAgent",
      description: "Acts on behalf of buyer",
      version: "0.0.1",
    };
    expect(agent.role).toBe("buyer");
  });
});
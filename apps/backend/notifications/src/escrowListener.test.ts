import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startEscrowEventListener, stopEscrowEventListener } from "./escrowListener.js";
import { rpc as SorobanRpc, xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { Redis } from "ioredis";
import * as idempotency from "./idempotency.js";
import { setWalletLookupAdapter, resetWalletLookupAdapter } from "./walletLookup.js";
import * as email from "../email/index.js";
import * as push from "../push/index.js";

// Mock dependencies
vi.mock("ioredis", () => {
  const Redis = vi.fn();
  Redis.prototype.get = vi.fn().mockResolvedValue(null);
  Redis.prototype.set = vi.fn().mockResolvedValue("OK");
  Redis.prototype.smembers = vi.fn().mockResolvedValue([]);
  return { Redis };
});

vi.mock("./idempotency.js", () => ({
  checkAndMarkDispatched: vi.fn().mockResolvedValue(true),
}));

vi.mock("../email/index.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../push/index.js", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("escrowListener", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    
    // Mock the Stellar SDK RPC Server
    const mockGetLatestLedger = vi.fn().mockResolvedValue({ sequence: 100 });
    const mockGetEvents = vi.fn().mockResolvedValue({ events: [] });
    
    SorobanRpc.Server.prototype.getLatestLedger = mockGetLatestLedger;
    SorobanRpc.Server.prototype.getEvents = mockGetEvents;

    setWalletLookupAdapter({
      lookupByWalletAddress: vi.fn().mockImplementation(async (address: string) => {
        if (address === "merchant-addr") {
          return {
            walletAddress: "merchant-addr",
            userId: "merchant-123",
            email: "merchant@example.com",
            pushEnabled: false,
          };
        }
        return null;
      }),
    });
  });

  afterEach(() => {
    stopEscrowEventListener();
    resetWalletLookupAdapter();
    vi.useRealTimers();
  });

  it("decodes on-chain EscrowCreatedEvent and dispatches notification", async () => {
    const mockGetEvents = vi.fn().mockResolvedValue({
      events: [
        {
          type: "contract",
          inSuccessfulContractCall: true,
          contractId: "C123",
          ledger: 100,
          txHash: "abcd",
          id: "event-1",
          topic: [
            nativeToScVal("escrow"),
            nativeToScVal("created"),
          ],
          value: nativeToScVal({
            buyer: "buyer-addr",
            seller: "merchant-addr",
            amount: 1000n, // u128 map
            order_id: "order-99",
          }),
        },
      ],
    });
    SorobanRpc.Server.prototype.getEvents = mockGetEvents;

    startEscrowEventListener("http://localhost:8000", "C123");
    
    // Fast forward to allow async operations to run
    await vi.runOnlyPendingTimersAsync();

    expect(mockGetEvents).toHaveBeenCalled();
    expect(idempotency.checkAndMarkDispatched).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "merchant-123",
        eventType: "escrow_created",
      })
    );
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "merchant@example.com",
        templateName: "escrow-funded",
      })
    );
  });
});

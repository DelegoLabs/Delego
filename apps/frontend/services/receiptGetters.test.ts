import { describe, it, expect, vi, beforeEach } from "vitest";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { fetchReceipt, clearReceiptCache } from "./receiptGetters";
import { getNetworkConfig } from "../lib/networks";

const NETWORK = getNetworkConfig("testnet");
const CONTRACT = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

const simulateTransactionMock = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof import("@stellar/stellar-sdk")>(
    "@stellar/stellar-sdk"
  );
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        simulateTransaction: (...args: unknown[]) =>
          simulateTransactionMock(...args),
      })),
    },
  };
});

function successResult(retval: unknown) {
  return {
    result: { retval: nativeToScVal(retval) },
    latestLedger: 100,
  };
}

describe("fetchReceipt", () => {
  beforeEach(() => {
    simulateTransactionMock.mockReset();
    clearReceiptCache();
  });

  it("returns a decoded receipt on a successful simulation", async () => {
    simulateTransactionMock.mockResolvedValue(
      successResult({ amount: 100n, recipient: "GABC" })
    );

    const outcome = await fetchReceipt(
      NETWORK,
      "testnet",
      CONTRACT,
      "buyer",
      "escrow-1"
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.kind).toBe("buyer");
      expect(outcome.result.data.amount).toBe("100");
    }
  });

  it("returns a structured error when simulation fails with an Api error", async () => {
    simulateTransactionMock.mockResolvedValue({
      error: "host invocation failed",
      latestLedger: 100,
    });

    const outcome = await fetchReceipt(
      NETWORK,
      "testnet",
      CONTRACT,
      "buyer",
      "escrow-1"
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("host invocation failed");
    }
  });

  it("returns a structured error when the RPC call throws", async () => {
    simulateTransactionMock.mockRejectedValue(new Error("network unreachable"));

    const outcome = await fetchReceipt(
      NETWORK,
      "testnet",
      CONTRACT,
      "buyer",
      "escrow-1"
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBe("network unreachable");
    }
  });

  it("coalesces concurrent requests for the same key into a single RPC call", async () => {
    let resolveSimulation!: (value: unknown) => void;
    simulateTransactionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSimulation = resolve;
      })
    );

    const p1 = fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");
    const p2 = fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");

    resolveSimulation(successResult({ amount: 1n }));
    await Promise.all([p1, p2]);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce requests for a different key", async () => {
    simulateTransactionMock.mockResolvedValue(successResult({ amount: 1n }));

    await Promise.all([
      fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1"),
      fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-2"),
    ]);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
  });

  it("serves from cache on a second call within the TTL, without a new RPC call", async () => {
    simulateTransactionMock.mockResolvedValue(successResult({ amount: 1n }));

    await fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");
    await fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cache when bypassCache is true", async () => {
    simulateTransactionMock.mockResolvedValue(successResult({ amount: 1n }));

    await fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");
    await fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1", true);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed fetch", async () => {
    simulateTransactionMock.mockRejectedValueOnce(new Error("transient"));
    simulateTransactionMock.mockResolvedValueOnce(
      successResult({ amount: 1n })
    );

    const first = await fetchReceipt(
      NETWORK,
      "testnet",
      CONTRACT,
      "buyer",
      "escrow-1"
    );
    const second = await fetchReceipt(
      NETWORK,
      "testnet",
      CONTRACT,
      "buyer",
      "escrow-1"
    );

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
  });

  it("keeps buyer, merchant, and permission receipts independently cached", async () => {
    simulateTransactionMock.mockResolvedValue(successResult({ amount: 1n }));

    await fetchReceipt(NETWORK, "testnet", CONTRACT, "buyer", "escrow-1");
    await fetchReceipt(NETWORK, "testnet", CONTRACT, "merchant", "escrow-1");
    await fetchReceipt(NETWORK, "testnet", CONTRACT, "permission", "escrow-1");

    expect(simulateTransactionMock).toHaveBeenCalledTimes(3);
  });
});

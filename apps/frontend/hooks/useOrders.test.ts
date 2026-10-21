import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useOrders } from "./useOrders";

const mockGetOrders = vi.fn();
const mockApproveOrder = vi.fn();
const mockRejectOrder = vi.fn();

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  listeners = new Set<(event: MessageEvent<unknown>) => void>();
  postMessage = vi.fn();

  constructor(readonly name: string) {
    MockBroadcastChannel.instances.push(this);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ) {
    this.listeners.add(listener);
  }

  emit(data: unknown) {
    for (const listener of this.listeners) {
      listener({ data } as MessageEvent<unknown>);
    }
  }
}

vi.mock("../lib/api", () => ({
  api: {
    getOrders: (...args: unknown[]) => mockGetOrders(...args),
    approveOrder: (...args: unknown[]) => mockApproveOrder(...args),
    rejectOrder: (...args: unknown[]) => mockRejectOrder(...args),
  },
}));

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "pending_approval",
    lineItems: [],
    totalStroops: 10_000_000_000n,
    escrowContractId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("useOrders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetOrders.mockReset();
    mockApproveOrder.mockReset();
    mockRejectOrder.mockReset();
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: MockBroadcastChannel,
    });
  });

  it("loads orders on mount", async () => {
    const data = [makeOrder()];
    mockGetOrders.mockResolvedValue({ data, error: null });

    const { result } = renderHook(() => useOrders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orders).toEqual(data);
    expect(result.current.error).toBeNull();
    expect(result.current.lastUpdated).toBeInstanceOf(Date);
  });

  it("sets an error for a non-array payload", async () => {
    mockGetOrders.mockResolvedValue({ data: { id: "x" }, error: null });

    const { result } = renderHook(() => useOrders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Invalid response format");
  });

  it("surfaces API errors", async () => {
    mockGetOrders.mockResolvedValue({
      data: null,
      error: { code: "SERVER", message: "boom" },
    });

    const { result } = renderHook(() => useOrders());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
  });

  it("approveOrder replaces the order with the server response", async () => {
    const original = makeOrder({ status: "pending_approval" });
    mockGetOrders.mockResolvedValue({ data: [original], error: null });
    const approved = makeOrder({ status: "approved" });
    mockApproveOrder.mockResolvedValue({ data: approved, error: null });

    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.approveOrder("order-1");
    });

    expect(mockApproveOrder).toHaveBeenCalledWith("order-1");
    expect(result.current.orders[0].status).toBe("approved");
    expect(result.current.pendingIds.has("order-1")).toBe(false);

    const channel = MockBroadcastChannel.instances.at(-1)!;
    expect(channel.name).toBe("delego_tab_sync");
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ORDER_STATUS_CHANGED",
        payload: { orderId: "order-1", status: "approved" },
      })
    );

    act(() => {
      channel.emit({
        type: "ORDER_STATUS_CHANGED",
        payload: { orderId: "order-1", status: "approved" },
        senderTabId: "another-tab",
      });
    });
    await waitFor(() => expect(mockGetOrders).toHaveBeenCalledTimes(2));
  });

  it("rejectOrder forwards the reason and reports API errors", async () => {
    mockGetOrders.mockResolvedValue({ data: [makeOrder()], error: null });
    mockRejectOrder.mockResolvedValue({
      data: null,
      error: { code: "BAD", message: "cannot reject" },
    });

    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.rejectOrder("order-1", "too expensive");
    });

    expect(mockRejectOrder).toHaveBeenCalledWith("order-1", {
      reason: "too expensive",
      reasonCode: undefined,
    });
    expect(result.current.error).toBe("cannot reject");
  });

  it("rejectOrder forwards the structured reason code (#567)", async () => {
    mockGetOrders.mockResolvedValue({ data: [makeOrder()], error: null });
    mockRejectOrder.mockResolvedValue({
      data: { ...makeOrder(), status: "rejected" },
      error: null,
    });

    const { result } = renderHook(() => useOrders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.rejectOrder(
        "order-1",
        "budget note",
        "too_expensive"
      );
    });

    expect(mockRejectOrder).toHaveBeenCalledWith("order-1", {
      reason: "budget note",
      reasonCode: "too_expensive",
    });
  });
});

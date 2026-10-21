import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseIncomingPaymentEvent,
  usePaymentStream,
} from "./usePaymentStream";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  send(data: string, lastEventId = "event-1") {
    this.onmessage?.(new MessageEvent("message", { data, lastEventId }));
  }

  fail() {
    this.onerror?.(new Event("error"));
  }
}

describe("usePaymentStream", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    MockEventSource.instances = [];
  });

  it("parses only incoming Horizon payments with transaction details", () => {
    const parsed = parseIncomingPaymentEvent(
      JSON.stringify({
        id: "paging-token",
        asset_type: "native",
        amount: "5.2500000",
        from: "GSENDER",
        to: "GRECIPIENT",
        _links: {
          transaction: {
            href: "https://horizon.example/transactions/abc123",
          },
        },
      }),
      "event-1",
      "GRECIPIENT"
    );

    expect(parsed).toEqual({
      id: "paging-token",
      assetCode: "XLM",
      amount: "5.2500000",
      from: "GSENDER",
      to: "GRECIPIENT",
      transactionHash: "abc123",
    });
    expect(
      parseIncomingPaymentEvent(
        JSON.stringify({ from: "GSENDER", to: "GOTHER", amount: "1" }),
        "event-2",
        "GRECIPIENT"
      )
    ).toBeNull();
  });

  it("updates on incoming payments and reconnects with exponential backoff", () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", MockEventSource);
    const { result, unmount } = renderHook(() =>
      usePaymentStream("GRECIPIENT", "https://horizon.example/", true)
    );
    const first = MockEventSource.instances[0];

    expect(first.url).toBe(
      "https://horizon.example/accounts/GRECIPIENT/payments?cursor=now"
    );
    act(() => first.fail());
    expect(result.current.status).toBe("reconnecting");
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => MockEventSource.instances[1].fail());
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockEventSource.instances).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockEventSource.instances).toHaveLength(3);

    act(() => {
      MockEventSource.instances[2].send(
        JSON.stringify({
          id: "paging-token",
          asset_type: "native",
          amount: "5.2500000",
          from: "GSENDER",
          to: "GRECIPIENT",
          transaction_hash: "abc123",
        })
      );
    });
    expect(result.current.status).toBe("connected");
    expect(result.current.latestPayment?.transactionHash).toBe("abc123");

    unmount();
    expect(MockEventSource.instances[2].close).toHaveBeenCalled();
  });
});

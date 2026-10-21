import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBroadcastChannel } from "./useBroadcastChannel";

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

describe("useBroadcastChannel", () => {
  it("broadcasts typed messages and delivers messages from other tabs only", () => {
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: MockBroadcastChannel,
    });
    const onMessage = vi.fn();
    const { result } = renderHook(() => useBroadcastChannel(onMessage));
    const channel = MockBroadcastChannel.instances.at(-1)!;

    expect(channel.name).toBe("delego_tab_sync");
    act(() => {
      result.current.broadcast("CART_UPDATED", { items: [] });
    });
    expect(channel.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CART_UPDATED",
        payload: { items: [] },
        senderTabId: result.current.senderTabId,
      })
    );

    act(() => {
      channel.emit({
        type: "WALLET_DISCONNECTED",
        payload: {},
        senderTabId: "another-tab",
      });
      channel.emit({
        type: "WALLET_DISCONNECTED",
        payload: {},
        senderTabId: result.current.senderTabId,
      });
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "WALLET_DISCONNECTED" })
    );
  });
});

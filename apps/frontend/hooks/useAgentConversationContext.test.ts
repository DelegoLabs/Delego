import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAgentConversationContext } from "./useAgentConversationContext";
import type { ChatMessage } from "../lib/agentConversationContext";

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content };
}

describe("useAgentConversationContext", () => {
  it("returns EMPTY_CONTEXT for an empty transcript", () => {
    const { result } = renderHook(() => useAgentConversationContext([]));
    expect(result.current.context.preferredCondition).toBe("any");
    expect(result.current.context.excludedMerchants).toEqual([]);
    expect(result.current.context.turnsCount).toBe(0);
    expect(result.current.context.activeBudgetStroops).toBeUndefined();
  });

  it("derives context from user messages", () => {
    const messages = [msg("user", "find a laptop under $200")];
    const { result } = renderHook(() =>
      useAgentConversationContext(messages)
    );
    expect(result.current.context.activeBudgetStroops).toBe("2000000000");
    expect(result.current.context.targetCategory).toBe("laptop");
  });

  it("updates context when messages change", () => {
    let messages: ChatMessage[] = [msg("user", "find a laptop")];
    const { result, rerender } = renderHook(() =>
      useAgentConversationContext(messages)
    );
    expect(result.current.context.targetCategory).toBe("laptop");

    messages = [
      ...messages,
      msg("assistant", "sure"),
      msg("user", "actually keyboards"),
    ];
    rerender();
    expect(result.current.context.targetCategory).toBe("keyboard");
  });

  // ── resetContext ─────────────────────────────────────────────────────────

  it("resetContext returns EMPTY_CONTEXT immediately", () => {
    const messages = [msg("user", "find a laptop under $200")];
    const { result } = renderHook(() =>
      useAgentConversationContext(messages)
    );

    expect(result.current.context.activeBudgetStroops).toBeDefined();

    act(() => {
      result.current.resetContext();
    });

    expect(result.current.context.activeBudgetStroops).toBeUndefined();
    expect(result.current.context.preferredCondition).toBe("any");
    expect(result.current.context.excludedMerchants).toEqual([]);
  });

  it("sets wasRecentlyReset to true immediately after reset", () => {
    const messages = [msg("user", "find a new laptop")];
    const { result } = renderHook(() =>
      useAgentConversationContext(messages)
    );

    expect(result.current.wasRecentlyReset).toBe(false);

    act(() => {
      result.current.resetContext();
    });

    expect(result.current.wasRecentlyReset).toBe(true);
  });

  it("does not clear the transcript — only the derived context is wiped", () => {
    // The hook doesn't own the transcript; it only derives from it.
    // After reset, if we re-derive from the same messages the budget is
    // suppressed *until* new user messages arrive.
    let messages: ChatMessage[] = [msg("user", "find a laptop under $200")];
    const { result, rerender } = renderHook(() =>
      useAgentConversationContext(messages)
    );

    act(() => {
      result.current.resetContext();
    });

    // Context is empty, but messages are unchanged externally.
    expect(result.current.context.activeBudgetStroops).toBeUndefined();

    // Simulating a new user turn arriving after reset re-enables derivation.
    messages = [
      ...messages,
      msg("assistant", "ok"),
      msg("user", "under $50"),
    ];
    rerender();

    expect(result.current.context.activeBudgetStroops).toBe("500000000");
  });

  it("clears wasRecentlyReset once a new user message arrives after reset", () => {
    let messages: ChatMessage[] = [msg("user", "find a keyboard")];
    const { result, rerender } = renderHook(() =>
      useAgentConversationContext(messages)
    );

    act(() => {
      result.current.resetContext();
    });

    expect(result.current.wasRecentlyReset).toBe(true);

    messages = [
      ...messages,
      msg("assistant", "ok"),
      msg("user", "under $50"),
    ];
    rerender();

    expect(result.current.wasRecentlyReset).toBe(false);
  });

  it("wasRecentlyReset starts as false on mount", () => {
    const { result } = renderHook(() => useAgentConversationContext([]));
    expect(result.current.wasRecentlyReset).toBe(false);
  });
});

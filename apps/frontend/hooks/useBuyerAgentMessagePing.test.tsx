import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useBuyerAgentMessagePing } from "./useBuyerAgentMessagePing";
import { AudioNotificationsProvider } from "./useAudioNotifications";
import { resetSharedAudioContext } from "../lib/audioChime";
import { AUDIO_NOTIFICATION_STORAGE_KEY } from "../lib/audioNotification";
import type { BuyerAgentMessage } from "../lib/buyerAgentMessages";
import {
  installFakeAudioContext,
  mockMatchMedia,
} from "../tests/fakeAudioContext";

const playChimeSpy = vi.hoisted(() => vi.fn(() => true));

vi.mock("../lib/audioChime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/audioChime")>();
  return { ...actual, playChime: playChimeSpy };
});

let uninstallAudio: () => void;
let uninstallMatchMedia: () => void;

function wrapper({ children }: { children: ReactNode }) {
  return <AudioNotificationsProvider>{children}</AudioNotificationsProvider>;
}

function agentMessage(
  id: string,
  overrides: Partial<BuyerAgentMessage> = {}
): BuyerAgentMessage {
  return {
    id,
    author: "agent",
    body: "Here is what I found.",
    sentAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function userMessage(id: string): BuyerAgentMessage {
  return {
    id,
    author: "user",
    body: "Find me a desk lamp",
    sentAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetSharedAudioContext();
  playChimeSpy.mockClear();
  playChimeSpy.mockReturnValue(true);
  window.localStorage.setItem(
    AUDIO_NOTIFICATION_STORAGE_KEY,
    JSON.stringify({ soundEnabled: true, volume: 0.4 })
  );
  const installed = installFakeAudioContext();
  uninstallAudio = installed.uninstall;
  uninstallMatchMedia = mockMatchMedia(false);
});

afterEach(() => {
  uninstallAudio();
  uninstallMatchMedia();
  window.localStorage.clear();
  resetSharedAudioContext();
});

describe("useBuyerAgentMessagePing — transcript history", () => {
  it("does not ping for messages already on screen at mount", () => {
    renderHook(
      () =>
        useBuyerAgentMessagePing([
          userMessage("u1"),
          agentMessage("a1"),
          agentMessage("a2"),
        ]),
      { wrapper }
    );

    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("does not ping for an empty transcript", () => {
    renderHook(() => useBuyerAgentMessagePing([]), { wrapper });

    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("starts with no ping recorded", () => {
    const { result } = renderHook(
      () => useBuyerAgentMessagePing([agentMessage("a1")]),
      { wrapper }
    );

    expect(result.current.lastPingedMessageId).toBeNull();
    expect(result.current.pingCount).toBe(0);
  });
});

describe("useBuyerAgentMessagePing — new agent messages", () => {
  it("pings once when a completed agent message lands", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [userMessage("u1")] } }
    );

    rerender({ messages: [userMessage("u1"), agentMessage("a1")] });

    expect(playChimeSpy).toHaveBeenCalledTimes(1);
    expect(result.current.lastPingedMessageId).toBe("a1");
    expect(result.current.pingCount).toBe(1);
  });

  it("pings once for a proposal card with no body", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({
      messages: [
        agentMessage("a-card", {
          body: "",
          proposalCard: {
            title: "Desk lamp",
            total: "US$24.00",
            currency: "USD",
          },
        }),
      ],
    });

    expect(result.current.lastPingedMessageId).toBe("a-card");
    expect(playChimeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not ping twice for the same message across re-renders", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });
    rerender({ messages: [agentMessage("a1")] });
    rerender({ messages: [agentMessage("a1")] });

    expect(playChimeSpy).toHaveBeenCalledTimes(1);
    expect(result.current.pingCount).toBe(1);
  });

  it("does not ping for the user's own message", () => {
    const { rerender } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [userMessage("u2")] });

    expect(playChimeSpy).not.toHaveBeenCalled();
  });

  it("pings again for each subsequent agent message", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });
    rerender({ messages: [agentMessage("a1"), agentMessage("a2")] });

    expect(playChimeSpy).toHaveBeenCalledTimes(2);
    expect(result.current.lastPingedMessageId).toBe("a2");
    expect(result.current.pingCount).toBe(2);
  });

  it("collapses a burst of new messages into a single chime", () => {
    const { rerender } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({
      messages: [agentMessage("a1"), agentMessage("a2"), agentMessage("a3")],
    });

    // Non-intrusive: overlapping chimes are exactly what #811 rules out.
    expect(playChimeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-ping a message that scrolls out of the transcript and back", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });
    rerender({ messages: [agentMessage("a1"), agentMessage("a2")] });
    rerender({ messages: [agentMessage("a2")] });
    rerender({ messages: [agentMessage("a1"), agentMessage("a2")] });

    expect(result.current.pingCount).toBe(2);
  });
});

describe("useBuyerAgentMessagePing — streaming completion", () => {
  it("stays quiet while the agent is still generating, then pings on completion", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    // The stream appends the message immediately with pending: true.
    rerender({ messages: [agentMessage("a1", { pending: true })] });
    expect(playChimeSpy).not.toHaveBeenCalled();

    // The terminal frame flips pending to false.
    rerender({ messages: [agentMessage("a1", { pending: false })] });

    expect(playChimeSpy).toHaveBeenCalledTimes(1);
    expect(result.current.lastPingedMessageId).toBe("a1");
  });

  it("does not chime on each token of a streaming body", () => {
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1", { pending: true, body: "I" })] });
    rerender({
      messages: [agentMessage("a1", { pending: true, body: "I found" })],
    });
    rerender({
      messages: [agentMessage("a1", { pending: true, body: "I found a deal" })],
    });

    expect(playChimeSpy).not.toHaveBeenCalled();
    expect(result.current.pingCount).toBe(0);
  });
});

describe("useBuyerAgentMessagePing — gating", () => {
  it("does not chime when the user has sound disabled", () => {
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: false, volume: 0.4 })
    );

    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });

    expect(playChimeSpy).not.toHaveBeenCalled();
    expect(result.current.pingCount).toBe(0);
  });

  it("does not chime under reduced motion", () => {
    uninstallMatchMedia();
    uninstallMatchMedia = mockMatchMedia(true);

    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });

    expect(playChimeSpy).not.toHaveBeenCalled();
    expect(result.current.pingCount).toBe(0);
  });

  it("does not record a ping when the browser declines to make sound", () => {
    playChimeSpy.mockReturnValue(false);

    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });

    expect(result.current.pingCount).toBe(0);
    expect(result.current.lastPingedMessageId).toBeNull();
  });

  it("respects enabled: false without changing the user's preference", () => {
    const onPing = vi.fn();
    const { rerender, result } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages, { enabled: false, onPing }),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });

    expect(playChimeSpy).not.toHaveBeenCalled();
    expect(onPing).not.toHaveBeenCalled();
    expect(result.current.pingCount).toBe(0);
    expect(
      JSON.parse(
        window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
      )
    ).toEqual({ soundEnabled: true, volume: 0.4 });
  });

  it("requires an AudioNotificationsProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useBuyerAgentMessagePing([]))).toThrow(
      /AudioNotificationsProvider/
    );
    spy.mockRestore();
  });
});

describe("useBuyerAgentMessagePing — onPing callback", () => {
  it("reports the message that triggered the chime", () => {
    const onPing = vi.fn();
    const { rerender } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages, { onPing }),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1")] });

    expect(onPing).toHaveBeenCalledWith("a1");
  });

  it("reports the newest message of a burst", () => {
    const onPing = vi.fn();
    const { rerender } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages, { onPing }),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    rerender({ messages: [agentMessage("a1"), agentMessage("a2")] });

    expect(onPing).toHaveBeenCalledTimes(1);
    expect(onPing).toHaveBeenCalledWith("a2");
  });

  it("does not throw when no callback is supplied", () => {
    const { rerender } = renderHook(
      ({ messages }: { messages: BuyerAgentMessage[] }) =>
        useBuyerAgentMessagePing(messages),
      { wrapper, initialProps: { messages: [] as BuyerAgentMessage[] } }
    );

    expect(() => rerender({ messages: [agentMessage("a1")] })).not.toThrow();
  });

  it("picks up a swapped-in callback without re-pinging", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({
        messages,
        onPing,
      }: {
        messages: BuyerAgentMessage[];
        onPing: () => void;
      }) => useBuyerAgentMessagePing(messages, { onPing }),
      {
        wrapper,
        initialProps: { messages: [] as BuyerAgentMessage[], onPing: first },
      }
    );

    rerender({ messages: [agentMessage("a1")], onPing: first });
    rerender({ messages: [agentMessage("a1")], onPing: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

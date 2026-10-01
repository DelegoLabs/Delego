import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBuyerAgentChat } from "./useBuyerAgentChat";

/**
 * A fetch mock whose response body is a stream we control from the test, so we
 * can assert that closing the drawer (unmounting the hook) terminates the
 * inflight HTTP stream instead of letting it drain in the background (#744).
 */
function createControllableStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // The consumer aborted; nothing more to do.
    },
  });
  const encoder = new TextEncoder();
  return {
    stream,
    push(chunk: string) {
      controller.enqueue(encoder.encode(chunk));
    },
    close() {
      controller.close();
    },
  };
}

/**
 * Hands out one fresh stream per `fetch` call.
 *
 * A `ReadableStream` can only be locked by one reader at a time, so a second
 * stream has to be created per request. Reusing a single stream makes a
 * superseded `send()` fail to read, which is a harness artefact rather than a
 * real behaviour of the hook.
 */
let streamSources: Array<ReturnType<typeof createControllableStream>> = [];
let streamSource: {
  push(chunk: string): void;
  close(): void;
};

beforeEach(() => {
  lastSignal = undefined;
  streamSources = [];
  streamSource = {
    push(chunk: string) {
      streamSources[streamSources.length - 1]?.push(chunk);
    },
    close() {
      streamSources[streamSources.length - 1]?.close();
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      lastSignal = init?.signal ?? undefined;
      const source = createControllableStream();
      streamSources.push(source);
      return new Response(source.stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    })
  );
});

/** Records the AbortSignal handed to fetch so tests can inspect it. */
let lastSignal: AbortSignal | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useBuyerAgentChat — SSE stream lifecycle", () => {
  it("binds an AbortSignal to the inflight fetch", async () => {
    const { result } = renderHook(() => useBuyerAgentChat());

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    expect(lastSignal).toBeInstanceOf(AbortSignal);
    expect(lastSignal?.aborted).toBe(false);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.activeMessageId).toBe("msg-1");
  });

  it("aborts the inflight stream when the drawer unmounts", async () => {
    const { result, unmount } = renderHook(() => useBuyerAgentChat());

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    expect(lastSignal?.aborted).toBe(false);

    unmount();

    // Closing the drawer must terminate the HTTP stream immediately.
    expect(lastSignal?.aborted).toBe(true);
  });

  it("does not update state after unmount when the stream keeps producing", async () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() =>
      useBuyerAgentChat({ onMessage })
    );

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    unmount();

    // A late frame arriving after unmount must not reach the consumer or
    // trigger a React state update on the dead tree.
    await act(async () => {
      streamSource.push("data: late token\n\n");
      await Promise.resolve();
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("exposes abort() to terminate the stream on demand", async () => {
    const { result } = renderHook(() => useBuyerAgentChat());

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    act(() => {
      result.current.abort();
    });

    expect(lastSignal?.aborted).toBe(true);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it("delivers parsed SSE frames to onMessage while connected", async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useBuyerAgentChat({ onMessage })
    );

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    await act(async () => {
      streamSource.push("data: hello\n\n");
      await Promise.resolve();
    });

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("hello"));
  });

  it("clears connection state once the stream completes", async () => {
    const { result } = renderHook(() => useBuyerAgentChat());

    await act(async () => {
      void result.current.send("find me a laptop", "msg-1");
    });

    await act(async () => {
      streamSource.close();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isConnected).toBe(false));
    expect(result.current.activeMessageId).toBeNull();
  });

  it("aborts the previous stream when a new prompt supersedes it", async () => {
    const { result } = renderHook(() => useBuyerAgentChat());

    await act(async () => {
      void result.current.send("first", "msg-1");
    });
    const firstSignal = lastSignal;

    await act(async () => {
      void result.current.send("second", "msg-2");
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(lastSignal?.aborted).toBe(false);
    expect(result.current.activeMessageId).toBe("msg-2");
  });

  it("handles a response with no body without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );
    const onClose = vi.fn();
    const { result } = renderHook(() => useBuyerAgentChat({ onClose }));

    await act(async () => {
      await result.current.send("find me a laptop", "msg-1");
    });

    expect(onClose).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });

  it("swallows stream errors and still reports close", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const onClose = vi.fn();
    const { result } = renderHook(() => useBuyerAgentChat({ onClose }));

    await act(async () => {
      await result.current.send("find me a laptop", "msg-1");
    });

    expect(onClose).toHaveBeenCalled();
    expect(result.current.isConnected).toBe(false);
  });
});

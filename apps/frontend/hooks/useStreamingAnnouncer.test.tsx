import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  useStreamingAnnouncer,
  StreamingAnnouncerRegion,
} from "./useStreamingAnnouncer";

const INTERVAL = 1000;
const BLANK = 50;

function region(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-testid="streaming-announcer"]'
  );
  if (!el) throw new Error("live region not rendered");
  return el;
}

function Harness({
  onReady,
}: {
  onReady?: (api: ReturnType<typeof useStreamingAnnouncer>) => void;
}) {
  const announcer = useStreamingAnnouncer(INTERVAL);
  onReady?.(announcer);
  return <StreamingAnnouncerRegion announcement={announcer.announcement} />;
}

/** Advances past the blank gap so the first sentence is published. */
async function settleFirst() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(BLANK);
  });
}

let api: ReturnType<typeof useStreamingAnnouncer> | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  api = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Feeds a stream token by token, as a real stream would. */
async function feed(text: string) {
  for (const char of text) {
    await act(async () => {
      api?.appendToken(char);
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

describe("useStreamingAnnouncer", () => {
  it("renders an empty, correctly configured live region before any content", () => {
    render(<Harness onReady={(a) => (api = a)} />);

    const el = region();
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(el).toHaveAttribute("aria-atomic", "true");
    expect(el).toHaveAttribute("aria-relevant", "additions text");
    expect(el).toHaveAttribute("role", "status");
    expect(el.className).toContain("sr-only");
    expect(el.textContent).toBe("");
  });

  it("does not announce a partially written sentence", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await feed("I have checked the escrow");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    });

    expect(region().textContent).toBe("");
  });

  it("announces a completed sentence", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await feed("Order approved. ");
    await settleFirst();

    expect(region().textContent).toBe("Order approved.");
  });

  it("keeps the next sentence back while the current one is still being spoken", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    // Two sentences complete in the same instant.
    await act(async () => {
      api?.appendToken("First one. Second one.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();

    expect(region().textContent).toBe("First one.");

    // Well past the point where a naive implementation would have swapped the
    // text and cut the reader off mid-sentence, the first sentence is still
    // the one on screen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL - BLANK - 1);
    });
    expect(region().textContent).toBe("First one.");

    // Once the interval has fully elapsed the queued sentence is published.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL + BLANK);
    });
    expect(region().textContent).toBe("Second one.");
  });

  it("drains the queue in order without dropping or reordering sentences", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("Alpha. Bravo. Charlie.");
      await vi.advanceTimersByTimeAsync(0);
    });

    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BLANK);
      });
      const text = region().textContent ?? "";
      if (text) seen.push(text);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVAL);
      });
    }

    expect(seen).toEqual(["Alpha.", "Bravo.", "Charlie."]);
  });

  it("re-announces an identical repeated sentence", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("Done.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();
    expect(region().textContent).toBe("Done.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    });
    expect(region().textContent).toBe("");

    await act(async () => {
      api?.appendToken("Done.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();

    expect(region().textContent).toBe("Done.");
  });

  it("flush announces the trailing partial sentence and ends the stream", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await feed("Waiting on merchant confirm");
    expect(api?.isStreaming).toBe(true);

    await act(async () => {
      api?.flush();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api?.isStreaming).toBe(false);

    await settleFirst();
    expect(region().textContent).toBe("Waiting on merchant confirm");
  });

  it("does not re-announce a sentence that was already announced", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("Order approved.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();
    expect(region().textContent).toBe("Order approved.");

    await act(async () => {
      api?.flush();
      await vi.advanceTimersByTimeAsync(0);
    });
    // The queue drains and the region goes idle rather than repeating it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    });

    expect(region().textContent).toBe("");
  });

  it("announceNow bypasses sentence buffering for discrete UI events", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.announceNow("Proposal ready to review.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();

    expect(region().textContent).toBe("Proposal ready to review.");
  });

  it("ignores blank and whitespace-only announcements", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.announceNow("   ");
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    });

    expect(region().textContent).toBe("");
  });

  it("ignores an empty token and stays idle", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("");
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    });

    expect(api?.isStreaming).toBe(false);
    expect(region().textContent).toBe("");
  });

  it("reset discards buffered and queued text", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("Alpha. Bravo. Charlie.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();
    expect(region().textContent).toBe("Alpha.");

    await act(async () => {
      api?.reset();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(region().textContent).toBe("");

    // Nothing from before the reset may surface later.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVAL * 4);
    });
    expect(region().textContent).toBe("");
  });

  it("caps the queue so a runaway stream cannot grow memory without bound", async () => {
    render(<Harness onReady={(a) => (api = a)} />);

    // 60 sentences queued in one burst against a cap of 20.
    await act(async () => {
      api?.appendToken(
        Array.from({ length: 60 }, (_, i) => `S${i}.`).join(" ")
      );
      await vi.advanceTimersByTimeAsync(0);
    });

    // The most recent sentences survive, which are the ones the reader needs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BLANK);
    });
    expect(region().textContent).toBe("S40.");
  });

  it("clears its timer on unmount", async () => {
    const { unmount } = render(<Harness onReady={(a) => (api = a)} />);

    await act(async () => {
      api?.appendToken("Alpha. Bravo.");
      await vi.advanceTimersByTimeAsync(0);
    });
    await settleFirst();

    unmount();
    expect(() => vi.advanceTimersByTime(INTERVAL * 5)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

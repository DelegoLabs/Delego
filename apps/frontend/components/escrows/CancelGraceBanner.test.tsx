import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { CancellationGrace } from "@delegolabs/types";
import { CancelGraceBanner } from "./CancelGraceBanner";
import { TimeFormatProvider } from "../../hooks/useTimeFormat";
import messages from "../../messages/en.json";

const mockUndo = vi.fn();
const mockFinalize = vi.fn();

vi.mock("../../services/payments", () => ({
  undoCancellation: (...args: unknown[]) => mockUndo(...args),
  finalizeCancellation: (...args: unknown[]) => mockFinalize(...args),
  requestCancellation: vi.fn(),
}));

function makeGrace(overrides: Partial<CancellationGrace> = {}): CancellationGrace {
  return {
    requestedAt: "2026-01-01T00:00:00.000Z",
    gracePeriodSeconds: 30,
    graceExpiresAt: "2026-01-01T00:00:30.000Z",
    serverTimestamp: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderBanner(grace: CancellationGrace | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimeFormatProvider>
        <CancelGraceBanner escrowId="escrow-1" serverGrace={grace} />
      </TimeFormatProvider>
    </NextIntlClientProvider>
  );
}

describe("CancelGraceBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    window.localStorage.clear();
    mockUndo.mockReset();
    mockFinalize.mockReset();
    mockFinalize.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there's no active cancellation", () => {
    const { container } = renderBanner(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the undo countdown while cancelling", () => {
    renderBanner(makeGrace());
    expect(screen.getByText("Cancelling…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("clicking Undo clears the banner immediately (optimistic)", async () => {
    let resolveUndo: (v: unknown) => void = () => {};
    mockUndo.mockReturnValue(new Promise((resolve) => (resolveUndo = resolve)));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderBanner(makeGrace());
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.queryByText("Cancelling…")).toBeNull();

    resolveUndo({ data: { id: "escrow-1", status: "funded", cancellation: null }, error: null });
  });
});

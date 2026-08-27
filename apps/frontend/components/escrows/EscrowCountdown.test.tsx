import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Escrow } from "@delegolabs/types";
import { EscrowCountdown } from "./EscrowCountdown";

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "escrow-1",
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 100n,
    status: "funded",
    createdAt: "2026-01-01T00:00:00.000Z",
    originalDeadline: "2026-01-10T00:00:00.000Z",
    deadline: "2026-01-10T00:00:00.000Z",
    extensionsConsumed: 0,
    maxExtensions: 3,
    ...overrides,
  };
}

describe("EscrowCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when the escrow has no deadline metadata", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { container } = render(
      <EscrowCountdown escrow={makeEscrow({ deadline: undefined, originalDeadline: undefined })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("displays the original deadline and extensions-consumed metadata", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    render(<EscrowCountdown escrow={makeEscrow({ extensionsConsumed: 1, maxExtensions: 3 })} />);
    expect(screen.getByText("Original deadline")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("does not show the extension action far from expiry", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z")); // 9 days before deadline
    render(<EscrowCountdown escrow={makeEscrow()} />);
    expect(screen.queryByRole("button", { name: "Request extension" })).toBeNull();
  });

  it("shows the extension action once within the near-expiry window", () => {
    vi.setSystemTime(new Date("2026-01-09T12:00:00.000Z")); // 12h before a 24h threshold
    render(<EscrowCountdown escrow={makeEscrow()} />);
    expect(screen.getByRole("button", { name: "Request extension" })).toBeInTheDocument();
  });

  it("shows 'Expired' once the deadline has passed", () => {
    vi.setSystemTime(new Date("2026-01-11T00:00:00.000Z"));
    render(<EscrowCountdown escrow={makeEscrow()} />);
    expect(screen.getByTestId("escrow-countdown-remaining")).toHaveTextContent("Expired");
  });

  it("opens the extension modal from the action button", async () => {
    vi.setSystemTime(new Date("2026-01-09T12:00:00.000Z"));
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<EscrowCountdown escrow={makeEscrow()} />);
    await user.click(screen.getByRole("button", { name: "Request extension" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

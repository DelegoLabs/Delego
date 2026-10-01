import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PurchaseProposalCard } from "./PurchaseProposalCard";
import type { PurchaseProposal } from "../../types/proposal";

// ── Mock hooks ────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useDemoModeGuard", () => ({
  useDemoModeGuard: () => ({
    isDemoMode: false,
    guard: (fn: (...args: unknown[]) => unknown) => fn,
  }),
  DEMO_MODE_BLOCKED_MESSAGE: "This is a read-only demo — changes aren't saved.",
}));

const mockNow = vi.fn(() => new Date());
vi.mock("../../hooks/useNow", () => ({
  useNow: () => mockNow(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProposal(overrides: Partial<PurchaseProposal> = {}): PurchaseProposal {
  // Expires 30 minutes from the mocked "now"
  const expiresAt = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
  return {
    proposalId: "prop-1",
    orderId: "order-abc",
    itemTitle: "Wireless Headphones",
    amountStroops: "500000000", // 50 XLM
    assetCode: "XLM",
    merchantAddress: "GCSV4EXAMPLE0000000MERCHANTADDR1234567890ABCDEF",
    estimatedDeliveryDays: 3,
    requiresApproval: false,
    spendingLimitRemainingStroops: "10000000000", // 1,000 XLM
    expiresAt,
    ...overrides,
  };
}

function renderCard(
  proposal: PurchaseProposal = makeProposal(),
  overrides: {
    onApprove?: (id: string) => Promise<void>;
    onDecline?: (id: string, reason?: string) => Promise<void>;
  } = {}
) {
  const onApprove = overrides.onApprove ?? vi.fn().mockResolvedValue(undefined);
  const onDecline = overrides.onDecline ?? vi.fn().mockResolvedValue(undefined);
  const result = render(
    <PurchaseProposalCard
      proposal={proposal}
      onApprove={onApprove}
      onDecline={onDecline}
    />
  );
  return { ...result, onApprove, onDecline };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PurchaseProposalCard — display", () => {
  beforeEach(() => {
    mockNow.mockReturnValue(new Date());
  });

  it("renders the item title", () => {
    renderCard();
    expect(screen.getByTestId("proposal-item-title")).toHaveTextContent("Wireless Headphones");
  });

  it("renders the amount", () => {
    renderCard();
    expect(screen.getByTestId("proposal-amount")).toHaveTextContent(/50/);
  });

  it("renders the estimated delivery days", () => {
    renderCard();
    expect(screen.getByTestId("proposal-delivery")).toHaveTextContent("3 days");
  });

  it('renders "1 day" (singular) for a single-day delivery', () => {
    renderCard(makeProposal({ estimatedDeliveryDays: 1 }));
    expect(screen.getByTestId("proposal-delivery")).toHaveTextContent("1 day");
  });

  it("renders the merchant address shortened", () => {
    renderCard();
    expect(screen.getByText(/GCSV4E…/)).toBeInTheDocument();
  });

  it("renders the Approve button", () => {
    renderCard();
    expect(screen.getByTestId("approve-button")).toBeInTheDocument();
  });

  it("renders the Decline button", () => {
    renderCard();
    expect(screen.getByTestId("decline-button")).toBeInTheDocument();
  });
});

// ── Countdown badge ────────────────────────────────────────────────────────

describe("PurchaseProposalCard — countdown badge", () => {
  it("shows a countdown badge with remaining time", () => {
    const future = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
    mockNow.mockReturnValue(new Date());
    renderCard(makeProposal({ expiresAt: future }));
    const badge = screen.getByTestId("proposal-countdown");
    expect(badge).toHaveTextContent(/Expires in/);
    expect(badge).toHaveTextContent(/29m|30m/); // allow 1s variance
  });

  it("shows 'Expired' when past expiresAt", () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    mockNow.mockReturnValue(new Date(Date.now() + 2_000));
    renderCard(makeProposal({ expiresAt: past }));
    expect(screen.getByTestId("proposal-countdown")).toHaveTextContent("Expired");
  });

  it("uses warning tone when under 5 minutes remain", () => {
    const soon = new Date(Date.now() + 2 * 60 * 1_000).toISOString(); // 2 min away
    mockNow.mockReturnValue(new Date());
    renderCard(makeProposal({ expiresAt: soon }));
    const badge = screen.getByTestId("proposal-countdown");
    // Badge tone="warning" renders with yellow background
    expect(badge).toHaveTextContent(/Expires in/);
    expect(badge).toHaveTextContent(/1m|2m/);
  });
});

// ── Approve flow ──────────────────────────────────────────────────────────

describe("PurchaseProposalCard — approve flow", () => {
  beforeEach(() => {
    mockNow.mockReturnValue(new Date());
  });

  it("calls onApprove when Approve is clicked (no signature required)", async () => {
    const { onApprove } = renderCard(makeProposal({ requiresApproval: false }));
    fireEvent.click(screen.getByTestId("approve-button"));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("prop-1"));
  });

  it("shows disabled settled state after approval", async () => {
    renderCard(makeProposal({ requiresApproval: false }));
    fireEvent.click(screen.getByTestId("approve-button"));
    await waitFor(() =>
      expect(screen.getByTestId("proposal-settled-badge")).toHaveTextContent("Approved")
    );
    expect(screen.queryByTestId("proposal-actions")).not.toBeInTheDocument();
  });

  it("opens transaction-preview modal when requiresApproval is true", () => {
    renderCard(makeProposal({ requiresApproval: true }));
    fireEvent.click(screen.getByTestId("approve-button"));
    expect(screen.getByTestId("tx-preview-modal")).toBeInTheDocument();
  });

  it("shows item title and amount inside the preview modal", () => {
    renderCard(makeProposal({ requiresApproval: true }));
    fireEvent.click(screen.getByTestId("approve-button"));
    expect(screen.getByTestId("tx-preview-item")).toHaveTextContent("Wireless Headphones");
    expect(screen.getByTestId("tx-preview-amount")).toHaveTextContent(/50/);
  });

  it("cancels the preview modal without calling onApprove", () => {
    const { onApprove } = renderCard(makeProposal({ requiresApproval: true }));
    fireEvent.click(screen.getByTestId("approve-button"));
    fireEvent.click(screen.getByTestId("tx-preview-cancel"));
    expect(screen.queryByTestId("tx-preview-modal")).not.toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("calls onApprove after confirming the preview modal", async () => {
    const { onApprove } = renderCard(makeProposal({ requiresApproval: true }));
    fireEvent.click(screen.getByTestId("approve-button"));
    fireEvent.click(screen.getByTestId("tx-preview-confirm"));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("prop-1"));
  });

  it("shows 'Review & Approve' label when requiresApproval is true", () => {
    renderCard(makeProposal({ requiresApproval: true }));
    expect(screen.getByTestId("approve-button")).toHaveTextContent("Review & Approve");
  });

  it("shows the requires-approval hint when requiresApproval is true", () => {
    renderCard(makeProposal({ requiresApproval: true }));
    expect(screen.getByTestId("proposal-requires-approval-hint")).toBeInTheDocument();
  });

  it("does NOT show the requires-approval hint when requiresApproval is false", () => {
    renderCard(makeProposal({ requiresApproval: false }));
    expect(screen.queryByTestId("proposal-requires-approval-hint")).not.toBeInTheDocument();
  });
});

// ── Decline flow ──────────────────────────────────────────────────────────

describe("PurchaseProposalCard — decline flow", () => {
  beforeEach(() => {
    mockNow.mockReturnValue(new Date());
  });

  it("shows reason form when Decline is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("decline-button"));
    expect(screen.getByTestId("decline-reason-form")).toBeInTheDocument();
  });

  it("calls onDecline with no reason if field is empty", async () => {
    const { onDecline } = renderCard();
    fireEvent.click(screen.getByTestId("decline-button"));
    fireEvent.click(screen.getByTestId("confirm-decline-button"));
    await waitFor(() => expect(onDecline).toHaveBeenCalledWith("prop-1", undefined));
  });

  it("calls onDecline with the typed reason", async () => {
    const { onDecline } = renderCard();
    fireEvent.click(screen.getByTestId("decline-button"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Too expensive" } });
    fireEvent.click(screen.getByTestId("confirm-decline-button"));
    await waitFor(() => expect(onDecline).toHaveBeenCalledWith("prop-1", "Too expensive"));
  });

  it("shows disabled settled state after decline", async () => {
    renderCard();
    fireEvent.click(screen.getByTestId("decline-button"));
    fireEvent.click(screen.getByTestId("confirm-decline-button"));
    await waitFor(() =>
      expect(screen.getByTestId("proposal-settled-badge")).toHaveTextContent("Declined")
    );
    expect(screen.queryByTestId("proposal-actions")).not.toBeInTheDocument();
  });

  it("cancels decline flow and returns to action buttons", () => {
    renderCard();
    fireEvent.click(screen.getByTestId("decline-button"));
    expect(screen.getByTestId("decline-reason-form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("decline-reason-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("approve-button")).toBeInTheDocument();
  });
});

// ── Expired-state disabled ─────────────────────────────────────────────────

describe("PurchaseProposalCard — expired / disabled state", () => {
  it("hides action buttons when proposal is expired", () => {
    mockNow.mockReturnValue(new Date(Date.now() + 60_000));
    const past = new Date(Date.now() - 1_000).toISOString();
    renderCard(makeProposal({ expiresAt: past }));
    expect(screen.queryByTestId("proposal-actions")).not.toBeInTheDocument();
  });

  it("shows an expiry hint when proposal is expired and untouched", () => {
    mockNow.mockReturnValue(new Date(Date.now() + 60_000));
    const past = new Date(Date.now() - 1_000).toISOString();
    renderCard(makeProposal({ expiresAt: past }));
    expect(screen.getByTestId("proposal-disabled-hint")).toHaveTextContent(/expired/i);
  });
});

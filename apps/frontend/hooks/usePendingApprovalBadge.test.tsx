import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { usePendingApprovalBadge } from "./usePendingApprovalBadge";
import { NavPendingBadge } from "../components/layout/NavPendingBadge";
import {
  resetPendingApprovalStore,
  setPendingApprovalItems,
} from "../lib/pendingApprovalStore";
import type { PendingApprovalItem } from "../lib/pendingApprovals";

const mockFetchPendingApprovals = vi.fn();
vi.mock("../services/approvals", () => ({
  fetchPendingApprovals: () => mockFetchPendingApprovals(),
}));

function item(overrides: Partial<PendingApprovalItem> = {}): PendingApprovalItem {
  return {
    orderId: "ord_1",
    requestedBy: "GA",
    amountStroops: 10n,
    recipient: "GB",
    // Far enough out that the item can't lapse mid-test.
    expiresAt: new Date("2999-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("usePendingApprovalBadge", () => {
  beforeEach(() => {
    resetPendingApprovalStore();
    mockFetchPendingApprovals.mockReset();
    mockFetchPendingApprovals.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    resetPendingApprovalStore();
  });

  it("reports zero and loads the queue once when nothing is pending", async () => {
    const { result } = renderHook(() => usePendingApprovalBadge());

    await waitFor(() => expect(mockFetchPendingApprovals).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(0);
  });

  it("counts every item in the shared queue", async () => {
    setPendingApprovalItems([item({ orderId: "a" }), item({ orderId: "b" })]);

    const { result } = renderHook(() => usePendingApprovalBadge());
    await waitFor(() => expect(result.current).toBe(2));
  });

  it("reflects a signature recorded elsewhere in the app", async () => {
    const { result } = renderHook(() => usePendingApprovalBadge());
    await waitFor(() => expect(result.current).toBe(0));

    act(() => setPendingApprovalItems([item()]));
    expect(result.current).toBe(1);
  });

  it("excludes rows whose signature window already closed", async () => {
    setPendingApprovalItems([
      item({ orderId: "live" }),
      item({ orderId: "lapsed", expiresAt: new Date("2000-01-01T00:00:00Z") }),
    ]);

    const { result } = renderHook(() => usePendingApprovalBadge());
    await waitFor(() => expect(result.current).toBe(1));
  });

  it("stays hidden when the queue can't be loaded", async () => {
    mockFetchPendingApprovals.mockResolvedValue({
      data: null,
      error: { code: "network_error", message: "offline" },
    });

    const { result } = renderHook(() => usePendingApprovalBadge());
    await waitFor(() => expect(result.current).toBe(0));
  });
});

describe("NavPendingBadge", () => {
  beforeEach(() => {
    resetPendingApprovalStore();
  });

  afterEach(() => {
    resetPendingApprovalStore();
  });

  it("renders the count with an accessible label", async () => {
    setPendingApprovalItems([item({ orderId: "a" }), item({ orderId: "b" })]);

    render(<NavPendingBadge />);

    expect(screen.getByTestId("nav-pending-approvals-badge")).toHaveTextContent("2");
    expect(
      screen.getByLabelText("2 approvals awaiting your signature")
    ).toBeInTheDocument();
  });

  it("caps the display at 99+", () => {
    setPendingApprovalItems(
      Array.from({ length: 120 }, (_, i) => item({ orderId: `ord_${i}` }))
    );

    render(<NavPendingBadge />);

    expect(screen.getByTestId("nav-pending-approvals-badge")).toHaveTextContent("99+");
  });

  it("renders nothing when the queue is empty", () => {
    const { container } = render(<NavPendingBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});

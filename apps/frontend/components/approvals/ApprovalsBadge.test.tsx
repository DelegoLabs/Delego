import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mock usePendingApprovals ────────────────────────────────────────────────
vi.mock("../../hooks/usePendingApprovals", () => ({
  usePendingApprovals: vi.fn(),
}));

import { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { ApprovalsBadge } from "./ApprovalsBadge";

const mockUsePendingApprovals = vi.mocked(usePendingApprovals);

describe("ApprovalsBadge", () => {
  it("renders nothing when there are zero pending approvals", () => {
    mockUsePendingApprovals.mockReturnValue({
      count: 0,
      items: [],
      loading: false,
      error: null,
      pendingIds: new Set(),
      approve: vi.fn(),
      reject: vi.fn(),
      refresh: vi.fn(),
    });

    const { container } = render(<ApprovalsBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the count when there are pending approvals", () => {
    mockUsePendingApprovals.mockReturnValue({
      count: 3,
      items: [],
      loading: false,
      error: null,
      pendingIds: new Set(),
      approve: vi.fn(),
      reject: vi.fn(),
      refresh: vi.fn(),
    });

    render(<ApprovalsBadge />);
    const badge = screen.getByTestId("approvals-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("3");
  });

  it("caps the displayed count at 99+ for very large queues", () => {
    mockUsePendingApprovals.mockReturnValue({
      count: 150,
      items: [],
      loading: false,
      error: null,
      pendingIds: new Set(),
      approve: vi.fn(),
      reject: vi.fn(),
      refresh: vi.fn(),
    });

    render(<ApprovalsBadge />);
    expect(screen.getByTestId("approvals-badge")).toHaveTextContent("99+");
  });

  it("has an accessible aria-label", () => {
    mockUsePendingApprovals.mockReturnValue({
      count: 5,
      items: [],
      loading: false,
      error: null,
      pendingIds: new Set(),
      approve: vi.fn(),
      reject: vi.fn(),
      refresh: vi.fn(),
    });

    render(<ApprovalsBadge />);
    const badge = screen.getByTestId("approvals-badge");
    expect(badge).toHaveAttribute("aria-label", "5 pending approvals");
  });

  it("uses singular label for exactly 1 pending approval", () => {
    mockUsePendingApprovals.mockReturnValue({
      count: 1,
      items: [],
      loading: false,
      error: null,
      pendingIds: new Set(),
      approve: vi.fn(),
      reject: vi.fn(),
      refresh: vi.fn(),
    });

    render(<ApprovalsBadge />);
    expect(screen.getByTestId("approvals-badge")).toHaveAttribute(
      "aria-label",
      "1 pending approval"
    );
  });
});

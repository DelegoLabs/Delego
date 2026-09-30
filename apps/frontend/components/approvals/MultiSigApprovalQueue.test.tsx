import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiSigApprovalQueue } from "./MultiSigApprovalQueue";
import type { PendingApprovalItem } from "../../hooks/usePendingApprovals";

const NOW = new Date("2026-09-30T12:00:00.000Z");

function buildItem(overrides: Partial<PendingApprovalItem> = {}): PendingApprovalItem {
  return {
    orderId: "order-abc123",
    requestedBy: "user-alice",
    amountStroops: 1_500n * 10_000_000n, // 1500 XLM
    recipient: "merchant-shopify",
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000), // 24h from now
    ...overrides,
  };
}

describe("MultiSigApprovalQueue", () => {
  it("shows skeleton loader when loading and no items yet", () => {
    render(
      <MultiSigApprovalQueue
        items={[]}
        pendingIds={new Set()}
        loading={true}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId("multi-sig-queue-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("multi-sig-approval-list")).not.toBeInTheDocument();
  });

  it("shows an error message when error prop is set", () => {
    render(
      <MultiSigApprovalQueue
        items={[]}
        pendingIds={new Set()}
        error="Network error"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId("multi-sig-queue-error")).toHaveTextContent(
      "Network error"
    );
  });

  it("shows empty state when there are no items", () => {
    render(
      <MultiSigApprovalQueue
        items={[]}
        pendingIds={new Set()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId("multi-sig-queue-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("multi-sig-approval-list")).not.toBeInTheDocument();
  });

  it("renders a row for each item in the queue", () => {
    const items = [buildItem({ orderId: "order-1" }), buildItem({ orderId: "order-2" })];
    render(
      <MultiSigApprovalQueue
        items={items}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId("approval-row-order-1")).toBeInTheDocument();
    expect(screen.getByTestId("approval-row-order-2")).toBeInTheDocument();
  });

  it("renders the amount and expiry badge for an item", () => {
    render(
      <MultiSigApprovalQueue
        items={[buildItem()]}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    // Amount renders (1500 XLM)
    expect(screen.getByTestId("approval-amount")).toHaveTextContent("XLM");
    // Expiry badge renders
    expect(screen.getByTestId("approval-expiry-badge")).toBeInTheDocument();
  });

  it("calls onApprove with item and approverAddress when Approve button clicked", () => {
    const onApprove = vi.fn();
    const item = buildItem();
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={onApprove}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    fireEvent.click(screen.getByTestId(`btn-approve-${item.orderId}`));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onApprove).toHaveBeenCalledWith(item, "GAPPROVER");
  });

  it("calls onReject with item and approverAddress when Reject button clicked", () => {
    const onReject = vi.fn();
    const item = buildItem();
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={onReject}
        now={NOW}
      />
    );
    fireEvent.click(screen.getByTestId(`btn-reject-${item.orderId}`));
    expect(onReject).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledWith(item, "GAPPROVER");
  });

  it("disables action buttons when the order is in pendingIds", () => {
    const item = buildItem();
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set([item.orderId])}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId(`btn-approve-${item.orderId}`)).toBeDisabled();
    expect(screen.getByTestId(`btn-reject-${item.orderId}`)).toBeDisabled();
  });

  it("does not call onApprove when approverAddress is missing", () => {
    const onApprove = vi.fn();
    const item = buildItem();
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set()}
        approverAddress={null}
        onApprove={onApprove}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    // Wallet warning should be visible
    expect(screen.getByTestId("multi-sig-queue-no-wallet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`btn-approve-${item.orderId}`));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("shows 'Expired' badge when expiresAt is in the past", () => {
    const item = buildItem({
      expiresAt: new Date(NOW.getTime() - 1000), // 1 second ago
    });
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(screen.getByTestId("approval-expiry-badge")).toHaveTextContent(
      "Expired"
    );
  });

  it("has accessible aria-labels on action buttons", () => {
    const item = buildItem({ orderId: "ord-aria" });
    render(
      <MultiSigApprovalQueue
        items={[item]}
        pendingIds={new Set()}
        approverAddress="GAPPROVER"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        now={NOW}
      />
    );
    expect(
      screen.getByRole("button", { name: /Approve order ord-aria/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reject order ord-aria/i })
    ).toBeInTheDocument();
  });
});

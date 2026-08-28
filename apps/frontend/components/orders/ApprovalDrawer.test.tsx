import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Order } from "@delegolabs/types";
import { ApprovalDrawer } from "./ApprovalDrawer";
import type { OrderExplainability } from "../../lib/approvalExplainability";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    delegationId: "del-1",
    merchantId: "merchant-1",
    status: "pending_approval",
    lineItems: [
      { productId: "sku-1", quantity: 2, unitPriceStroops: 5_000_000n },
    ],
    totalStroops: 10_000_000n,
    escrowContractId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ApprovalDrawer", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("renders nothing when no order is open", () => {
    const { container } = render(
      <ApprovalDrawer
        order={null}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is announced as a labeled dialog", () => {
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog", {
      name: "Order order-1 details",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("collapses every optional explainability section when no data is provided", () => {
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText("Why the agent chose this")).toBeNull();
    expect(screen.queryByText("Decision evidence")).toBeNull();
    expect(screen.queryByText("Remaining limit")).toBeNull();
    expect(screen.queryByText("Typical range")).toBeNull();
  });

  it("renders every explainability section when the payload provides it", () => {
    const explainability: OrderExplainability = {
      reasoning: "Chose the lowest-priced comparable offer within budget.",
      priceRangeByProductId: {
        "sku-1": { lowStroops: 4_000_000n, highStroops: 6_000_000n },
      },
      evidenceLinks: [
        { url: "https://example.com/offer", label: "Comparable offer" },
      ],
      delegationContext: { remainingLimitStroops: 20_000_000n },
    };

    render(
      <ApprovalDrawer
        order={makeOrder()}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Why the agent chose this")).toBeDefined();
    expect(
      screen.getByText(
        "Chose the lowest-priced comparable offer within budget."
      )
    ).toBeDefined();
    expect(screen.getByText("Decision evidence")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Comparable offer" })
    ).toBeDefined();
    expect(screen.getByText("Remaining limit")).toBeDefined();
    expect(screen.getByText("2.00 XLM")).toBeDefined();
  });

  it("flags a line item priced above its typical range", () => {
    const explainability: OrderExplainability = {
      priceRangeByProductId: {
        "sku-1": { lowStroops: 1_000_000n, highStroops: 2_000_000n },
      },
    };
    render(
      <ApprovalDrawer
        order={makeOrder()}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const hint = screen.getByText("0.10–0.20 XLM");
    expect(hint.className).toContain("approval-price-hint-above");
  });

  it("calls onApprove/onReject with the order id", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={onApprove}
        onReject={onReject}
        onClose={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith("order-1");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledWith("order-1", undefined, undefined);
  });

  it("collects a structured reason and note before rejecting (#567)", async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={onReject}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByText("+ Add reason"));
    await user.selectOptions(
      screen.getByLabelText("Reason for rejection"),
      "wrong_item"
    );
    await user.type(
      screen.getByLabelText("Additional detail (optional)"),
      "Not what was requested"
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(onReject).toHaveBeenCalledWith(
      "order-1",
      "Not what was requested",
      "wrong_item"
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={onClose}
      />
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render a dual-control section for an order that doesn't require it", () => {
    render(
      <ApprovalDrawer order={makeOrder()} onApprove={vi.fn()} onReject={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByText("Dual-control approval")).toBeNull();
  });

  it("shows a waiting notice while a countersignature is pending (#574)", () => {
    const order = makeOrder({
      dualControl: {
        required: true,
        status: "awaiting_countersign",
        firstApproval: { approverId: "wallet-a", timestamp: "2026-01-01T00:00:00.000Z" },
      },
    });
    render(<ApprovalDrawer order={order} onApprove={vi.fn()} onReject={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("dual-control-drawer-notice")).toHaveTextContent(/waiting for countersignature/i);
  });

  it("shows both signer addresses and timestamps once dual control is completed", () => {
    const order = makeOrder({
      dualControl: {
        required: true,
        status: "completed",
        firstApproval: { approverId: "wallet-a", approverAddress: "GFIRST...", timestamp: "2026-01-01T00:00:00.000Z" },
        secondApproval: { approverId: "wallet-b", approverAddress: "GSECOND...", timestamp: "2026-01-02T00:00:00.000Z" },
      },
    });
    render(<ApprovalDrawer order={order} onApprove={vi.fn()} onReject={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("First approver")).toBeInTheDocument();
    expect(screen.getByText(/GFIRST\.\.\./)).toBeInTheDocument();
    expect(screen.getByText("Countersigned by")).toBeInTheDocument();
    expect(screen.getByText(/GSECOND\.\.\./)).toBeInTheDocument();
  });

  /* Price advisory strip (#571) */

  it("shows no price advisory strip when the payload carries no hints", () => {
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("status", { name: "Price advisory" })).toBeNull();
  });

  it("shows a green 'within typical range' advisory and leaves Approve enabled", () => {
    const explainability: OrderExplainability = {
      priceRangeByProductId: {
        "sku-1": { lowStroops: 4_000_000n, highStroops: 6_000_000n },
      },
    };
    render(
      <ApprovalDrawer
        order={makeOrder()}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const strip = screen.getByRole("status", { name: "Price advisory" });
    expect(strip).toHaveAttribute("data-advisory-level", "within");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("shows a gray 'no comparison' advisory when hints don't resolve to any item", () => {
    const explainability: OrderExplainability = {
      priceRangeByProductId: {
        "other-sku": { lowStroops: 1n, highStroops: 2n },
      },
    };
    render(
      <ApprovalDrawer
        order={makeOrder()}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("status", { name: "Price advisory" })
    ).toHaveAttribute("data-advisory-level", "no-data");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("gates Approve behind a confirmation tick for an above-range price, then enables it", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const explainability: OrderExplainability = {
      priceRangeByProductId: {
        "sku-1": { lowStroops: 1_000_000n, highStroops: 2_000_000n },
      },
    };
    render(
      <ApprovalDrawer
        order={makeOrder()}
        explainability={explainability}
        onApprove={onApprove}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByRole("status", { name: "Price advisory" })
    ).toHaveAttribute("data-advisory-level", "above");

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledWith("order-1");
  });

  it("remembers the pricing acknowledgement for the rest of the session", () => {
    const explainability: OrderExplainability = {
      priceRangeByProductId: {
        "sku-1": { lowStroops: 1_000_000n, highStroops: 2_000_000n },
      },
    };
    const { unmount } = render(
      <ApprovalDrawer
        order={makeOrder({ id: "order-1" })}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("checkbox"));
    unmount();

    // A different above-range order opened later this session: no re-tick needed.
    render(
      <ApprovalDrawer
        order={makeOrder({ id: "order-2" })}
        explainability={explainability}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("traps focus inside the dialog while open", () => {
    render(
      <ApprovalDrawer
        order={makeOrder()}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

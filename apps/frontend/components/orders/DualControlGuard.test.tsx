import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Order } from "@delegolabs/types";
import { DualControlGuard } from "./DualControlGuard";
import { SELF_COUNTERSIGN_MESSAGE } from "../../lib/dualControl";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    delegationId: "del-1",
    status: "pending_approval",
    totalStroops: 5_000n * 10_000_000n,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function renderGuard(order: Order, currentUserId: string, active: boolean) {
  return render(
    <DualControlGuard order={order} currentUserId={currentUserId} active={active}>
      {({ blocked, reason, awaitingCountersign }) => (
        <div>
          <span data-testid="blocked">{String(blocked)}</span>
          <span data-testid="awaiting">{String(awaitingCountersign)}</span>
          <span data-testid="reason">{reason ?? ""}</span>
        </div>
      )}
    </DualControlGuard>
  );
}

describe("DualControlGuard", () => {
  const awaitingOrder = makeOrder({
    dualControl: {
      required: true,
      status: "awaiting_countersign",
      firstApproval: { approverId: "user-1", timestamp: "2026-01-01T00:00:00.000Z" },
    },
  });

  it("is fully unblocked when dual control isn't active (flag off / API incapable), even for an awaiting_countersign order", () => {
    renderGuard(awaitingOrder, "user-1", false);
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
    expect(screen.getByTestId("awaiting")).toHaveTextContent("false");
  });

  it("is unblocked when active but the order doesn't require dual control", () => {
    renderGuard(makeOrder(), "user-1", true);
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
    expect(screen.getByTestId("awaiting")).toHaveTextContent("false");
  });

  it("blocks the original approver from self-countersigning, with the explanatory message", () => {
    renderGuard(awaitingOrder, "user-1", true);
    expect(screen.getByTestId("blocked")).toHaveTextContent("true");
    expect(screen.getByTestId("awaiting")).toHaveTextContent("true");
    expect(screen.getByTestId("reason")).toHaveTextContent(SELF_COUNTERSIGN_MESSAGE);
  });

  it("lets a different authorized delegate through to countersign", () => {
    renderGuard(awaitingOrder, "user-2", true);
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
    expect(screen.getByTestId("awaiting")).toHaveTextContent("true");
  });

  it("is unblocked once the flow has already completed", () => {
    const completed = makeOrder({
      dualControl: {
        required: true,
        status: "completed",
        firstApproval: { approverId: "user-1", timestamp: "2026-01-01T00:00:00.000Z" },
        secondApproval: { approverId: "user-2", timestamp: "2026-01-02T00:00:00.000Z" },
      },
    });
    renderGuard(completed, "user-1", true);
    expect(screen.getByTestId("blocked")).toHaveTextContent("false");
    expect(screen.getByTestId("awaiting")).toHaveTextContent("false");
  });
});

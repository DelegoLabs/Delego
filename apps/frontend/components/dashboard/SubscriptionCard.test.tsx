// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscriptionCard } from "./SubscriptionCard";
import type { SubscriptionPlan } from "../../lib/subscriptions";

const plan = (over: Partial<SubscriptionPlan> = {}): SubscriptionPlan => ({
  subscriptionId: "sub_1",
  merchantName: "Coffee Roasters Co",
  itemTitle: "Arabica Beans",
  intervalDays: 14,
  amountStroops: "25000000",
  nextExecutionDate: "2026-10-09",
  status: "active",
  ...over,
});

describe("SubscriptionCard", () => {
  it("renders subscription details and status badge", () => {
    render(<SubscriptionCard subscriptions={[plan()]} />);
    expect(screen.getByText("Arabica Beans")).toBeInTheDocument();
    expect(screen.getByText("Coffee Roasters Co")).toBeInTheDocument();
    expect(screen.getByText("Every 14 days")).toBeInTheDocument();
    expect(screen.getByText("2.5 XLM")).toBeInTheDocument();
    expect(screen.getByText("Oct 9, 2026")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<SubscriptionCard subscriptions={[]} loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    rerender(<SubscriptionCard subscriptions={[]} error="boom" />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByText("No recurring orders yet.")).toBeInTheDocument();
  });

  it("pauses an active subscription and resumes a paused one", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async () => true);
    const { rerender } = render(
      <SubscriptionCard subscriptions={[plan()]} onAction={onAction} />
    );
    await user.click(screen.getByRole("button", { name: "Pause Arabica Beans" }));
    expect(onAction).toHaveBeenCalledWith("sub_1", "pause");

    rerender(
      <SubscriptionCard subscriptions={[plan({ status: "paused" })]} onAction={onAction} />
    );
    await user.click(screen.getByRole("button", { name: "Resume Arabica Beans" }));
    expect(onAction).toHaveBeenCalledWith("sub_1", "resume");
  });

  it("requires confirmation before cancelling", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn(async () => true);
    render(<SubscriptionCard subscriptions={[plan()]} onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Cancel Arabica Beans" }));
    expect(onAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("button", { name: "Cancel Arabica Beans" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel Arabica Beans" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(onAction).toHaveBeenCalledWith("sub_1", "cancel");
  });

  it("disables actions while a request is pending and hides them when cancelled", () => {
    const { rerender } = render(
      <SubscriptionCard subscriptions={[plan()]} pendingIds={new Set(["sub_1"])} />
    );
    expect(screen.getByRole("button", { name: "Pause Arabica Beans" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel Arabica Beans" })).toBeDisabled();

    rerender(<SubscriptionCard subscriptions={[plan({ status: "cancelled" })]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

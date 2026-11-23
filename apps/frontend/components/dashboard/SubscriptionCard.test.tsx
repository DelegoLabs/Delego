// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { SubscriptionCard } from "./SubscriptionCard";
import type { SubscriptionPlan } from "../../lib/subscriptions";

const sub: SubscriptionPlan = {
  subscriptionId: "sub_1",
  merchantName: "Coffee",
  itemTitle: "Beans",
  intervalDays: 14,
  amountStroops: "2500",
  nextExecutionDate: "2026-10-09",
  status: "active",
};

describe("SubscriptionCard modals", () => {
  it("submits a valid interval", async () => {
    const user = userEvent.setup();
    const onUpdateInterval = vi.fn();
    render(<SubscriptionCard subscriptions={[sub]} onUpdateInterval={onUpdateInterval} />);
    await user.click(screen.getByRole("button", { name: "Edit interval" }));
    const input = screen.getByLabelText("Interval (days)");
    await user.clear(input);
    await user.type(input, "30");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onUpdateInterval).toHaveBeenCalledWith("sub_1", 30));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each([
    ["", "required"],
    ["abc", "whole number"],
    ["0", "between"],
    ["400", "between"],
  ])("rejects invalid interval %j", async (value, message) => {
    const user = userEvent.setup();
    const onUpdateInterval = vi.fn();
    render(<SubscriptionCard subscriptions={[sub]} onUpdateInterval={onUpdateInterval} />);
    await user.click(screen.getByRole("button", { name: "Edit interval" }));
    const input = screen.getByLabelText("Interval (days)");
    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(onUpdateInterval).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("submits a valid price ceiling", async () => {
    const user = userEvent.setup();
    const onUpdatePriceCeiling = vi.fn();
    render(<SubscriptionCard subscriptions={[sub]} onUpdatePriceCeiling={onUpdatePriceCeiling} />);
    await user.click(screen.getByRole("button", { name: "Edit price ceiling" }));
    const input = screen.getByLabelText("Maximum price (stroops)");
    await user.clear(input);
    await user.type(input, "5000");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onUpdatePriceCeiling).toHaveBeenCalledWith("sub_1", "5000"));
  });

  it.each([
    ["", "required"],
    ["-5", "whole number"],
    ["1.5", "whole number"],
    ["0", "greater than zero"],
  ])("rejects invalid price ceiling %j", async (value, message) => {
    const user = userEvent.setup();
    const onUpdatePriceCeiling = vi.fn();
    render(<SubscriptionCard subscriptions={[sub]} onUpdatePriceCeiling={onUpdatePriceCeiling} />);
    await user.click(screen.getByRole("button", { name: "Edit price ceiling" }));
    const input = screen.getByLabelText("Maximum price (stroops)");
    await user.clear(input);
    if (value) await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(onUpdatePriceCeiling).not.toHaveBeenCalled();
  });

  it("closes on Cancel", async () => {
    const user = userEvent.setup();
    render(<SubscriptionCard subscriptions={[sub]} />);
    await user.click(screen.getByRole("button", { name: "Edit interval" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

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

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

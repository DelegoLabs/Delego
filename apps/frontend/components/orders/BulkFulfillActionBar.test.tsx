import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { BulkFulfillActionBar, type BulkFulfillActionBarProps } from "./BulkFulfillActionBar";

function renderBar(props: Partial<BulkFulfillActionBarProps> = {}) {
  const handlers = { onBulkFulfill: vi.fn(), onClearSelection: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BulkFulfillActionBar selectedCount={2} {...handlers} {...props} />
    </NextIntlClientProvider>
  );
  return handlers;
}

describe("BulkFulfillActionBar", () => {
  it("renders nothing with no selection", () => {
    renderBar({ selectedCount: 0 });
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("shows the selection count and fires its actions", async () => {
    const user = userEvent.setup();
    const handlers = renderBar({ selectedCount: 3 });
    expect(screen.getByRole("region", { name: "Bulk order actions" })).toHaveTextContent("3 orders selected");
    await user.click(screen.getByRole("button", { name: "Bulk Fulfill" }));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(handlers.onBulkFulfill).toHaveBeenCalledOnce();
    expect(handlers.onClearSelection).toHaveBeenCalledOnce();
  });

  it("disables its actions while a batch is submitting", () => {
    renderBar({ busy: true });
    expect(screen.getByRole("button", { name: "Bulk Fulfill" })).toBeDisabled();
  });
});

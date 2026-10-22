import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../messages/en.json";
import { BulkFulfillModal } from "./BulkFulfillModal";


const FEDEX = "123456789012";
const UPS = "1Z999AA10123456784";

function renderModal(orderIds = ["ord-1", "ord-2"]) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BulkFulfillModal open orderIds={orderIds} onClose={onClose} onSubmit={onSubmit} />
    </NextIntlClientProvider>
  );
  return { onSubmit, onClose };
}

describe("BulkFulfillModal", () => {
  it("assigns manually entered tracking numbers to their own orders", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    expect(screen.getByRole("dialog", { name: "Fulfill 2 orders" })).toBeInTheDocument();

    const first = screen.getByRole("group", { name: "Order ord-1" });
    const second = screen.getByRole("group", { name: "Order ord-2" });
    await user.type(within(first).getByLabelText("Tracking number"), FEDEX);
    await user.selectOptions(within(second).getByLabelText("Carrier"), "ups");
    await user.type(within(second).getByLabelText("Tracking number"), UPS);
    await user.click(screen.getByRole("button", { name: "Mark 2 orders shipped" }));

    expect(onSubmit).toHaveBeenCalledWith([
      { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
      { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
    ]);
  });

  it("blocks submission and flags the invalid order", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    const first = screen.getByRole("group", { name: "Order ord-1" });
    await user.type(within(first).getByLabelText("Tracking number"), FEDEX);
    await user.click(screen.getByRole("button", { name: "Mark 2 orders shipped" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const secondInput = within(screen.getByRole("group", { name: "Order ord-2" })).getByLabelText("Tracking number");
    expect(secondInput).toHaveAttribute("aria-invalid", "true");
    expect(secondInput).toHaveAccessibleDescription("Order, carrier and tracking number are all required.");
  });

  it("previews a pasted CSV and submits its rows", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await user.click(screen.getByRole("radio", { name: "Upload CSV" }));
    fireEvent.change(screen.getByLabelText("Or paste CSV"), {
      target: { value: `orderId,carrier,trackingNumber\nord-2,UPS,${UPS}\nord-1,FedEx,${FEDEX}` },
    });

    const preview = screen.getByRole("table", { name: "Tracking numbers to assign" });
    expect(within(preview).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "OrderCarrierTracking number",
      `ord-2UPS${UPS}`,
      `ord-1FedEx${FEDEX}`,
    ]);
    await user.click(screen.getByRole("button", { name: "Mark 2 orders shipped" }));
    expect(onSubmit).toHaveBeenCalledWith([
      { orderId: "ord-2", carrier: "ups", trackingNumber: UPS },
      { orderId: "ord-1", carrier: "fedex", trackingNumber: FEDEX },
    ]);
  });

  it("reads an uploaded CSV file and reports bad rows by line", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();
    await user.click(screen.getByRole("radio", { name: "Upload CSV" }));
    const file = new File([`orderId,carrier,trackingNumber\nord-1,FedEx,${FEDEX}\nord-5,UPS,${UPS}`], "ship.csv", {
      type: "text/csv",
    });
    await user.upload(screen.getByLabelText("CSV file"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("Line 3: Order ord-5 isn't one of the selected orders.");
    expect(screen.getByRole("button", { name: "Mark 1 order shipped" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

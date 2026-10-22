import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import type { MerchantEscrowOrder } from "../../../lib/merchantEscrowOrders";
import MerchantOrdersPage from "./page";

const FEDEX = "123456789012";

const mockOrders = vi.fn<() => MerchantEscrowOrder[]>();
const mockRefresh = vi.fn(async () => {});
vi.mock("../../../hooks/useMerchantEscrowOrders", () => ({
  useMerchantEscrowOrders: () => ({ orders: mockOrders(), loading: false, error: null, refresh: mockRefresh }),
}));

const mockSubmitShipment = vi.fn();
vi.mock("../../../lib/shipments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/shipments")>()),
  submitShipment: (...args: unknown[]) => mockSubmitShipment(...args),
}));


// jsdom has no layout, so the virtualizer would render no rows.
vi.mock("../../../components/orders/VirtualTable", () => ({
  VirtualTable: <T,>({ data, renderRow }: { data: T[]; renderRow: (row: T, i: number) => React.ReactNode }) => (
    <div>{data.map((row, i) => renderRow(row, i))}</div>
  ),
}));
vi.mock("../../../components/escrows/DeliveryEvidenceUploader", () => ({ DeliveryEvidenceUploader: () => null }));
vi.mock("../../../components/delegations/ExpiryCountdown", () => ({ ExpiryCountdown: () => null }));

function order(orderId: string, status: MerchantEscrowOrder["status"] = "funded"): MerchantEscrowOrder {
  return {
    orderId,
    escrowId: `esc-${orderId}`,
    buyerAddress: "GBUYERADDRESS",
    amountStroops: "10000000",
    currency: "USDC",
    status,
    shippingAddress: "1 Main St",
    fundedAt: "2026-03-01T00:00:00Z",
    deadline: "2099-03-08T00:00:00Z",
  };
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MerchantOrdersPage />
    </NextIntlClientProvider>
  );
}

async function fulfillSelected(user: ReturnType<typeof userEvent.setup>, ids: string[]) {
  await user.click(screen.getByRole("button", { name: "Bulk Fulfill" }));
  const dialog = screen.getByRole("dialog");
  for (const [i, id] of ids.entries()) {
    const group = within(dialog).getByRole("group", { name: `Order ${id}` });
    await user.type(within(group).getByLabelText("Tracking number"), `${FEDEX.slice(0, -1)}${i}`);
  }
  await user.click(within(dialog).getByRole("button", { name: /shipped$/ }));
}

describe("MerchantOrdersPage bulk fulfillment (#1014)", () => {
  beforeEach(() => {
    mockOrders.mockReturnValue([order("ord-1"), order("ord-2"), order("ord-3"), order("ord-4", "shipped")]);
    mockRefresh.mockClear();
    mockSubmitShipment.mockReset();
  });

  it("shows checkboxes only on orders to ship, and the action bar once one is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getAllByRole("checkbox", { name: /^Select order/ })).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Bulk order actions" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select order ord-2" }));
    expect(screen.getByRole("region", { name: "Bulk order actions" })).toHaveTextContent("1 order selected");

    await user.click(screen.getByRole("checkbox", { name: "Select all orders to ship" }));
    expect(screen.getByRole("region", { name: "Bulk order actions" })).toHaveTextContent("3 orders selected");
  });

  it("ships the selected orders optimistically with each tracking number on its own order", async () => {
    const user = userEvent.setup();
    let resolveAll!: () => void;
    const pending = new Promise<void>((resolve) => (resolveAll = resolve));
    mockSubmitShipment.mockImplementation(() => pending);
    renderPage();

    await user.click(screen.getByRole("checkbox", { name: "Select order ord-1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select order ord-3" }));
    await fulfillSelected(user, ["ord-1", "ord-3"]);

    // Optimistic: moved out of "To Ship" before the requests settle.
    expect(screen.getByRole("tab", { name: "To Ship (1)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Shipped (3)" })).toBeInTheDocument();
    expect(mockSubmitShipment).toHaveBeenCalledWith({ orderId: "ord-1", carrier: "fedex", trackingNumber: "123456789010" });
    expect(mockSubmitShipment).toHaveBeenCalledWith({ orderId: "ord-3", carrier: "fedex", trackingNumber: "123456789011" });

    resolveAll();
    expect(await screen.findByText("2 orders marked shipped.")).toBeInTheDocument();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("rolls back only the orders whose submission failed", async () => {
    const user = userEvent.setup();
    mockSubmitShipment.mockImplementation(async ({ orderId }: { orderId: string }) => {
      if (orderId === "ord-2") throw new Error("Escrow not funded");
    });
    // Hold the post-batch refresh so the optimistic state stays observable.
    mockRefresh.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();

    await user.click(screen.getByRole("checkbox", { name: "Select all orders to ship" }));
    await fulfillSelected(user, ["ord-1", "ord-2", "ord-3"]);

    expect(
      await screen.findByText("1 order couldn't be shipped and was moved back to To Ship: ord-2")
    ).toBeInTheDocument();
    expect(screen.getByText("2 orders marked shipped.")).toBeInTheDocument();
    // Only ord-2 is back in the To Ship queue; ord-1 and ord-3 stay shipped.
    expect(screen.getByRole("tab", { name: "To Ship (1)" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /^Select order/ }).map((c) => c.getAttribute("aria-label"))).toEqual([
      "Select order ord-2",
    ]);
  });
});

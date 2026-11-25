import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@delegolabs/types";
import { OrderTable } from "./OrderTable";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en-US",
}));

vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({
    currencyId: "xlm",
    rate: { xlmUsdRate: 1.0 },
  }),
}));

vi.mock("../../hooks/useTimeFormat", () => ({
  useTimeFormat: () => ({
    preferences: { hourCycle: "h12", timeZone: "UTC" },
  }),
}));

vi.mock("@delegolabs/ui", () => ({
  Amount: ({ stroops }: { stroops: bigint }) => (
    <span data-testid="amount">{String(stroops)}</span>
  ),
}));

vi.mock("../layout/HoverPrefetchLink", () => ({
  HoverPrefetchLink: ({
    href,
    children,
    className,
    title,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    title?: string;
  }) => (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  ),
}));

vi.mock("./OrderStatusBadge", () => ({
  OrderStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

vi.mock("./DownloadInvoiceButton", () => ({
  DownloadInvoiceButton: ({ order }: { order: Order }) => (
    <button type="button" data-testid={`download-${order.id}`}>
      PDF
    </button>
  ),
}));

const sampleOrders: Order[] = [
  {
    id: "ord-2",
    delegationId: "del-1",
    merchantId: "merch-b",
    status: "settled",
    totalStroops: 500_000_000n,
    lineItems: [{ productId: "p1", quantity: 2, unitPriceStroops: 250_000_000n }],
    createdAt: new Date("2026-06-10T10:00:00Z"),
    updatedAt: new Date("2026-06-10T10:00:00Z"),
  },
  {
    id: "ord-1",
    delegationId: "del-1",
    merchantId: "merch-a",
    status: "approved",
    totalStroops: 2_000_000_000n,
    lineItems: [{ productId: "p2", quantity: 1, unitPriceStroops: 2_000_000_000n }],
    createdAt: new Date("2026-06-01T10:00:00Z"),
    updatedAt: new Date("2026-06-01T10:00:00Z"),
  },
  {
    id: "ord-3",
    delegationId: "del-2",
    merchantId: "merch-c",
    status: "pending_approval",
    totalStroops: 1_000_000_000n,
    lineItems: [{ productId: "p3", quantity: 3, unitPriceStroops: 333_333_333n }],
    createdAt: new Date("2026-06-20T10:00:00Z"),
    updatedAt: new Date("2026-06-20T10:00:00Z"),
  },
];

function getRowOrderIds(): string[] {
  const rows = screen.getAllByRole("row").slice(1);
  return rows.map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

describe("OrderTable", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("renders sortable headers with aria-sort='none' initially and preserves input order", () => {
    render(<OrderTable orders={sampleOrders} />);

    expect(screen.getByRole("columnheader", { name: /status/i })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(screen.getByRole("columnheader", { name: /total/i })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(screen.getByRole("columnheader", { name: /created/i })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(getRowOrderIds()).toEqual(["ord-2", "ord-1", "ord-3"]);
  });

  it("sorts by status ascending then descending and updates aria-sort", () => {
    render(<OrderTable orders={sampleOrders} />);

    const statusButton = screen.getByRole("button", { name: /status/i });
    const statusHeader = screen.getByRole("columnheader", { name: /status/i });

    fireEvent.click(statusButton);
    expect(statusHeader).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: /total/i })).toHaveAttribute(
      "aria-sort",
      "none"
    );
    expect(getRowOrderIds()).toEqual(["ord-1", "ord-3", "ord-2"]);

    fireEvent.click(statusButton);
    expect(statusHeader).toHaveAttribute("aria-sort", "descending");
    expect(getRowOrderIds()).toEqual(["ord-2", "ord-3", "ord-1"]);
  });

  it("sorts by amount (Total) descending then ascending and updates aria-sort", () => {
    render(<OrderTable orders={sampleOrders} />);

    const totalButton = screen.getByRole("button", { name: /total/i });
    const totalHeader = screen.getByRole("columnheader", { name: /total/i });

    fireEvent.click(totalButton);
    expect(totalHeader).toHaveAttribute("aria-sort", "descending");
    expect(getRowOrderIds()).toEqual(["ord-1", "ord-3", "ord-2"]);

    fireEvent.click(totalButton);
    expect(totalHeader).toHaveAttribute("aria-sort", "ascending");
    expect(getRowOrderIds()).toEqual(["ord-2", "ord-3", "ord-1"]);
  });

  it("sorts by date (Created) descending then ascending and updates aria-sort", () => {
    render(<OrderTable orders={sampleOrders} />);

    const createdButton = screen.getByRole("button", { name: /created/i });
    const createdHeader = screen.getByRole("columnheader", { name: /created/i });

    fireEvent.click(createdButton);
    expect(createdHeader).toHaveAttribute("aria-sort", "descending");
    expect(getRowOrderIds()).toEqual(["ord-3", "ord-2", "ord-1"]);

    fireEvent.click(createdButton);
    expect(createdHeader).toHaveAttribute("aria-sort", "ascending");
    expect(getRowOrderIds()).toEqual(["ord-1", "ord-2", "ord-3"]);
  });

  it("navigates to /orders/[id] when pressing Enter or Space on a focused row", () => {
    render(<OrderTable orders={sampleOrders} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(rows[0], { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/orders/ord-2");

    pushMock.mockClear();
    fireEvent.keyDown(rows[1], { key: " " });
    expect(pushMock).toHaveBeenCalledWith("/orders/ord-1");
  });

  it("does not trigger row navigation when activating interactive child controls", () => {
    render(<OrderTable orders={sampleOrders} />);

    const downloadButton = screen.getByTestId("download-ord-2");
    fireEvent.click(downloadButton);
    fireEvent.keyDown(downloadButton, { key: "Enter" });
    fireEvent.keyDown(downloadButton, { key: " " });

    const orderLink = screen.getByRole("link", { name: "ord-2" });
    fireEvent.click(orderLink);
    fireEvent.keyDown(orderLink, { key: "Enter" });

    expect(pushMock).not.toHaveBeenCalled();
  });
});

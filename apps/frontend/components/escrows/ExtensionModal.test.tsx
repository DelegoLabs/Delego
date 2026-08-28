import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Escrow } from "@delegolabs/types";
import { ExtensionModal } from "./ExtensionModal";

const mockRequestExtension = vi.fn();
vi.mock("../../services/payments", () => ({
  requestExtension: (...args: unknown[]) => mockRequestExtension(...args),
}));

function makeEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: "escrow-1",
    escrowId: "escrow-1",
    orderId: "order-1",
    buyer: "buyer-1",
    seller: "seller-1",
    amount: 100n,
    status: "funded",
    createdAt: "2026-01-01T00:00:00.000Z",
    originalDeadline: "2026-01-10T00:00:00.000Z",
    deadline: "2026-01-10T00:00:00.000Z",
    extensionsConsumed: 0,
    maxExtensions: 3,
    maxExtensionSeconds: 90 * 24 * 3600,
    ...overrides,
  };
}

describe("ExtensionModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockRequestExtension.mockReset();
  });

  it("renders a preset button for each duration", () => {
    render(<ExtensionModal escrow={makeEscrow()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /\+1 day/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+1 week/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+1 month/ })).toBeInTheDocument();
  });

  it("disables an out-of-bounds preset and shows the inline reason", () => {
    const escrow = makeEscrow({ extensionsConsumed: 3, maxExtensions: 3 });
    render(<ExtensionModal escrow={escrow} onClose={vi.fn()} />);
    const dayButton = screen.getByRole("button", { name: /\+1 day/ });
    expect(dayButton).toBeDisabled();
    expect(screen.getAllByText(/maximum of 3 extensions already used/i).length).toBeGreaterThan(0);
  });

  it("posts an optimistic timeline entry immediately on submit", async () => {
    let resolveRequest: (v: unknown) => void = () => {};
    mockRequestExtension.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)));
    const user = userEvent.setup();

    render(<ExtensionModal escrow={makeEscrow()} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /\+1 week/ }));

    const stored = JSON.parse(window.localStorage.getItem("delego:escrow-timeline:escrow-1") as string);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      type: "extension_requested",
      title: "Extension requested (+1w)",
      status: "pending",
    });

    resolveRequest({
      data: {
        escrow: makeEscrow({ extensionsConsumed: 1 }),
        timelineEvent: { id: "evt-1", label: "Extension requested (+1w)", timestamp: "2026-01-01T00:00:00.000Z" },
      },
      error: null,
    });
  });

  it("confirms the optimistic entry and calls onExtended on success", async () => {
    mockRequestExtension.mockResolvedValue({
      data: {
        escrow: makeEscrow({ extensionsConsumed: 1 }),
        timelineEvent: { id: "evt-1", label: "Extension requested (+1w)", timestamp: "2026-01-01T00:00:00.000Z" },
      },
      error: null,
    });
    const onExtended = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<ExtensionModal escrow={makeEscrow()} onClose={onClose} onExtended={onExtended} />);
    await user.click(screen.getByRole("button", { name: /\+1 week/ }));

    expect(onExtended).toHaveBeenCalledWith(expect.objectContaining({ extensionsConsumed: 1 }));
    expect(onClose).toHaveBeenCalled();

    const stored = JSON.parse(window.localStorage.getItem("delego:escrow-timeline:escrow-1") as string);
    expect(stored[0].status).toBe("confirmed");
  });

  it("rolls back the optimistic entry cleanly when the request fails", async () => {
    mockRequestExtension.mockResolvedValue({ data: null, error: { code: "chain_error", message: "Transaction rejected" } });
    const user = userEvent.setup();

    render(<ExtensionModal escrow={makeEscrow()} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /\+1 week/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Transaction rejected");
    const stored = JSON.parse(window.localStorage.getItem("delego:escrow-timeline:escrow-1") as string);
    expect(stored).toHaveLength(0);
  });
});

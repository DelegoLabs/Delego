import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SpendPreviewSimulator } from "./SpendPreviewSimulator";

const mockPreviewSpend = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    previewSpend: (...args: unknown[]) => mockPreviewSpend(...args),
  },
}));

vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "GOWNERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
}));

const VALID_ADDR = "G" + "A".repeat(55);

async function fillAndSimulate() {
  const amountInput = screen.getByLabelText("Amount in XLM");
  fireEvent.change(amountInput, { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Delegate address"), { target: { value: VALID_ADDR } });
  fireEvent.change(screen.getByLabelText("Merchant address"), { target: { value: VALID_ADDR } });
  fireEvent.click(screen.getByRole("button", { name: /Simulate/ }));
}

describe("SpendPreviewSimulator", () => {
  beforeEach(() => {
    mockPreviewSpend.mockReset();
  });

  it("shows a designed empty state before any simulation runs", () => {
    render(<SpendPreviewSimulator />);
    expect(screen.getByText(/Enter an amount and both addresses/)).toBeDefined();
  });

  it("disables Simulate until amount and both addresses are valid", () => {
    render(<SpendPreviewSimulator />);
    const button = screen.getByRole("button", { name: "Simulate" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Amount in XLM"), { target: { value: "30" } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Delegate address"), { target: { value: VALID_ADDR } });
    fireEvent.change(screen.getByLabelText("Merchant address"), { target: { value: VALID_ADDR } });
    expect(button).not.toBeDisabled();
  });

  it("shows a designed loading state while simulating", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    mockPreviewSpend.mockReturnValue(new Promise((resolve) => { resolveFn = resolve; }));

    render(<SpendPreviewSimulator />);
    await fillAndSimulate();

    expect(screen.getByText("Running simulation…")).toBeDefined();
    resolveFn({ data: { allowed: true, reason: "ok", remainingAfterStroops: "100000000" }, error: null });
    await waitFor(() => expect(screen.getByText("Allowed")).toBeDefined());
  });

  it("shows a designed error state when the simulation call fails", async () => {
    mockPreviewSpend.mockResolvedValue({ data: null, error: { code: "SPEND_PREVIEW_FAILED", message: "RPC unavailable" } });

    render(<SpendPreviewSimulator />);
    await fillAndSimulate();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("RPC unavailable"));
  });

  it("renders the cap remediation link and calls onEditLimits for a per_tx_limit denial", async () => {
    mockPreviewSpend.mockResolvedValue({
      data: { allowed: false, reason: "per_tx_limit", remainingAfterStroops: "0" },
      error: null,
    });
    const onEditLimits = vi.fn();

    render(<SpendPreviewSimulator onEditLimits={onEditLimits} />);
    await fillAndSimulate();

    const link = await screen.findByRole("button", { name: "Edit limits" });
    fireEvent.click(link);
    expect(onEditLimits).toHaveBeenCalledTimes(1);
  });

  it("renders the resume remediation link and calls onResume for a paused denial", async () => {
    mockPreviewSpend.mockResolvedValue({
      data: { allowed: false, reason: "paused", remainingAfterStroops: "100000000" },
      error: null,
    });
    const onResume = vi.fn();

    render(<SpendPreviewSimulator onResume={onResume} />);
    await fillAndSimulate();

    const link = await screen.findByRole("button", { name: "Resume delegation" });
    fireEvent.click(link);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("renders the merchant remediation link for a bad_merchant denial", async () => {
    mockPreviewSpend.mockResolvedValue({
      data: { allowed: false, reason: "bad_merchant", remainingAfterStroops: "100000000" },
      error: null,
    });

    render(<SpendPreviewSimulator />);
    await fillAndSimulate();

    expect(await screen.findByRole("button", { name: "Edit allowed merchants" })).toBeDefined();
  });

  it("renders the renew remediation link for an expired denial", async () => {
    mockPreviewSpend.mockResolvedValue({
      data: { allowed: false, reason: "expired", remainingAfterStroops: "100000000" },
      error: null,
    });

    render(<SpendPreviewSimulator />);
    await fillAndSimulate();

    expect(await screen.findByRole("button", { name: "Renew delegation" })).toBeDefined();
  });

  it("renders no remediation link for a reason outside the four constraint classes", async () => {
    mockPreviewSpend.mockResolvedValue({
      data: { allowed: false, reason: "unauthorized", remainingAfterStroops: "100000000" },
      error: null,
    });

    render(<SpendPreviewSimulator />);
    await fillAndSimulate();

    await waitFor(() => expect(screen.getByText("Denied")).toBeDefined());
    expect(screen.queryByText(/Blocked by:/)).toBeNull();
  });
});

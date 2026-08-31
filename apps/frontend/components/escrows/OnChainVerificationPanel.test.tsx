import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NetworkProvider } from "../../hooks/useNetwork";
import { OnChainVerificationPanel } from "./OnChainVerificationPanel";
import * as receiptGetters from "../../services/receiptGetters";

const CONTRACT = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

function Providers({ children }: { children: React.ReactNode }) {
  return <NetworkProvider>{children}</NetworkProvider>;
}

describe("OnChainVerificationPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders nothing when no contract is configured for the network", () => {
    const { container } = render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={null}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a calm green match when the receipt matches local data", async () => {
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });

    render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={CONTRACT}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );

    await waitFor(() =>
      expect(screen.getByText(/matches local data/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("status")).toHaveTextContent(/matches/i);
  });

  it("shows a loud, actionable warning on a mismatch", async () => {
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "999" } },
    });

    render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={CONTRACT}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/integrity warning/i);
    expect(screen.getByText("Mismatch")).toBeInTheDocument();
  });

  it("shows a retry action on fetch failure", async () => {
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: false,
      error: "RPC unavailable",
    });

    render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={CONTRACT}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );

    await waitFor(() =>
      expect(screen.getByText(/RPC unavailable/)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("toggles the raw JSON view", async () => {
    const user = userEvent.setup();
    vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });

    render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={CONTRACT}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );

    await waitFor(() => screen.getByRole("button", { name: /show raw json/i }));
    expect(screen.queryByText(/"amount": "100"/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /show raw json/i }));
    expect(screen.getByText(/"amount": "100"/)).toBeInTheDocument();
  });

  it("re-fetches with bypassCache=true when Refresh is clicked", async () => {
    const spy = vi.spyOn(receiptGetters, "fetchReceipt").mockResolvedValue({
      ok: true,
      result: { kind: "buyer", data: { amount: "100" } },
    });
    const user = userEvent.setup();

    render(
      <OnChainVerificationPanel
        kind="buyer"
        receiptKey="escrow-1"
        contractAddress={CONTRACT}
        localData={{ amount: "100" }}
        compareFields={["amount"]}
      />,
      { wrapper: Providers }
    );

    await waitFor(() => screen.getByRole("button", { name: /^refresh$/i }));
    await user.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1][5]).toBe(true);
  });
});

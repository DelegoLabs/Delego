import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutRefundButton } from "./TimeoutRefundButton";
import { WALLET_CANCELLED_MESSAGE } from "../../services/wallet";

const { invokeEscrowRefundMock } = vi.hoisted(() => ({
  invokeEscrowRefundMock: vi.fn(),
}));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: () => ({
    network: {
      sorobanRpcUrl: "https://rpc.example.com",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  }),
}));

vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567" }),
}));

vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({ currencyId: "XLM", rate: null }),
}));

vi.mock("../../lib/timeoutRefund", () => ({
  LEDGER_CLOSE_SECONDS: 5,
  computeTimeoutRefundState: (
    currentLedger: number,
    timeoutLedger: number,
    refundAmountStroops: string
  ) => ({
    canRefund: true,
    currentLedger,
    timeoutLedger,
    refundAmountStroops,
    remainingLedgers: 0,
  }),
  fetchCurrentLedger: vi.fn().mockResolvedValue(100),
  formatLedgerCountdown: () => "ready",
  invokeEscrowRefund: invokeEscrowRefundMock,
  signWithFreighter: vi.fn(),
}));

function renderButton() {
  return render(
    <TimeoutRefundButton
      contractId="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      timeoutLedger={100}
      refundAmountStroops="10000000"
      initialLedger={100}
    />
  );
}

describe("TimeoutRefundButton wallet rejection handling (#743)", () => {
  beforeEach(() => {
    invokeEscrowRefundMock.mockReset();
  });

  it("shows a neutral notice (not an error) when the user cancels in their wallet", async () => {
    const user = userEvent.setup();
    invokeEscrowRefundMock.mockRejectedValue(
      new Error("User declined to sign the transaction")
    );

    renderButton();
    await user.click(screen.getByRole("button", { name: /claim full refund/i }));

    expect(
      await screen.findByText(WALLET_CANCELLED_MESSAGE)
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still surfaces a real signing failure as an error", async () => {
    const user = userEvent.setup();
    invokeEscrowRefundMock.mockRejectedValue(
      new Error("The refund transaction failed on-chain.")
    );

    renderButton();
    await user.click(screen.getByRole("button", { name: /claim full refund/i }));

    expect(
      await screen.findByText("The refund transaction failed on-chain.")
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

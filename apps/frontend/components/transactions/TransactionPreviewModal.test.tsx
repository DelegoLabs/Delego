import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Account,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { NetworkProvider } from "../../hooks/useNetwork";
import { TransactionPreviewModal } from "./TransactionPreviewModal";

const SOURCE = Keypair.fromSecret(
  "SBUCRG645IHKH2FRIP6KL5U2IV643HK5LLF3Q7B3QWMFKXAT4REW76MX"
);
const RECIPIENT = "GBZH4MBWR3TBGRKE33DXVCMZKPCOLHYQOAFB2GNFY57ETYBTBQPLVLOD";
const ESCROW_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7));

function Providers({ children }: { children: React.ReactNode }) {
  return <NetworkProvider>{children}</NetworkProvider>;
}

function buildReleaseXdr(amount: bigint): string {
  const account = new Account(SOURCE.publicKey(), "1");
  const contract = new Contract(ESCROW_CONTRACT_ID);
  const op = contract.call(
    "release",
    new Address(RECIPIENT).toScVal(),
    nativeToScVal(amount, { type: "i128" })
  );
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build()
    .toXDR();
}

describe("TransactionPreviewModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the decoded summary for a known operation", () => {
    render(
      <TransactionPreviewModal
        xdr={buildReleaseXdr(452000000n)}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: Providers }
    );

    expect(
      screen.getByText(/Release 45\.2 XLM from escrow to/)
    ).toBeInTheDocument();
  });

  it("calls onConfirm only when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <TransactionPreviewModal
        xdr={buildReleaseXdr(1n)}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
      { wrapper: Providers }
    );

    await user.click(screen.getByRole("button", { name: /confirm & sign/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel and never onConfirm when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <TransactionPreviewModal
        xdr={buildReleaseXdr(1n)}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
      { wrapper: Providers }
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onCancel when the overlay is clicked, never onConfirm", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <TransactionPreviewModal
        xdr={buildReleaseXdr(1n)}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
      { wrapper: Providers }
    );

    const overlay = container.querySelector(".approval-drawer-overlay");
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows an honest error and disables confirm when the XDR is malformed", () => {
    render(
      <TransactionPreviewModal
        xdr="not-valid-xdr"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
      { wrapper: Providers }
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirm & sign/i })
    ).toBeDisabled();
  });

  it("shows the unrecognized-operation fallback for an unmapped contract method", () => {
    const account = new Account(SOURCE.publicKey(), "1");
    const contract = new Contract(ESCROW_CONTRACT_ID);
    const xdr = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call("some_future_method", nativeToScVal(1n, { type: "i128" }))
      )
      .setTimeout(30)
      .build()
      .toXDR();

    render(
      <TransactionPreviewModal
        xdr={xdr}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
      {
        wrapper: Providers,
      }
    );

    expect(screen.getByText("Unrecognized operation")).toBeInTheDocument();
  });

  it("disables both buttons while confirming", () => {
    render(
      <TransactionPreviewModal
        xdr={buildReleaseXdr(1n)}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        confirming
      />,
      { wrapper: Providers }
    );

    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /confirm & sign/i })
    ).toBeDisabled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
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
import { server } from "../../mocks/server";
import { CONGESTED_NETWORK_FEE_STATS } from "../../mocks/handlers/fees";
import { TransactionPreviewModal } from "./TransactionPreviewModal";

const SOURCE = Keypair.fromPublicKey(
  "GDW2SJPNBGAKQ2KGNVOLONQ53QRNGI3UKHVULXMUAC7UH6V7ZWLXAGVF"
);
const RECIPIENT = "GBZH4MBWR3TBGRKE33DXVCMZKPCOLHYQOAFB2GNFY57ETYBTBQPLVLOD";
const ESCROW_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7));
const TESTNET_FEE_STATS_URL = "https://horizon-testnet.stellar.org/fee_stats";

/** A congested network: fees far above the default 100,000-stroop limit. */
function useCongestedNetwork() {
  server.use(
    http.get(TESTNET_FEE_STATS_URL, () =>
      HttpResponse.json(CONGESTED_NETWORK_FEE_STATS)
    )
  );
}

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

  it("warns before signing when the network fee is above the user's limit", async () => {
    useCongestedNetwork();
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

    const warning = await screen.findByRole("dialog", {
      name: /network fees are surging/i,
    });
    expect(warning).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("signs the transaction once the user approves the surge fee", async () => {
    useCongestedNetwork();
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
    await screen.findByRole("dialog", { name: /network fees are surging/i });
    await user.click(screen.getByRole("button", { name: /approve surge fee/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it("postpones the transaction without signing when the user declines", async () => {
    useCongestedNetwork();
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

    await user.click(screen.getByRole("button", { name: /confirm & sign/i }));
    await screen.findByRole("dialog", { name: /network fees are surging/i });
    await user.click(screen.getByRole("button", { name: /postpone/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: /network fees are surging/i })
    ).not.toBeInTheDocument();
  });

  it("does not warn while the network fee stays under the user's limit", async () => {
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

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole("dialog", { name: /network fees are surging/i })
    ).not.toBeInTheDocument();
  });
});

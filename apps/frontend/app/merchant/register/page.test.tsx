import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MerchantRegisterPage from "./page";

const mockUseWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => mockUseWallet() }));

const mockUseNetwork = vi.fn();
vi.mock("../../../hooks/useNetwork", () => ({ useNetwork: () => mockUseNetwork() }));

vi.mock("../../../lib/proofAttachments", () => ({
  resolveProofHashExplorerUrl: () => "https://explorer.test/tx/abc",
  truncateHash: (h: string) => h.slice(0, 8),
}));

vi.mock("../../../components/wallet/CopyButton", () => ({
  CopyButton: () => null,
}));

// Avoid pulling in @delegolabs/ui's full barrel (index.ts), which re-exports
// InteractiveTrackingTimeline — a pre-existing, unrelated file on `main` that
// imports "swr" without declaring it as a dependency. Mocking just the one
// export this page actually uses keeps the test isolated from that bug.
vi.mock("@delegolabs/ui", () => ({
  Stepper: ({
    steps,
    currentIndex,
  }: {
    steps: { id: string; label: string }[];
    currentIndex: number;
  }) => (
    <nav aria-label="Onboarding steps">
      {steps.map((s, i) => (
        <span key={s.id} aria-current={i === currentIndex ? "step" : undefined}>
          {s.label}
        </span>
      ))}
    </nav>
  ),
}));

const mockValidateStorePayoutAddress = vi.fn();
const mockRegisterMerchant = vi.fn();
const mockImportMerchantCatalog = vi.fn();
vi.mock("../../../lib/merchantRegistration", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/merchantRegistration")>(
    "../../../lib/merchantRegistration"
  );
  return {
    ...actual,
    validateStorePayoutAddress: (...args: unknown[]) => mockValidateStorePayoutAddress(...args),
    registerMerchant: (...args: unknown[]) => mockRegisterMerchant(...args),
    importMerchantCatalog: (...args: unknown[]) => mockImportMerchantCatalog(...args),
  };
});

const VALID_ADDRESS = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";

function fillStoreInfo() {
  fireEvent.change(screen.getByLabelText("Store name"), { target: { value: "Acme Mugs" } });
  fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: "a@example.com" } });
  fireEvent.change(screen.getByLabelText("Stellar payout address"), { target: { value: VALID_ADDRESS } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "We sell mugs." } });
}

describe("MerchantRegisterPage catalog import step (#791)", () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ address: null, isConnected: false, connect: vi.fn() });
    mockUseNetwork.mockReturnValue({
      network: { id: "testnet", label: "Testnet", networkPassphrase: "Test", sorobanRpcUrl: "https://rpc.test" },
    });
    mockValidateStorePayoutAddress.mockReset();
    mockRegisterMerchant.mockReset();
    mockImportMerchantCatalog.mockReset();
  });

  it("advances to the catalog step only after the payout address passes network validation", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({ valid: true });
    render(<MerchantRegisterPage />);

    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mockValidateStorePayoutAddress).toHaveBeenCalledWith(
        VALID_ADDRESS,
        expect.objectContaining({ id: "testnet" })
      );
    });
    expect(await screen.findByText(/Optionally import your product catalog/)).toBeInTheDocument();
  });

  it("shows the network error and does not advance when the address isn't funded", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({
      valid: false,
      error: "This address isn't funded on Testnet yet. Fund the account, then try again.",
    });
    render(<MerchantRegisterPage />);

    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/isn't funded on Testnet/)).toBeInTheDocument();
    expect(screen.queryByText(/Optionally import your product catalog/)).not.toBeInTheDocument();
  });

  it("parses a valid CSV and shows the ready-to-import count", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({ valid: true });
    render(<MerchantRegisterPage />);
    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Optionally import your product catalog/);

    const csvContent =
      "sku,title,priceStroops,assetCode,stockQuantity,category\nSKU-1,Mug,1500000,USDC,10,Kitchen";
    const file = new File([csvContent], "catalog.csv", { type: "text/csv" });
    const input = screen.getByLabelText("Catalog CSV file");
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/1 product ready to import/)).toBeInTheDocument();
  });

  it("shows per-row errors for a partially invalid CSV without blocking valid rows", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({ valid: true });
    render(<MerchantRegisterPage />);
    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Optionally import your product catalog/);

    const csvContent = [
      "sku,title,priceStroops,assetCode,stockQuantity,category",
      "SKU-1,Mug,1500000,USDC,10,Kitchen",
      ",Bad Row,1500000,USDC,10,",
    ].join("\n");
    const file = new File([csvContent], "catalog.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Catalog CSV file"), { target: { files: [file] } });

    expect(await screen.findByText(/1 product ready to import/)).toBeInTheDocument();
    expect(await screen.findByText(/1 row skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Row 3: sku is required\./)).toBeInTheDocument();
  });

  it("Skip for now proceeds without a catalog", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({ valid: true });
    render(<MerchantRegisterPage />);
    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Optionally import your product catalog/);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(await screen.findByText(/Connect your wallet to continue\./)).toBeInTheDocument();
  });

  it("imports the parsed catalog after successful registration", async () => {
    mockValidateStorePayoutAddress.mockResolvedValue({ valid: true });
    mockUseWallet.mockReturnValue({ address: VALID_ADDRESS, isConnected: true, connect: vi.fn() });
    mockRegisterMerchant.mockResolvedValue({ transactionHash: "abcd1234efgh5678" });
    mockImportMerchantCatalog.mockResolvedValue({ imported: 1 });

    vi.doMock("@stellar/freighter-api", () => ({
      signMessage: vi.fn().mockResolvedValue({ signerAddress: VALID_ADDRESS, signedMessage: "sig" }),
    }));

    render(<MerchantRegisterPage />);
    fillStoreInfo();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Optionally import your product catalog/);

    const csvContent =
      "sku,title,priceStroops,assetCode,stockQuantity,category\nSKU-1,Mug,1500000,USDC,10,Kitchen";
    const file = new File([csvContent], "catalog.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Catalog CSV file"), { target: { files: [file] } });
    await screen.findByText(/1 product ready to import/);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByText("Sign to verify");
    fireEvent.click(screen.getByRole("button", { name: "Sign to verify" }));

    await screen.findByText(/Register on-chain/);
    fireEvent.click(screen.getByRole("button", { name: "Register on-chain" }));

    await waitFor(() => {
      expect(mockImportMerchantCatalog).toHaveBeenCalledWith([
        expect.objectContaining({ sku: "SKU-1", title: "Mug" }),
      ]);
    });
    expect(await screen.findByText(/Imported 1 product to your catalog\./)).toBeInTheDocument();
  });
});

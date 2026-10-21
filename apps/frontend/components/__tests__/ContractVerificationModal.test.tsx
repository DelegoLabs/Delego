import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContractVerificationModal } from "../ContractVerificationModal";
import { ContractVerificationButton } from "../ContractVerificationButton";
import type { ContractVerificationDetails } from "../../lib/contractVerification";
import { copySensitive } from "../../lib/clipboard";

vi.mock("../../lib/clipboard", () => ({
  copySensitive: vi.fn().mockResolvedValue(undefined),
}));

const ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const HASH = "0f".repeat(32);
const COMMIT = "4f1c9b2d7e8a6c5b3a2f1e0d9c8b7a6f5e4d3c2b";

const VERIFIED: ContractVerificationDetails = {
  contractAddress: ADDRESS,
  wasmHash: HASH,
  gitCommitHash: COMMIT,
  sorobanSdkVersion: "22.0.0",
  isSourceVerified: true,
  buildMeta: { rsver: "1.81.0", rssdkver: "22.0.0#8c3f1a", source_repo: "github:DelegoLabs/Delego-contracts" },
  rustcVersion: "1.81.0",
  release: {
    wasmHash: HASH,
    contract: "delego-escrow",
    releaseTag: "v1.4.0",
    gitCommitHash: COMMIT,
    sorobanSdkVersion: "22.0.0",
    buildProofUrl: "https://github.com/DelegoLabs/Delego-contracts/actions/runs/42",
  },
  releaseUrl: "https://github.com/DelegoLabs/Delego-contracts/releases/tag/v1.4.0",
  commitUrl: `https://github.com/DelegoLabs/Delego-contracts/commit/${COMMIT}`,
  buildProofUrl: "https://github.com/DelegoLabs/Delego-contracts/actions/runs/42",
};

const UNVERIFIED: ContractVerificationDetails = {
  ...VERIFIED,
  isSourceVerified: false,
  gitCommitHash: "",
  release: null,
  releaseUrl: null,
  commitUrl: null,
  buildProofUrl: null,
};

function renderModal(verify: ReturnType<typeof vi.fn>) {
  render(
    <ContractVerificationModal
      open
      contractAddress={ADDRESS}
      contractLabel="Escrow"
      networkId="testnet"
      onClose={vi.fn()}
      verify={verify}
    />
  );
}

describe("ContractVerificationModal", () => {
  it("queries the active network's Soroban RPC and renders verified metadata", async () => {
    const verify = vi.fn().mockResolvedValue(VERIFIED);
    renderModal(verify);

    expect(screen.getByRole("status")).toHaveTextContent(/Soroban RPC/);
    expect(await screen.findByText("Source verified")).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith("https://soroban-testnet.stellar.org", ADDRESS);

    expect(screen.getByTestId("wasm-hash")).toHaveTextContent("0f0f0f0f…0f0f0f0f");
    expect(screen.getByTestId("wasm-hash")).toHaveAttribute("title", HASH);
    expect(screen.getByText("22.0.0")).toBeInTheDocument();
    expect(screen.getAllByText("1.81.0").length).toBeGreaterThan(0);
    expect(screen.getByText("github:DelegoLabs/Delego-contracts")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /GitHub release v1.4.0/ })).toHaveAttribute(
      "href",
      VERIFIED.releaseUrl
    );
    expect(screen.getByRole("link", { name: /Build reproducibility proof/ })).toHaveAttribute(
      "href",
      VERIFIED.buildProofUrl
    );
    expect(screen.getByRole("link", { name: COMMIT.slice(0, 12) })).toHaveAttribute(
      "href",
      VERIFIED.commitUrl
    );
    expect(screen.getByRole("link", { name: /Stellar Expert/ })).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/contract/${ADDRESS}`
    );
  });

  it("copies the full WASM hash in one click", async () => {
    renderModal(vi.fn().mockResolvedValue(VERIFIED));
    fireEvent.click(await screen.findByRole("button", { name: "Copy WASM hash" }));
    await waitFor(() => expect(copySensitive).toHaveBeenCalledWith(HASH));
  });

  it("warns when the hash matches no published release", async () => {
    renderModal(vi.fn().mockResolvedValue(UNVERIFIED));
    expect(await screen.findByText("Unverified")).toBeInTheDocument();
    expect(screen.getByTestId("verification-status")).toHaveAttribute("data-verified", "false");
    expect(screen.queryByRole("link", { name: /GitHub release/ })).toBeNull();
    expect(screen.getByText("Not embedded")).toBeInTheDocument();
  });

  it("shows RPC errors and retries", async () => {
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("Contract instance not found on this network."))
      .mockResolvedValueOnce(VERIFIED);
    renderModal(verify);
    expect(await screen.findByRole("alert")).toHaveTextContent(/instance not found/);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Source verified")).toBeInTheDocument();
    expect(verify).toHaveBeenCalledTimes(2);
  });
});

describe("ContractVerificationButton", () => {
  it("opens the explorer modal for its contract", async () => {
    const verify = vi.fn().mockResolvedValue(VERIFIED);
    render(
      <ContractVerificationButton
        contractAddress={ADDRESS}
        contractLabel="Escrow"
        networkId="mainnet"
        verify={verify}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify Escrow contract bytecode" }));
    expect(screen.getByRole("dialog", { name: /Escrow contract bytecode/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith("https://mainnet.sorobanrpc.com", ADDRESS)
    );
  });
});

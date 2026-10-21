import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryEvidenceUploader } from "./DeliveryEvidenceUploader";

const confirmMock = vi.fn(async (_arg?: unknown) => ({ txHash: "tx-1" }));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: () => ({
    networkId: "testnet",
    network: {
      sorobanRpcUrl: "https://soroban.test",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  }),
}));

vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" }),
}));

vi.mock("../../lib/contracts", () => ({
  getConfiguredContracts: () => [
    { name: "escrow", address: "CABC", addressValid: true, label: "Escrow" },
  ],
}));

vi.mock("../../lib/sorobanInvoke", () => ({
  signWithFreighter: vi.fn(async (xdr: string) => xdr),
}));

vi.mock("../../lib/deliveryEvidence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/deliveryEvidence")>(
    "../../lib/deliveryEvidence"
  );
  return {
    ...actual,
    confirmDeliveryWithEvidence: (arg: unknown) => confirmMock(arg),
  };
});

describe("DeliveryEvidenceUploader (#910)", () => {
  beforeEach(() => {
    confirmMock.mockClear();
  });

  it("shows a verified hash badge and sends that hash with the contract call", async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    render(
      <DeliveryEvidenceUploader orderId="order-9" open onClose={vi.fn()} onConfirmed={onConfirmed} />
    );

    const file = new File([new Uint8Array([9, 8, 7])], "pod.png", { type: "image/png" });
    await user.upload(screen.getByTestId("delivery-evidence-input"), file);

    const badge = await screen.findByTestId("delivery-evidence-hash-badge");
    expect(badge).toHaveTextContent(/SHA-256 verified/);
    const hash = badge.textContent?.split("·")[1]?.trim();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByTestId("delivery-evidence-progress")).toHaveAttribute("value", "100");

    await user.click(screen.getByTestId("delivery-evidence-submit"));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-9", sha256Hash: hash, contractId: "CABC" })
    );
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-9", sha256Hash: hash, fileName: "pod.png" }),
      "tx-1"
    );
  });

  it("rejects a file that is not a PDF, PNG, or JPEG", async () => {
    render(<DeliveryEvidenceUploader orderId="order-9" open onClose={vi.fn()} />);
    const file = new File(["gif"], "anim.gif", { type: "image/gif" });
    fireEvent.change(screen.getByTestId("delivery-evidence-input"), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/PDF, PNG, or JPEG/);
    expect(screen.queryByTestId("delivery-evidence-hash-badge")).not.toBeInTheDocument();
  });
});

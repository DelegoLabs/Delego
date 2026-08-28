import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletPickerModal } from "../components/wallet/WalletPickerModal";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: () => Promise.resolve({ isConnected: true }),
}));

vi.mock("@lobstrco/signer-extension-api", () => ({
  isConnected: () => Promise.resolve(false),
}));

const twoAdapters = [
  {
    id: "freighter",
    name: "Freighter",
    installUrl: "https://www.freighter.app/",
    detected: true,
  },
  {
    id: "lobstr",
    name: "LOBSTR",
    installUrl: "https://lobstr.co/signer-extension/",
    detected: false,
  },
];

describe("WalletPickerModal", () => {
  it("renders nothing while closed", () => {
    render(
      <WalletPickerModal
        isOpen={false}
        onClose={() => {}}
        onSelect={() => {}}
        adapters={twoAdapters}
      />
    );

    expect(screen.queryByTestId("wallet-picker-modal")).toBeNull();
  });

  it("offers Connect for detected wallets and an install link otherwise", () => {
    render(
      <WalletPickerModal
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
        adapters={twoAdapters}
      />
    );

    const freighterRow = screen.getByTestId("wallet-option-freighter");
    expect(freighterRow.textContent).toContain("Freighter");
    expect(
      screen.getByRole("button", { name: "Connect" })
    ).toBeInTheDocument();

    const lobstrRow = screen.getByTestId("wallet-option-lobstr");
    expect(lobstrRow.textContent).toContain("Not installed");
    const installLink = screen.getByRole("link", { name: /get lobstr/i });
    expect(installLink).toHaveAttribute(
      "href",
      "https://lobstr.co/signer-extension/"
    );
  });

  it("reports the chosen adapter id", () => {
    const onSelect = vi.fn();
    render(
      <WalletPickerModal
        isOpen
        onClose={() => {}}
        onSelect={onSelect}
        adapters={twoAdapters}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(onSelect).toHaveBeenCalledWith("freighter");
  });

  it("closes from the backdrop and the Close action", () => {
    const onClose = vi.fn();
    render(
      <WalletPickerModal
        isOpen
        onClose={onClose}
        onSelect={() => {}}
        adapters={twoAdapters}
      />
    );

    fireEvent.click(screen.getByTestId("wallet-picker-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("detects registered wallets when no override is provided", async () => {
    render(
      <WalletPickerModal isOpen onClose={() => {}} onSelect={() => {}} />
    );

    expect(
      await screen.findByRole("button", { name: "Connect" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /get lobstr/i })
    ).toBeInTheDocument();
  });
});

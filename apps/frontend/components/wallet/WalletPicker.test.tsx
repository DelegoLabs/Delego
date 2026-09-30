import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletPicker, WalletPickerModal } from "./WalletPicker";
import type { WalletOption } from "../../hooks/useWalletAdapters";

const { mockUseWalletAdapters } = vi.hoisted(() => ({
  mockUseWalletAdapters: vi.fn(),
}));

vi.mock("../../hooks/useWalletAdapters", () => ({
  useWalletAdapters: mockUseWalletAdapters,
}));

const INSTALLED: WalletOption = {
  id: "freighter",
  name: "Freighter",
  installUrl: "https://www.freighter.app/",
  installed: true,
};

const MISSING: WalletOption = {
  id: "lobstr",
  name: "LOBSTR",
  installUrl: "https://lobstr.co/signer-extension",
  installed: false,
};

const CHECKING: WalletOption = {
  ...MISSING,
  installed: null,
};

function givenWallets(wallets: WalletOption[], checking = false) {
  mockUseWalletAdapters.mockReturnValue({ wallets, checking });
}

describe("WalletPicker", () => {
  beforeEach(() => {
    mockUseWalletAdapters.mockReset();
  });

  it("offers to connect installed wallets and links to install the rest", () => {
    givenWallets([INSTALLED, MISSING]);

    render(<WalletPicker onConnect={vi.fn()} />);

    const connect = screen.getByRole("button", {
      name: "Connect with Freighter",
    });
    expect(connect).toBeEnabled();

    const install = screen.getByRole("link", { name: "Install LOBSTR" });
    expect(install).toHaveAttribute("href", MISSING.installUrl);
    expect(install).toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("button", { name: "Connect with LOBSTR" })
    ).toBeNull();
  });

  it("passes the chosen wallet id back to its owner", () => {
    givenWallets([INSTALLED, MISSING]);
    const onConnect = vi.fn();

    render(<WalletPicker onConnect={onConnect} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Connect with Freighter" })
    );

    expect(onConnect).toHaveBeenCalledWith("freighter");
  });

  it("shows detection in progress while adapters are still probing", () => {
    givenWallets([CHECKING], true);

    render(<WalletPicker onConnect={vi.fn()} />);

    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect with LOBSTR" })
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Install LOBSTR" })
    ).toBeNull();
  });

  it("marks the wallet being connected and blocks further clicks", () => {
    givenWallets([INSTALLED]);

    render(<WalletPicker onConnect={vi.fn()} connecting selectedId="freighter" />);

    const connect = screen.getByRole("button", { name: "Connecting…" });
    expect(connect).toBeDisabled();
  });

  it("labels the wallet this owner is already connected with", () => {
    givenWallets([INSTALLED]);

    render(<WalletPicker onConnect={vi.fn()} connectedId="freighter" />);

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect with Freighter" })
    ).toBeNull();
  });

  it("surfaces a connection error under the list", () => {
    givenWallets([INSTALLED]);

    render(<WalletPicker onConnect={vi.fn()} error="Wallet access was denied" />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Wallet access was denied"
    );
  });
});

describe("WalletPickerModal", () => {
  beforeEach(() => {
    mockUseWalletAdapters.mockReset();
  });

  it("renders nothing while closed", () => {
    givenWallets([INSTALLED]);

    render(
      <WalletPickerModal isOpen={false} onClose={vi.fn()} onConnect={vi.fn()} />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a labelled dialog describing the choice", () => {
    givenWallets([INSTALLED, MISSING]);

    render(
      <WalletPickerModal isOpen onClose={vi.fn()} onConnect={vi.fn()} />
    );

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Choose a wallet");
    expect(
      screen.getByText(/remembered for this browser/)
    ).toBeInTheDocument();
  });

  it("closes from the cancel action and from Escape", () => {
    givenWallets([INSTALLED]);
    const onClose = vi.fn();

    const { rerender } = render(
      <WalletPickerModal isOpen onClose={onClose} onConnect={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <WalletPickerModal isOpen={false} onClose={onClose} onConnect={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes once the owner reports a successful connection", () => {
    givenWallets([INSTALLED]);
    const onClose = vi.fn();
    const onConnect = vi.fn(() => {
      onClose();
      return Promise.resolve();
    });

    render(<WalletPickerModal isOpen onClose={onClose} onConnect={onConnect} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Connect with Freighter" })
    );

    expect(onConnect).toHaveBeenCalledWith("freighter");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

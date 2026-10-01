import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WalletSelectorModal } from "./WalletSelectorModal";
import type { WalletOption } from "../../lib/wallets";

const OPTIONS: WalletOption[] = [
  { id: "freighter", name: "Freighter", iconUrl: "", isInstalled: true, connect: async () => "GABC" },
  { id: "albedo", name: "Albedo", iconUrl: "", isInstalled: false, connect: async () => "GABC" },
  { id: "lobstr", name: "LOBSTR", iconUrl: "", isInstalled: false, connect: async () => "GABC" },
];

function renderOpen(overrides: Partial<Parameters<typeof WalletSelectorModal>[0]> = {}) {
  return render(
    <WalletSelectorModal
      open
      options={OPTIONS}
      activeId="freighter"
      pendingId={null}
      onSelect={() => {}}
      onConnect={() => {}}
      onClose={() => {}}
      {...overrides}
    />
  );
}

describe("WalletSelectorModal (#774)", () => {
  it("renders nothing when closed", () => {
    render(
      <WalletSelectorModal
        open={false}
        options={OPTIONS}
        activeId="freighter"
        pendingId={null}
        onSelect={() => {}}
        onConnect={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists every wallet with its connection status", () => {
    renderOpen();
    expect(screen.getByRole("dialog", { name: "Select a wallet" })).toBeInTheDocument();
    expect(screen.getByText("Freighter")).toBeInTheDocument();
    expect(screen.getByText("Albedo")).toBeInTheDocument();
    expect(screen.getByText("LOBSTR")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getAllByText("available").length).toBeGreaterThanOrEqual(2);
  });

  it("reports Select and Connect per wallet", () => {
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    renderOpen({ onSelect, onConnect });
    fireEvent.click(screen.getByRole("button", { name: "Select Albedo" }));
    expect(onSelect).toHaveBeenCalledWith("albedo");
    fireEvent.click(screen.getByRole("button", { name: "Connect with Albedo" }));
    expect(onConnect).toHaveBeenCalledWith("albedo");
  });

  it("shows a pending state while a wallet connects", () => {
    renderOpen({ pendingId: "lobstr" });
    expect(screen.getByRole("button", { name: "Connect with LOBSTR" })).toBeDisabled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderOpen({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

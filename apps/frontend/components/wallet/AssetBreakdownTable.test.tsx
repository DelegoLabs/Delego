import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetBreakdownTable } from "./AssetBreakdownTable";
import type { HorizonBalance } from "../../hooks/useBalanceHistory";

vi.mock("../../hooks/useTomlCache", () => ({
  useTomlCache: () => ({
    getIssuerDomain: (issuer: string) =>
      issuer === "GUSDC" ? "centre.io" : "zzz.example",
    loading: false,
  }),
}));

const balances: HorizonBalance[] = [
  {
    asset_type: "credit_alphanum4",
    asset_code: "USDC",
    asset_issuer: "GUSDC",
    balance: "42.5",
  },
  { asset_type: "native", balance: "10" },
  {
    asset_type: "credit_alphanum4",
    asset_code: "EURC",
    asset_issuer: "GEURC",
    balance: "250",
  },
];

function renderTable(items: HorizonBalance[] = balances) {
  return render(
    <AssetBreakdownTable
      balances={items}
      horizonUrl="https://horizon-testnet.stellar.org"
      isLiveNetwork={false}
    />
  );
}

/** Asset codes in current row order. */
function assetCodes(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelector(".asset-code-badge")?.textContent ?? "");
}

function columnHeader(name: RegExp) {
  return screen.getByRole("columnheader", { name });
}

describe("AssetBreakdownTable sorting", () => {
  it("sorts by asset code ascending by default and exposes aria-sort", () => {
    renderTable();

    expect(assetCodes()).toEqual(["EURC", "USDC", "XLM"]);
    expect(columnHeader(/^asset$/i)).toHaveAttribute("aria-sort", "ascending");
    expect(columnHeader(/^balance$/i)).toHaveAttribute("aria-sort", "none");
    expect(columnHeader(/^issuer domain$/i)).toHaveAttribute(
      "aria-sort",
      "none"
    );
  });

  it("sorts balances numerically and toggles direction on repeat clicks", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /^balance$/i }));

    expect(assetCodes()).toEqual(["XLM", "USDC", "EURC"]);
    expect(columnHeader(/^balance$/i)).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
    expect(columnHeader(/^asset$/i)).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: /^balance$/i }));

    expect(assetCodes()).toEqual(["EURC", "USDC", "XLM"]);
    expect(columnHeader(/^balance$/i)).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });

  it("sorts by issuer domain and resets to ascending for a new column", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: /^issuer domain$/i }));

    expect(assetCodes()).toEqual(["USDC", "XLM", "EURC"]);
    expect(columnHeader(/^issuer domain$/i)).toHaveAttribute(
      "aria-sort",
      "ascending"
    );

    await user.click(screen.getByRole("button", { name: /^asset$/i }));

    expect(assetCodes()).toEqual(["EURC", "USDC", "XLM"]);
    expect(columnHeader(/^asset$/i)).toHaveAttribute("aria-sort", "ascending");
  });

  it("supports keyboard activation with Enter and Space", async () => {
    const user = userEvent.setup();
    renderTable();

    const balanceButton = screen.getByRole("button", { name: /^balance$/i });
    balanceButton.focus();
    expect(balanceButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(columnHeader(/^balance$/i)).toHaveAttribute(
      "aria-sort",
      "ascending"
    );

    await user.keyboard(" ");
    expect(columnHeader(/^balance$/i)).toHaveAttribute(
      "aria-sort",
      "descending"
    );
  });

  it("keeps equal values in their original order", async () => {
    const user = userEvent.setup();
    renderTable([
      {
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GUSDC",
        balance: "10",
      },
      {
        asset_type: "credit_alphanum4",
        asset_code: "EURC",
        asset_issuer: "GEURC",
        balance: "10",
      },
    ]);

    await user.click(screen.getByRole("button", { name: /^balance$/i }));

    expect(assetCodes()).toEqual(["USDC", "EURC"]);
  });

  it("renders nothing when there are no balances", () => {
    const { container } = renderTable([]);

    expect(container).toBeEmptyDOMElement();
  });
});

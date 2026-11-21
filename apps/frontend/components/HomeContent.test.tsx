import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en.json";
import deMessages from "../messages/de.json";

const revokeDelegation = vi.fn(async () => {});
const delegationsState = {
  delegations: [] as Array<{
    id: string;
    agentId: string;
    status: string;
    policy: { expiresAt: string };
  }>,
};

vi.mock("../hooks/useDelegations", () => ({
  useDelegations: () => ({
    delegations: delegationsState.delegations,
    revokeDelegation,
    loading: false,
    stale: false,
    cachedAt: null,
    ttlMs: 0,
  }),
}));
vi.mock("../hooks/useOrders", () => ({
  useOrders: () => ({
    orders: [],
    loading: false,
    stale: false,
    cachedAt: null,
    ttlMs: 0,
  }),
}));
// Leaf widgets with their own data/wallet dependencies are out of scope here.
vi.mock("./delegations/public", () => ({ ExpiryCountdown: () => null }));
vi.mock("./wallet/public", () => ({ WalletConnectButton: () => null }));
vi.mock("./offline/StaleBadge", () => ({ StaleBadge: () => null }));

import { HomeContent } from "./HomeContent";

function renderHome(locale: "en" | "de") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? enMessages : deMessages}
    >
      <HomeContent />
    </NextIntlClientProvider>
  );
}

const activeDelegation = (id: string) => ({
  id,
  agentId: `agent-${id}`,
  status: "active",
  policy: { expiresAt: "2030-01-01T00:00:00Z" },
});

describe("HomeContent", () => {
  beforeEach(() => {
    delegationsState.delegations = [];
    revokeDelegation.mockClear();
  });

  it("renders card titles and empty states from the en catalog", () => {
    renderHome("en");

    expect(
      screen.getByRole("heading", { level: 2, name: "Delegations" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Orders" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Wallet" })
    ).toBeInTheDocument();
    expect(screen.getByText("No delegations yet.")).toBeInTheDocument();
    expect(screen.getByText("No orders yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke all delegations" })
    ).toBeDisabled();
  });

  it("renders translated card titles and empty states in German", () => {
    renderHome("de");

    expect(
      screen.getByRole("heading", { level: 2, name: "Delegationen" })
    ).toBeInTheDocument();
    expect(screen.getByText("Noch keine Delegationen.")).toBeInTheDocument();
    expect(screen.getByText("Noch keine Bestellungen.")).toBeInTheDocument();
  });

  it("localizes the kill-switch modal and still requires REVOKE", async () => {
    delegationsState.delegations = [
      activeDelegation("1"),
      activeDelegation("2"),
    ];
    const user = userEvent.setup();
    renderHome("en");

    await user.click(
      screen.getByRole("button", { name: "Revoke all delegations" })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "This will immediately revoke all 2 active AI agent spending permissions on-chain."
    );
    expect(dialog).toHaveTextContent("Type REVOKE to confirm");

    const confirm = screen.getByRole("button", { name: "Revoke all" });
    const input = screen.getByLabelText(/Type REVOKE to confirm/);
    await user.type(input, "revoke");
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, "REVOKE");
    await user.click(confirm);

    expect(revokeDelegation).toHaveBeenCalledTimes(2);
  });

  it("pluralizes the kill-switch description for a single delegation", async () => {
    delegationsState.delegations = [activeDelegation("1")];
    const user = userEvent.setup();
    renderHome("en");

    await user.click(
      screen.getByRole("button", { name: "Revoke all delegations" })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "revoke all 1 active AI agent spending permission on-chain."
    );
  });

  it("keeps the REVOKE token untranslated in the German modal", async () => {
    delegationsState.delegations = [activeDelegation("1")];
    const user = userEvent.setup();
    renderHome("de");

    await user.click(
      screen.getByRole("button", { name: "Alle Delegationen widerrufen" })
    );

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Gib zur Bestätigung REVOKE ein"
    );
    expect(
      screen.getByRole("button", { name: "Abbrechen" })
    ).toBeInTheDocument();
  });
});

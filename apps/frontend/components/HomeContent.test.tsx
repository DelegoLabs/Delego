// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { HomeContent } from "./HomeContent";
import enMessages from "../messages/en.json";
import { useDelegations } from "../hooks/useDelegations";
import { useOrders } from "../hooks/useOrders";

vi.mock("../hooks/useDelegations", () => ({ useDelegations: vi.fn() }));
vi.mock("../hooks/useOrders", () => ({ useOrders: vi.fn() }));
vi.mock("../hooks/useSubscriptions", () => ({
  useSubscriptions: () => ({
    subscriptions: [],
    loading: false,
    error: null,
    pendingIds: new Set(),
    refresh: async () => {},
    runAction: async () => true,
  }),
}));
vi.mock("./wallet/public", () => ({ WalletConnectButton: () => null }));
vi.mock("./offline/StaleBadge", () => ({ StaleBadge: () => null }));

function setup(onConfirmRevokeAll: () => Promise<void> = async () => {}) {
  vi.mocked(useDelegations).mockReturnValue({
    delegations: [
      {
        id: "delegation-1",
        userId: "user-1",
        agentId: "agent-1",
        status: "active",
        policy: {
          maxPerTransaction: "10",
          maxTotal: "100",
          allowedMerchants: [],
        },
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    loading: false,
    error: null,
    stale: false,
    cachedAt: null,
    ttlMs: 0,
    pendingIds: new Set(),
    pendingOfflineIds: new Set(),
    conflictMutations: [],
    refresh: async () => {},
    createDelegation: async () => null,
    updateDelegation: async () => null,
    revokeDelegation: vi.fn(async () => {
      await onConfirmRevokeAll();
      return true;
    }),
  });
  vi.mocked(useOrders).mockReturnValue({
    orders: [],
    loading: false,
    error: null,
    stale: false,
    cachedAt: null,
    ttlMs: 0,
    lastUpdated: null,
    pendingIds: new Set(),
    pendingOfflineIds: new Set(),
    conflictMutations: [],
    refresh: async () => {},
    approveOrder: async () => null,
    rejectOrder: async () => null,
  });

  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HomeContent />
    </NextIntlClientProvider>
  );
}

describe("HomeContent kill switch modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("focuses the confirmation input, traps Tab, and closes on Escape", async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole("button", {
      name: "Revoke all delegations",
    });
    await user.click(trigger);

    const input = screen.getByRole("textbox", {
      name: "Type REVOKE to confirm",
    });
    expect(input).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces revocation errors and stays open while revocation is pending", async () => {
    const user = userEvent.setup();
    let finishRevocation!: () => void;
    const revocation = new Promise<void>((resolve) => {
      finishRevocation = resolve;
    });
    setup(() => revocation);

    await user.click(
      screen.getByRole("button", { name: "Revoke all delegations" })
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "REVOKE");
    await user.click(screen.getByRole("button", { name: "Revoke all" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Revoking…" })).toBeDisabled();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    finishRevocation();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("associates revocation errors with the confirmation field", async () => {
    const user = userEvent.setup();
    setup(async () => {
      throw new Error("Unable to revoke");
    });

    await user.click(
      screen.getByRole("button", { name: "Revoke all delegations" })
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "REVOKE");
    await user.click(screen.getByRole("button", { name: "Revoke all" }));

    const alert = await screen.findByText("Unable to revoke");
    expect(alert).toHaveTextContent("Unable to revoke");
    expect(alert.closest("p")).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "kill-switch-error");
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("button", { name: "Revoke all" })).toBeDisabled();

    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the dialog and traps both Tab directions while revocation is pending", async () => {
    const user = userEvent.setup();
    let finishRevocation!: () => void;
    const revocation = new Promise<void>((resolve) => {
      finishRevocation = resolve;
    });
    const revoke = vi.fn(() => revocation);
    setup(revoke);

    const trigger = screen.getByRole("button", {
      name: "Revoke all delegations",
    });
    await user.click(trigger);
    const input = screen.getByRole("textbox");
    await user.type(input, "REVOKE");
    await user.click(screen.getByRole("button", { name: "Revoke all" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Revoking…" })).toBeDisabled();
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveFocus();
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
    await user.keyboard("{Escape}{Enter}");
    expect(dialog).toBeInTheDocument();
    expect(revoke).toHaveBeenCalledTimes(1);

    finishRevocation();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("refocuses the confirmation field after failure and allows Escape dismissal", async () => {
    const user = userEvent.setup();
    let failRevocation!: () => void;
    const revocation = new Promise<void>((_resolve, reject) => {
      failRevocation = () => reject(new Error("Unable to revoke"));
    });
    setup(() => revocation);

    const trigger = screen.getByRole("button", {
      name: "Revoke all delegations",
    });
    await user.click(trigger);
    const input = screen.getByRole("textbox");
    await user.type(input, "REVOKE");
    await user.click(screen.getByRole("button", { name: "Revoke all" }));

    failRevocation();
    const alert = await screen.findByText("Unable to revoke");
    expect(alert).toHaveTextContent("Unable to revoke");
    expect(alert.closest("p")).toHaveAttribute("role", "alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "kill-switch-error");
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Revoke all" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("includes the enabled confirmation button in both directions of the focus cycle", async () => {
    const user = userEvent.setup();
    const revoke = vi.fn(async () => {});
    setup(revoke);
    await user.click(
      screen.getByRole("button", { name: "Revoke all delegations" })
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "REVOKE");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Revoke all" });

    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(input).toHaveFocus();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("restores focus on Cancel and starts a fresh focus cycle when reopened", async () => {
    const user = userEvent.setup();
    setup();
    const trigger = screen.getByRole("button", {
      name: "Revoke all delegations",
    });
    await user.click(trigger);
    await user.type(screen.getByRole("textbox"), "REVOKE");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    const input = screen.getByRole("textbox");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

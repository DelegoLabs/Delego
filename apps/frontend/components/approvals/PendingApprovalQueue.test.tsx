import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PendingApprovalQueue, shortenAddress } from "./PendingApprovalQueue";
import type { PendingApprovalItem } from "../../lib/pendingApprovals";
import type { UseOsNotificationsResult } from "../../hooks/useOsNotifications";

vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({ currencyId: "XLM", rate: null }),
}));

const mockUseOsNotifications = vi.fn<() => UseOsNotificationsResult>();

vi.mock("../../hooks/useOsNotifications", () => ({
  useOsNotifications: () => mockUseOsNotifications(),
}));

function defaultOsNotifications(
  overrides: Partial<UseOsNotificationsResult> = {}
): UseOsNotificationsResult {
  return {
    supported: true,
    permission: "default",
    enabled: false,
    setEnabled: vi.fn(),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    notify: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

const NOW = new Date("2026-09-24T12:00:00Z");
const SIGNER = "GSIGNER00000000000000000000000001";
const REQUESTER = "GREQUESTER00000000000000000000001";

function item(overrides: Partial<PendingApprovalItem> = {}): PendingApprovalItem {
  return {
    orderId: "ord_1",
    requestedBy: REQUESTER,
    amountStroops: 5_000n * 10_000_000n,
    recipient: "GRECIPIENT0000000000000000000000001",
    expiresAt: new Date("2026-09-24T18:00:00Z"),
    ...overrides,
  };
}

function renderQueue(props: Partial<React.ComponentProps<typeof PendingApprovalQueue>> = {}) {
  return render(
    <PendingApprovalQueue
      items={[item()]}
      signerAddress={SIGNER}
      onSign={vi.fn()}
      now={NOW}
      {...props}
    />
  );
}

describe("shortenAddress", () => {
  it("leaves short addresses intact and truncates long ones", () => {
    expect(shortenAddress("GSHORT")).toBe("GSHORT");
    expect(shortenAddress(SIGNER)).toBe("GSIGN…0001");
  });
});

describe("PendingApprovalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOsNotifications.mockReturnValue(defaultOsNotifications());
  });

  it("lists each pending transaction with its amount, recipient and countdown", () => {
    renderQueue({
      items: [
        item(),
        item({ orderId: "ord_2", amountStroops: 12_500n * 10_000_000n }),
      ],
    });

    expect(screen.getByTestId("pending-approval-ord_1")).toHaveTextContent("ord_1");
    expect(screen.getByTestId("pending-approval-ord_1")).toHaveTextContent(
      "Expires in 6h"
    );
    expect(screen.getByTestId("pending-approval-ord_1")).toHaveTextContent(
      "GRECI…0001"
    );
    expect(screen.getByTestId("pending-approval-ord_2")).toHaveTextContent(
      "Expires in 6h"
    );
  });

  it("orders the queue most urgent first", () => {
    renderQueue({
      items: [
        item({ orderId: "later", expiresAt: new Date("2026-09-25T12:00:00Z") }),
        item({ orderId: "sooner", expiresAt: new Date("2026-09-24T13:00:00Z") }),
      ],
    });

    const rendered = screen
      .getAllByTestId(/^pending-approval-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(rendered).toEqual([
      "pending-approval-sooner",
      "pending-approval-later",
    ]);
  });

  it("signs in one click", async () => {
    const onSign = vi.fn().mockResolvedValue(undefined);
    renderQueue({ onSign });

    fireEvent.click(screen.getByRole("button", { name: "Approve & sign" }));

    await waitFor(() => expect(onSign).toHaveBeenCalledWith("ord_1"));
  });

  it("blocks and explains when no wallet is connected", () => {
    renderQueue({ signerAddress: null });

    expect(screen.getByRole("button", { name: "Approve & sign" })).toBeDisabled();
    expect(screen.getByText(/Connect your wallet to sign/)).toBeInTheDocument();
  });

  it("blocks the requester from countersigning their own request", () => {
    renderQueue({ signerAddress: REQUESTER });

    expect(screen.getByRole("button", { name: "Approve & sign" })).toBeDisabled();
    expect(screen.getByText(/You raised this request/)).toBeInTheDocument();
    // The row stays visible — a colleague still has to sign it.
    expect(screen.getByTestId("pending-approval-ord_1")).toBeInTheDocument();
  });

  it("blocks expired rows and shows them as expired", () => {
    renderQueue({ items: [item({ expiresAt: new Date("2026-09-24T11:00:00Z") })] });

    expect(screen.getByRole("button", { name: "Approve & sign" })).toBeDisabled();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/can no longer be signed/)).toBeInTheDocument();
  });

  it("flags an expiring row as urgent", () => {
    renderQueue({ items: [item({ expiresAt: new Date("2026-09-24T12:30:00Z") })] });

    expect(screen.getByTestId("pending-approval-ord_1").className).toContain(
      "pending-approvals-item-critical"
    );
  });

  it("disables the row while its signature is in flight", () => {
    renderQueue({ signingIds: new Set(["ord_1"]) });

    expect(screen.getByRole("button", { name: "Signing…" })).toBeDisabled();
  });

  it("surfaces a per-row error when signing throws", async () => {
    const onSign = vi.fn().mockRejectedValue(new Error("Signer is not authorized"));
    renderQueue({ onSign });

    fireEvent.click(screen.getByRole("button", { name: "Approve & sign" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Signer is not authorized"
    );
  });

  it("shows a friendly empty state and a skeleton while loading", () => {
    const { rerender } = renderQueue({ items: [] });
    expect(screen.getByTestId("pending-approvals-empty")).toBeInTheDocument();

    rerender(
      <PendingApprovalQueue
        items={[]}
        signerAddress={SIGNER}
        onSign={vi.fn()}
        now={NOW}
        loading
      />
    );
    expect(screen.getByTestId("pending-approvals-loading")).toBeInTheDocument();
  });

  it("reports a load failure with a retry affordance", () => {
    const onRetry = vi.fn();
    renderQueue({ items: [], error: "Network unreachable", onRetry });

    expect(screen.getByRole("alert")).toHaveTextContent("Network unreachable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("filters to urgent and expiring-soon approvals when the filter chip is active", () => {
    renderQueue({
      items: [
        item({ orderId: "expired_ord", expiresAt: new Date("2026-09-24T11:00:00Z") }),
        item({ orderId: "critical_ord", expiresAt: new Date("2026-09-24T12:30:00Z") }),
        item({ orderId: "warning_ord", expiresAt: new Date("2026-09-24T18:00:00Z") }),
        item({ orderId: "normal_ord", expiresAt: new Date("2026-09-27T12:00:00Z") }),
      ],
    });

    const chip = screen.getByTestId("pending-approvals-urgent-filter");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveTextContent("Urgent / Expiring soon");
    expect(chip).toHaveTextContent("2");

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");

    const rendered = screen
      .getAllByTestId(/^pending-approval-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(rendered).toEqual([
      "pending-approval-critical_ord",
      "pending-approval-warning_ord",
    ]);

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId(/^pending-approval-/)).toHaveLength(4);
  });

  it("shows a filtered empty state when no approvals are urgent and allows resetting", () => {
    renderQueue({
      items: [
        item({ orderId: "normal_ord", expiresAt: new Date("2026-09-27T12:00:00Z") }),
      ],
    });

    fireEvent.click(screen.getByTestId("pending-approvals-urgent-filter"));
    expect(screen.getByTestId("pending-approvals-urgent-empty")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByTestId("pending-approval-normal_ord")).toBeInTheDocument();
  });

  it("requests permission and enables OS notifications when toggled on from default", async () => {
    const setEnabled = vi.fn();
    const requestPermission = vi.fn().mockResolvedValue("granted");
    mockUseOsNotifications.mockReturnValue(
      defaultOsNotifications({
        permission: "default",
        enabled: false,
        setEnabled,
        requestPermission,
      })
    );

    renderQueue();
    const checkbox = screen.getByRole("checkbox", { name: /OS notifications/i });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(setEnabled).toHaveBeenCalledWith(true);
    });
  });

  it("toggles OS notifications off without requesting permission when already granted", () => {
    const setEnabled = vi.fn();
    const requestPermission = vi.fn();
    mockUseOsNotifications.mockReturnValue(
      defaultOsNotifications({
        permission: "granted",
        enabled: true,
        setEnabled,
        requestPermission,
      })
    );

    renderQueue();
    const checkbox = screen.getByRole("checkbox", { name: /OS notifications/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("disables the OS notifications toggle when permission is denied and hides it when unsupported", () => {
    mockUseOsNotifications.mockReturnValue(
      defaultOsNotifications({ permission: "denied", enabled: false })
    );

    const { rerender } = renderQueue();
    const checkbox = screen.getByRole("checkbox", { name: /OS notifications/i });
    expect(checkbox).toBeDisabled();
    expect(screen.getByTestId("pending-approvals-os-notify-toggle")).toHaveTextContent(
      /blocked in browser/i
    );

    mockUseOsNotifications.mockReturnValue(
      defaultOsNotifications({ supported: false, permission: "unsupported" })
    );
    rerender(
      <PendingApprovalQueue
        items={[item()]}
        signerAddress={SIGNER}
        onSign={vi.fn()}
        now={NOW}
      />
    );
    expect(
      screen.queryByTestId("pending-approvals-os-notify-toggle")
    ).not.toBeInTheDocument();
  });
});

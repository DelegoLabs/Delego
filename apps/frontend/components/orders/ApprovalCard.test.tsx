import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Order } from "@delegolabs/types";
import { ApprovalCard } from "./ApprovalCard";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("../../hooks/useCurrency", () => ({
  useCurrency: () => ({ currencyId: "XLM", rate: null }),
}));
vi.mock("../../hooks/useTimeFormat", () => ({
  useTimeFormat: () => ({
    preferences: { timezone: "auto", clockFormat: "24h", firstDayOfWeek: 1 },
    effectiveTimezone: "UTC",
    setPreferences: vi.fn(),
    hydrated: true,
  }),
}));
vi.mock("../../hooks/useAnnounce", () => ({ useAnnounce: () => ({ announce: vi.fn() }) }));
vi.mock("../../hooks/useNetworkMismatch", () => ({ useNetworkMismatch: () => ({ isMismatched: false }) }));
vi.mock("../../hooks/useDemoModeGuard", () => ({
  useDemoModeGuard: () => ({
    isDemoMode: false,
    guard: (fn: (...args: unknown[]) => unknown) => fn,
  }),
  DEMO_MODE_BLOCKED_MESSAGE: "Demo mode is read-only.",
}));
vi.mock("../../hooks/useDelegationTags", () => ({
  useDelegationTags: () => ({ getTag: () => undefined }),
}));
vi.mock("../delegations/public", () => ({ DelegationTagBadge: () => null }));

const mockUseFeatureFlag = vi.fn();
vi.mock("../../lib/featureFlags", () => ({
  useFeatureFlag: (...args: unknown[]) => mockUseFeatureFlag(...args),
}));

const mockUseDualControlCapability = vi.fn();
vi.mock("../../hooks/useDualControlCapability", () => ({
  useDualControlCapability: () => mockUseDualControlCapability(),
}));

const mockUseWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => mockUseWallet() }));

const mockSubmitApproval = vi.fn();
vi.mock("../../services/approvals", () => ({
  submitApproval: (...args: unknown[]) => mockSubmitApproval(...args),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    delegationId: "del-1",
    status: "pending_approval",
    lineItems: [],
    totalStroops: 6_000n * 10_000_000n,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("ApprovalCard — dual control (#574)", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockUseDualControlCapability.mockReturnValue(false);
    mockUseWallet.mockReturnValue({ address: "wallet-a" });
    mockSubmitApproval.mockReset();
  });

  it("flag off: behaves exactly like the ordinary single-approval flow, no tag, calls onApprove", async () => {
    const order = makeOrder({
      dualControl: {
        required: true,
        status: "awaiting_countersign",
        firstApproval: { approverId: "wallet-a", timestamp: "2026-01-01T00:00:00.000Z" },
      },
    });
    const onApprove = vi.fn();
    const user = userEvent.setup();

    render(<ApprovalCard order={order} onApprove={onApprove} onReject={vi.fn()} />);

    expect(screen.queryByTestId("dual-control-tag")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Approve & Pay" }));
    expect(onApprove).toHaveBeenCalledWith("order-1");
    expect(mockSubmitApproval).not.toHaveBeenCalled();
  });

  it("flag on, order requires dual control: shows the waiting tag and blocks the first approver's own countersign", () => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseDualControlCapability.mockReturnValue(true);
    const order = makeOrder({
      dualControl: {
        required: true,
        status: "awaiting_countersign",
        firstApproval: { approverId: "wallet-a", timestamp: "2026-01-01T00:00:00.000Z" },
      },
    });

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByTestId("dual-control-tag")).toHaveTextContent("Waiting for countersignature");
    expect(screen.getByRole("button", { name: "Approve & Pay" })).toBeDisabled();
  });

  it("a different authorized signer can countersign via the dedicated dual-control submit path", async () => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseDualControlCapability.mockReturnValue(true);
    mockUseWallet.mockReturnValue({ address: "wallet-b" });
    mockSubmitApproval.mockResolvedValue({
      data: {
        id: "order-1",
        status: "approved",
        dualControl: { required: true, status: "completed" },
      },
      error: null,
    });
    const order = makeOrder({
      dualControl: {
        required: true,
        status: "awaiting_countersign",
        firstApproval: { approverId: "wallet-a", timestamp: "2026-01-01T00:00:00.000Z" },
      },
    });
    const onDualControlUpdate = vi.fn();
    const user = userEvent.setup();

    render(
      <ApprovalCard
        order={order}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDualControlUpdate={onDualControlUpdate}
      />
    );

    expect(screen.getByTestId("dual-control-tag")).toHaveTextContent("Ready to countersign");
    await user.click(screen.getByRole("button", { name: "Approve & Pay" }));

    expect(mockSubmitApproval).toHaveBeenCalledWith("order-1", "wallet-b");
    expect(onDualControlUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" })
    );
  });
});

describe("ApprovalCard — structured rejection reasons (#567)", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockUseDualControlCapability.mockReturnValue(false);
    mockUseWallet.mockReturnValue({ address: "wallet-a" });
  });

  it("rejects with no reason when the picker is never opened (backward compatible)", async () => {
    const order = makeOrder();
    const onReject = vi.fn();
    const user = userEvent.setup();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={onReject} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Confirm Reject" }));

    expect(onReject).toHaveBeenCalledWith("order-1", undefined, undefined);
  });

  it("collects a structured reason code and free-text detail before rejecting", async () => {
    const order = makeOrder();
    const onReject = vi.fn();
    const user = userEvent.setup();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={onReject} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    await user.click(screen.getByText("+ Add reason"));
    await user.selectOptions(
      screen.getByLabelText("Reason for rejection"),
      "too_expensive"
    );
    await user.type(
      screen.getByPlaceholderText("Additional detail (optional)"),
      "Over budget for this quarter"
    );
    await user.click(screen.getByRole("button", { name: "Confirm Reject" }));

    expect(onReject).toHaveBeenCalledWith(
      "order-1",
      "Over budget for this quarter",
      "too_expensive"
    );
  });
});

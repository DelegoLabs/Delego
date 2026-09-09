import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

const mockUseApprovalNoteCapability = vi.fn();
vi.mock("../../hooks/useApprovalNoteCapability", () => ({
  useApprovalNoteCapability: () => mockUseApprovalNoteCapability(),
}));

const mockUseWallet = vi.fn();
vi.mock("../../hooks/useWallet", () => ({ useWallet: () => mockUseWallet() }));

const mockSubmitApproval = vi.fn();
vi.mock("../../services/approvals", () => ({
  submitApproval: (...args: unknown[]) => mockSubmitApproval(...args),
}));

const mockSetLocalApprovalNote = vi.fn();
vi.mock("../../lib/localApprovalNotes", () => ({
  setLocalApprovalNote: (...args: unknown[]) => mockSetLocalApprovalNote(...args),
  getLocalApprovalNote: () => null,
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
    mockUseApprovalNoteCapability.mockReturnValue(false);
    mockUseWallet.mockReturnValue({ address: "wallet-a" });
    mockSubmitApproval.mockReset();
    mockSetLocalApprovalNote.mockReset();
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

    render(<ApprovalCard order={order} onApprove={onApprove} onReject={vi.fn()} />);

    expect(screen.queryByTestId("dual-control-tag")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve & Pay" }));
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

    render(
      <ApprovalCard
        order={order}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDualControlUpdate={onDualControlUpdate}
      />
    );

    expect(screen.getByTestId("dual-control-tag")).toHaveTextContent("Ready to countersign");
    fireEvent.click(screen.getByRole("button", { name: "Approve & Pay" }));

    await waitFor(() => {
      expect(mockSubmitApproval).toHaveBeenCalledWith("order-1", "wallet-b");
      expect(onDualControlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved" })
      );
    });
  });
});

describe("ApprovalCard — structured rejection reasons (#567)", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockUseDualControlCapability.mockReturnValue(false);
    mockUseWallet.mockReturnValue({ address: "wallet-a" });
  });

  it("rejects with no reason when the picker is never opened (backward compatible)", () => {
    const order = makeOrder();
    const onReject = vi.fn();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Reject" }));

    expect(onReject).toHaveBeenCalledWith("order-1", undefined, undefined);
  });

  it("collects a structured reason code and free-text detail before rejecting", () => {
    const order = makeOrder();
    const onReject = vi.fn();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={onReject} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByText("+ Add reason"));
    fireEvent.change(screen.getByLabelText("Reason for rejection"), {
      target: { value: "too_expensive" },
    });
    fireEvent.change(screen.getByPlaceholderText("Additional detail (optional)"), {
      target: { value: "Over budget for this quarter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Reject" }));

    expect(onReject).toHaveBeenCalledWith(
      "order-1",
      "Over budget for this quarter",
      "too_expensive"
    );
  });
});

describe("ApprovalCard — approve-with-note (#573)", () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(false);
    mockUseDualControlCapability.mockReturnValue(false);
    mockUseWallet.mockReturnValue({ address: "wallet-a" });
    mockSubmitApproval.mockReset();
    mockSetLocalApprovalNote.mockReset();
  });

  it("approving with no note calls the plain onApprove path, never submitApproval", () => {
    mockUseApprovalNoteCapability.mockReturnValue(true);
    const order = makeOrder();
    const onApprove = vi.fn();

    render(<ApprovalCard order={order} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve & Pay" }));

    expect(onApprove).toHaveBeenCalledWith("order-1");
    expect(mockSubmitApproval).not.toHaveBeenCalled();
  });

  it("when the API supports approvalNote, submits the note via submitApproval", async () => {
    mockUseApprovalNoteCapability.mockReturnValue(true);
    mockSubmitApproval.mockResolvedValue({
      data: { id: "order-1", status: "approved", approvalNote: "Please expedite" },
      error: null,
    });
    const order = makeOrder();
    const onApprove = vi.fn();

    render(<ApprovalCard order={order} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Please expedite" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Pay" }));

    await waitFor(() => {
      expect(mockSubmitApproval).toHaveBeenCalledWith("order-1", "wallet-a", "Please expedite");
    });
    expect(onApprove).not.toHaveBeenCalled();
    expect(mockSetLocalApprovalNote).not.toHaveBeenCalled();
  });

  it("when the API doesn't support approvalNote, keeps the note local-only and still calls the plain onApprove path", async () => {
    mockUseApprovalNoteCapability.mockReturnValue(false);
    const order = makeOrder();
    const onApprove = vi.fn();

    render(<ApprovalCard order={order} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "Local only note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Pay" }));

    await waitFor(() => {
      expect(mockSetLocalApprovalNote).toHaveBeenCalledWith("order-1", "Local only note");
    });
    expect(mockSubmitApproval).not.toHaveBeenCalled();
    expect(onApprove).toHaveBeenCalledWith("order-1");
  });

  it("enforces the 280-character limit client-side by disabling Approve past the limit", () => {
    mockUseApprovalNoteCapability.mockReturnValue(true);
    const order = makeOrder();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const textarea = screen.getByLabelText("Note (optional)");
    fireEvent.change(textarea, { target: { value: "a".repeat(281) } });

    expect(screen.getByRole("button", { name: "Approve & Pay" })).toBeDisabled();
  });

  it("renders the counter reflecting remaining characters", () => {
    mockUseApprovalNoteCapability.mockReturnValue(true);
    const order = makeOrder();

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), {
      target: { value: "hello" },
    });

    expect(screen.getByText("275 characters remaining")).toBeInTheDocument();
  });

  it("renders a persisted approvalNote on the order with the distinct note treatment", () => {
    const order = makeOrder({ approvalNote: "Substitute store brand" });

    render(<ApprovalCard order={order} onApprove={vi.fn()} onReject={vi.fn()} />);

    const noteEl = screen.getByTestId("approval-note-order-1");
    expect(noteEl).toHaveTextContent("Substitute store brand");
    expect(noteEl.className).toContain("approval-note-display");
    expect(noteEl.className).not.toContain("approval-note-display-unsynced");
  });
});

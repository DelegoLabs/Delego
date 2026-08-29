import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataErasureCard } from "./DataErasureCard";

const mockUseDataErasureCapability = vi.fn();
vi.mock("../../hooks/useDataErasureCapability", () => ({
  useDataErasureCapability: () => mockUseDataErasureCapability(),
}));

const mockClearAllLocalData = vi.fn();
vi.mock("../../lib/localDataClear", () => ({
  clearAllLocalData: (...args: unknown[]) => mockClearAllLocalData(...args),
}));

const mockSubmit = vi.fn();
const mockCancel = vi.fn();
let mockErasureState: {
  request: { requestedAt: string; finalizesAt: string; status: string } | null;
  requesting: boolean;
  cancelling: boolean;
  error: string | null;
};
vi.mock("../../hooks/useErasureRequest", () => ({
  useErasureRequest: () => ({
    ...mockErasureState,
    submit: mockSubmit,
    cancel: mockCancel,
  }),
}));

describe("DataErasureCard (#610)", () => {
  beforeEach(() => {
    mockUseDataErasureCapability.mockReturnValue(false);
    mockClearAllLocalData.mockReset();
    mockClearAllLocalData.mockResolvedValue({ clearedKeys: ["delego_tracked_txs"] });
    mockSubmit.mockReset();
    mockCancel.mockReset();
    mockErasureState = {
      request: null,
      requesting: false,
      cancelling: false,
      error: null,
    };
  });

  it("always shows the local-only clear option, independent of server capability", () => {
    render(<DataErasureCard />);
    expect(screen.getByRole("button", { name: "Clear local data" })).toBeInTheDocument();
  });

  it("clearing local data executes immediately and shows a verifiable result", async () => {
    const user = userEvent.setup();
    render(<DataErasureCard />);

    await user.click(screen.getByRole("button", { name: "Clear local data" }));

    expect(mockClearAllLocalData).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Cleared 1 local record")
    );
  });

  it("hides the server erasure tier entirely when the API doesn't advertise support", () => {
    mockUseDataErasureCapability.mockReturnValue(false);
    render(<DataErasureCard />);
    expect(screen.queryAllByText("Delete my account data")).toHaveLength(0);
  });

  it("shows the server erasure tier when the API advertises support", () => {
    mockUseDataErasureCapability.mockReturnValue(true);
    render(<DataErasureCard />);
    expect(screen.getByRole("button", { name: "Delete my account data" })).toBeInTheDocument();
  });

  it("requires the typed DELETE confirmation before the request can be submitted", async () => {
    mockUseDataErasureCapability.mockReturnValue(true);
    const user = userEvent.setup();
    render(<DataErasureCard />);

    await user.click(screen.getByRole("button", { name: "Delete my account data" }));
    const confirmButton = screen.getByRole("button", { name: "Request account erasure" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "wrong");
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Type DELETE to confirm"));
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(mockSubmit).toHaveBeenCalled();
  });

  it("shows the cooldown/pending state with a cancel affordance once a request is on record", () => {
    mockUseDataErasureCapability.mockReturnValue(true);
    mockErasureState = {
      request: {
        requestedAt: "2026-01-01T00:00:00.000Z",
        finalizesAt: "2026-01-31T00:00:00.000Z",
        status: "pending",
      },
      requesting: false,
      cancelling: false,
      error: null,
    };
    render(<DataErasureCard />);

    expect(screen.getByText(/Erasure pending since/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel erasure request" })).toBeInTheDocument();
  });

  it("calls cancel() when the cancel affordance is used", async () => {
    mockUseDataErasureCapability.mockReturnValue(true);
    mockErasureState = {
      request: {
        requestedAt: "2026-01-01T00:00:00.000Z",
        finalizesAt: "2026-01-31T00:00:00.000Z",
        status: "pending",
      },
      requesting: false,
      cancelling: false,
      error: null,
    };
    const user = userEvent.setup();
    render(<DataErasureCard />);

    await user.click(screen.getByRole("button", { name: "Cancel erasure request" }));
    expect(mockCancel).toHaveBeenCalled();
  });

  it("does not show the confirmation flow once a request is already pending", () => {
    mockUseDataErasureCapability.mockReturnValue(true);
    mockErasureState = {
      request: {
        requestedAt: "2026-01-01T00:00:00.000Z",
        finalizesAt: "2026-01-31T00:00:00.000Z",
        status: "pending",
      },
      requesting: false,
      cancelling: false,
      error: null,
    };
    render(<DataErasureCard />);
    expect(screen.queryByRole("button", { name: "Delete my account data" })).toBeNull();
    expect(screen.queryByLabelText("Type DELETE to confirm")).toBeNull();
  });
});

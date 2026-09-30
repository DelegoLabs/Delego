import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Escrow } from "@delegolabs/types";
import { ReleaseConfirmModal } from "./ReleaseConfirmModal";

const escrow: Escrow = {
  escrowId: "42",
  orderId: "0a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789",
  amount: "15000000000",
  buyer: "GBVNNEXAMPLEBUYER",
  seller: "GCSV4EXAMPLESELLER",
  token: "CAS3JTOKENADDR",
  status: "Funded",
  createdAt: "2026-07-20T10:00:00.000Z",
};

function renderModal(overrides: Partial<React.ComponentProps<typeof ReleaseConfirmModal>> = {}) {
  const props = {
    isOpen: true,
    escrow,
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ReleaseConfirmModal {...props} />);
  return props;
}

describe("ReleaseConfirmModal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ReleaseConfirmModal
        isOpen={false}
        escrow={escrow}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the rating control, note field, and confirm action", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /merchant rating/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/satisfaction note/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm & release/i })).toBeInTheDocument();
  });

  it("builds the payload from the selected rating and trimmed note", async () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /^5 stars/ }));
    fireEvent.change(screen.getByLabelText(/satisfaction note/i), {
      target: { value: "  arrived early  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledWith({
        escrowId: "42",
        orderId: escrow.orderId,
        feedbackRating: 5,
        satisfactionNote: "arrived early",
      });
    });
  });

  it("omits the rating when the buyer skips it", async () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalledWith({
        escrowId: "42",
        orderId: escrow.orderId,
      });
    });
  });

  it("celebrates and switches to the Released state once the release resolves", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() => {
      expect(screen.getByTestId("release-status-badge")).toHaveTextContent("Released");
    });
    expect(screen.getByText("Funds released")).toBeInTheDocument();
    expect(screen.getByTestId("confetti-burst")).toBeInTheDocument();
  });

  it("keeps the form usable and surfaces the error when the release rejects", async () => {
    const props = renderModal({
      onConfirm: vi.fn().mockRejectedValue(new Error("Wallet rejected the signature")),
    });

    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Wallet rejected the signature");
    });
    expect(screen.queryByTestId("release-status-badge")).toBeNull();
    expect(screen.getByRole("button", { name: /confirm & release/i })).toBeEnabled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("closes via Cancel without confirming", () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

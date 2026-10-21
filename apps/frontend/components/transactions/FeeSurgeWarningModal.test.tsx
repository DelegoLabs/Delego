import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GasFeeEstimate } from "../../lib/feeSurge";
import { FeeSurgeWarningModal } from "./FeeSurgeWarningModal";

const estimate: GasFeeEstimate = {
  baseFeeStroops: "250000",
  recommendedFeeStroops: "500000",
  isSurgeActive: true,
  userConfiguredMaxFeeStroops: "100000",
};

function renderModal(
  overrides: Partial<React.ComponentProps<typeof FeeSurgeWarningModal>> = {}
) {
  const props = {
    isOpen: true,
    estimate,
    onApprove: vi.fn().mockResolvedValue(undefined),
    onPostpone: vi.fn(),
    ...overrides,
  };
  render(<FeeSurgeWarningModal {...props} />);
  return props;
}

describe("FeeSurgeWarningModal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <FeeSurgeWarningModal
        isOpen={false}
        estimate={estimate}
        onApprove={vi.fn()}
        onPostpone={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("warns the user and shows the fee breakdown", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /network fees are surging/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/above your max fee limit/i);

    expect(screen.getByText("Network base fee")).toBeInTheDocument();
    expect(screen.getByText("Recommended fee")).toBeInTheDocument();
    expect(screen.getByText("Your max fee limit")).toBeInTheDocument();
    expect(screen.getByText(/250,000 stroops/)).toBeInTheDocument();
    expect(screen.getByText(/500,000 stroops/)).toBeInTheDocument();
  });

  it("shows the fee this transaction pays when it is known", () => {
    renderModal({ transactionFeeStroops: "500000" });

    expect(screen.getByText("This transaction pays")).toBeInTheDocument();
  });

  it("mentions congestion only when the network is actually surging", () => {
    renderModal({
      estimate: { ...estimate, isSurgeActive: false },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /fees are above their normal level/i
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/congested/i);
  });

  it("approves the surge fee when the user confirms", async () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /approve surge fee/i }));

    await waitFor(() => {
      expect(props.onApprove).toHaveBeenCalledTimes(1);
    });
    expect(props.onPostpone).not.toHaveBeenCalled();
  });

  it("postpones the transaction without approving it", () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /postpone/i }));

    expect(props.onPostpone).toHaveBeenCalledTimes(1);
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it("postpones when the backdrop is clicked", () => {
    const props = renderModal();

    fireEvent.click(screen.getByTestId("fee-surge-backdrop"));

    expect(props.onPostpone).toHaveBeenCalledTimes(1);
    expect(props.onApprove).not.toHaveBeenCalled();
  });

  it("postpones when Escape is pressed", () => {
    const props = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onPostpone).toHaveBeenCalledTimes(1);
  });

  it("surfaces the error when the approval fails", async () => {
    const props = renderModal({
      onApprove: vi.fn().mockRejectedValue(new Error("Wallet rejected the signature")),
    });

    fireEvent.click(screen.getByRole("button", { name: /approve surge fee/i }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").some((node) =>
        node.textContent?.includes("Wallet rejected the signature")
      )).toBe(true);
    });
    expect(props.onApprove).toHaveBeenCalledTimes(1);
  });

  it("disables the actions while the transaction is being submitted", () => {
    renderModal({ approving: true });

    expect(screen.getByRole("button", { name: /approve surge fee/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /postpone/i })).toBeDisabled();
  });
});

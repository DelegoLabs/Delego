import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Escrow } from "@delegolabs/types";
import { ConfirmDeliveryButton } from "./ConfirmDeliveryButton";

const escrow: Escrow = {
  escrowId: "42",
  orderId: "order-42",
  amount: "15000000000",
  buyer: "GBVNNEXAMPLEBUYER",
  seller: "GCSV4EXAMPLESELLER",
  token: "CAS3JTOKENADDR",
  status: "Funded",
  createdAt: "2026-07-20T10:00:00.000Z",
};

const TIMELINE_KEY = "delego:escrow-timeline:42";

function readTimeline(): Array<Record<string, unknown>> {
  return JSON.parse(window.localStorage.getItem(TIMELINE_KEY) ?? "[]");
}

describe("ConfirmDeliveryButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens the release confirmation modal from the CTA", () => {
    render(<ConfirmDeliveryButton escrow={escrow} onRelease={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("confirm-delivery-button"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("releases, notifies the caller, and records a confirmed timeline entry", async () => {
    const onRelease = vi.fn().mockResolvedValue({ data: null, error: null });
    const onReleased = vi.fn();

    render(
      <ConfirmDeliveryButton
        escrow={escrow}
        onRelease={onRelease}
        onReleased={onReleased}
      />
    );

    fireEvent.click(screen.getByTestId("confirm-delivery-button"));
    fireEvent.click(screen.getByRole("radio", { name: /^4 stars/ }));
    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() => expect(onReleased).toHaveBeenCalledTimes(1));

    expect(onRelease).toHaveBeenCalledWith(
      expect.objectContaining({ escrowId: "42", feedbackRating: 4 })
    );

    const timeline = readTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      type: "release_confirmed",
      status: "confirmed",
      title: "Escrow released",
    });
  });

  it("rolls back the optimistic timeline entry when the release fails", async () => {
    const onRelease = vi.fn().mockRejectedValue(new Error("network down"));

    render(<ConfirmDeliveryButton escrow={escrow} onRelease={onRelease} />);

    fireEvent.click(screen.getByTestId("confirm-delivery-button"));
    fireEvent.click(screen.getByRole("button", { name: /confirm & release/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("network down")
    );

    // No phantom entry: the release never landed on-chain.
    expect(readTimeline()).toHaveLength(0);
  });

  it("disables the CTA when asked to", () => {
    render(<ConfirmDeliveryButton escrow={escrow} onRelease={vi.fn()} disabled />);

    expect(screen.getByTestId("confirm-delivery-button")).toBeDisabled();
  });
});

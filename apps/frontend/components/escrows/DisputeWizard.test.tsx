import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputeWizard } from "./DisputeWizard";

describe("DisputeWizard", () => {
  it("renders the first step (reason selection)", () => {
    render(
      <DisputeWizard
        escrowId="escrow-123"
        escrowStatus="Funded"
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText("File Formal Dispute")).toBeInTheDocument();
    expect(screen.getByText("Select Dispute Reason")).toBeInTheDocument();
    expect(screen.getByText("Item Not Received")).toBeInTheDocument();
  });

  it("prevents dispute filing after escrow has already been released or refunded", () => {
    render(
      <DisputeWizard
        escrowId="escrow-123"
        escrowStatus="Released"
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText("Dispute Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Prevents dispute filing after escrow has already been released or refunded."
      )
    ).toBeInTheDocument();
  });

  it("navigates through the wizard steps and submits form", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <DisputeWizard
        escrowId="escrow-123"
        escrowStatus="Funded"
        onSubmit={onSubmit}
      />
    );

    // Step 0 -> Next
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 1: description
    expect(screen.getByText("Describe the Issue & Requested Resolution")).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText(/provide detailed information/i),
      "Did not receive item at all."
    );
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: evidence
    expect(screen.getByText("Upload Evidence Images")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3: review & submit
    expect(screen.getByText("Review & Submit Dispute")).toBeInTheDocument();
    expect(screen.getByText("Did not receive item at all.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /submit dispute/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          escrowId: "escrow-123",
          reason: "item_not_received",
          description: "Did not receive item at all.",
          requestedAction: "full_refund",
        })
      );
    });
  });
});

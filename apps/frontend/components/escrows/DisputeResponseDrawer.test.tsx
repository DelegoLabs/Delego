import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Dispute } from "@delegolabs/types";
import { DisputeResponseDrawer } from "./DisputeResponseDrawer";

vi.mock("../../lib/disputeResponses", () => ({
  submitDisputeResponse: vi.fn(async () => {}),
}));

const dispute: Dispute = {
  id: "dsp_1",
  reason: "not_received",
  description: "Parcel never arrived.",
} as Dispute;

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

/** Wraps the drawer in a trigger so focus restoration has somewhere to go. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Respond to dispute
      </button>
      <DisputeResponseDrawer
        open={open}
        dispute={dispute}
        arbitrationDeadline={FUTURE}
        onClose={() => setOpen(false)}
        onSubmitted={() => {}}
      />
    </div>
  );
}

describe("DisputeResponseDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves focus into the panel when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Respond to dispute" });
    await user.click(trigger);

    // First tabbable control inside the panel is its close button.
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("cycles Tab within the panel instead of reaching the page behind it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Respond to dispute" }));
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();

    // A response statement is required, so the submit control only becomes
    // tabbable once the form has something to send.
    await user.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "Parcel was delivered on the 3rd."
    );
    const submit = screen.getByRole("button", { name: "Submit response" });
    expect(submit).toBeEnabled();

    // Forward past the last control in the panel and back to the top.
    submit.focus();
    await user.tab();
    expect(close).toHaveFocus();

    // …and backward off the front of the panel.
    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
  });

  it("exposes the panel, not the backdrop, as the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Respond to dispute" }));

    // A single dialog — the overlay wrapper and its click-to-close backdrop
    // must not duplicate the role.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-label",
      "Respond to dispute"
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Respond to dispute" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

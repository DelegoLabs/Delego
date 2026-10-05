import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Dispute } from "@delegolabs/types";
import { server } from "../../mocks/server";
import { http, HttpResponse } from "msw";
import { resetDisputeResponses } from "../../mocks/handlers/index";
import { DisputeResponseDrawer } from "./DisputeResponseDrawer";

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockSubmitDisputeResponse = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../../lib/disputeResponses", () => ({
  submitDisputeResponse: (...args: unknown[]) =>
    mockSubmitDisputeResponse(...args),
}));

const mockGuard = vi.fn((fn: () => unknown) => fn);
vi.mock("../../hooks/useDemoModeGuard", () => ({
  useDemoModeGuard: () => ({
    guard: (fn: () => unknown) => mockGuard(fn),
    disabledProps: {},
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.example.com";

const dispute: Dispute = {
  id: "dsp_1",
  reason: "not_received",
  description: "Parcel never arrived.",
} as Dispute;

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 1_000).toISOString();

/**
 * Wraps the drawer in a stateful trigger so focus restoration and open/close
 * cycles work exactly as they would in a real page context.
 */
function Harness({
  deadline = FUTURE,
  onSubmitted = () => {},
}: {
  deadline?: string;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Respond to dispute
      </button>
      <DisputeResponseDrawer
        open={open}
        dispute={dispute}
        arbitrationDeadline={deadline}
        onClose={() => setOpen(false)}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}

function makeFile(name: string, type = "image/jpeg", size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function renderDrawer(
  props: Partial<Parameters<typeof DisputeResponseDrawer>[0]> = {}
) {
  const defaults = {
    open: true,
    dispute,
    arbitrationDeadline: FUTURE,
    onClose: vi.fn(),
    onSubmitted: vi.fn(),
  };
  return render(<DisputeResponseDrawer {...defaults} {...props} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DisputeResponseDrawer", () => {
  beforeEach(() => {
    resetDisputeResponses();
    mockGuard.mockImplementation((fn) => fn);
    mockSubmitDisputeResponse.mockReset();
    mockSubmitDisputeResponse.mockResolvedValue(undefined);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Focus management & ARIA (from upstream) ───────────────────────────────

  it("moves focus into the panel when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Respond to dispute" }));

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
    // enabled once the form has something to send.
    await user.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "Parcel was delivered on the 3rd."
    );
    const submit = screen.getByRole("button", { name: "Submit response" });
    expect(submit).toBeEnabled();

    // Forward past the last control in the panel (Cancel follows Submit) and
    // back around to the top.
    const cancel = screen.getByTestId("cancel-button");
    cancel.focus();
    await user.tab();
    expect(close).toHaveFocus();

    // …and backward off the front of the panel back to the last control.
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("exposes the panel, not the backdrop, as the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Respond to dispute" }));

    // A single dialog — the wrapper and backdrop must not duplicate the role.
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

  // ── Visibility ────────────────────────────────────────────────────────────

  it("renders nothing when open=false", () => {
    const { container } = renderDrawer({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the buyer's dispute claim", () => {
    renderDrawer({
      dispute: {
        ...dispute,
        reason: "not_as_described",
        description: "Wrong colour.",
      } as Dispute,
    });
    expect(screen.getByTestId("dispute-claim-summary")).toHaveTextContent(
      "Item not as described"
    );
    expect(screen.getByTestId("dispute-claim-summary")).toHaveTextContent(
      "Wrong colour."
    );
  });

  // ── Arbitration deadline guard ─────────────────────────────────────────────

  it("shows an expired notice and disables submit when the deadline has passed", () => {
    renderDrawer({ arbitrationDeadline: PAST });
    expect(screen.getByTestId("arbitration-expired-notice")).toBeInTheDocument();
    expect(screen.getByTestId("submit-button")).toBeDisabled();
  });

  it("hides the dropzone when arbitration has expired", () => {
    renderDrawer({ arbitrationDeadline: PAST });
    expect(screen.queryByTestId("file-dropzone")).not.toBeInTheDocument();
  });

  // ── Close / cancel ─────────────────────────────────────────────────────────

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    await userEvent.click(screen.getByTestId("dispute-response-drawer-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the Cancel button is clicked", async () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    await userEvent.click(screen.getByTestId("cancel-button"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ── Form validation ────────────────────────────────────────────────────────

  it("submit is disabled when the statement is empty", () => {
    renderDrawer();
    expect(screen.getByTestId("submit-button")).toBeDisabled();
  });

  it("submit becomes enabled after typing a statement", async () => {
    renderDrawer();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "We shipped on time."
    );
    expect(screen.getByTestId("submit-button")).not.toBeDisabled();
  });

  // ── File dropzone ──────────────────────────────────────────────────────────

  it("renders the dropzone", () => {
    renderDrawer();
    expect(screen.getByTestId("file-dropzone")).toBeInTheDocument();
  });

  it("adds files via the file input and lists them", async () => {
    renderDrawer();
    await userEvent.upload(
      screen.getByTestId("receipt-file-input"),
      makeFile("receipt.jpg")
    );
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument();
  });

  it("shows a remove button for each attached file", async () => {
    renderDrawer();
    await userEvent.upload(screen.getByTestId("receipt-file-input"), [
      makeFile("a.jpg"),
      makeFile("b.png", "image/png"),
    ]);
    expect(screen.getByRole("button", { name: "Remove a.jpg" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove b.png" })).toBeInTheDocument();
  });

  it("removes a file when the remove button is clicked", async () => {
    renderDrawer();
    await userEvent.upload(
      screen.getByTestId("receipt-file-input"),
      makeFile("receipt.jpg")
    );
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove receipt.jpg" }));
    expect(screen.queryByText("receipt.jpg")).not.toBeInTheDocument();
  });

  it("shows an error when a file exceeds 10 MB", async () => {
    renderDrawer();
    await userEvent.upload(
      screen.getByTestId("receipt-file-input"),
      makeFile("big.jpg", "image/jpeg", 11 * 1024 * 1024)
    );
    expect(screen.getByTestId("file-error")).toHaveTextContent(
      "each file must be 10 MB or smaller"
    );
  });

  it("shows an error for unsupported file types", () => {
    renderDrawer();
    // Dropped rather than uploaded: the file input carries an `accept`
    // attribute, so the picker filters unsupported types out before the
    // component ever sees them. The dropzone is where runtime validation bites.
    fireEvent.drop(screen.getByTestId("file-dropzone"), {
      dataTransfer: { files: [makeFile("virus.exe", "application/octet-stream")] },
    });
    expect(screen.getByTestId("file-error")).toHaveTextContent(
      "only JPEG, PNG, WebP, and PDF files are accepted"
    );
  });

  it("shows an error when more than 5 files are attached", async () => {
    renderDrawer();
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`f${i}.jpg`));
    await userEvent.upload(screen.getByTestId("receipt-file-input"), files);
    // The input is disabled at the cap, so the overflow guard is reached by
    // dropping a sixth file onto the dropzone.
    fireEvent.drop(screen.getByTestId("file-dropzone"), {
      dataTransfer: { files: [makeFile("extra.jpg")] },
    });
    expect(screen.getByTestId("file-error")).toHaveTextContent(
      "You may attach up to 5 files"
    );
  });

  it("accepts drag-and-drop files onto the dropzone", async () => {
    renderDrawer();
    const file = makeFile("drag-receipt.pdf", "application/pdf");

    fireEvent.dragOver(screen.getByTestId("file-dropzone"));
    fireEvent.drop(screen.getByTestId("file-dropzone"), {
      dataTransfer: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByText("drag-receipt.pdf")).toBeInTheDocument()
    );
  });

  // ── Successful submission ──────────────────────────────────────────────────

  it("calls onSubmitted and onClose after a successful submission", async () => {
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    renderDrawer({ onClose, onSubmitted });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "We have proof of delivery."
    );
    await userEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("passes merchantStatement and carrierTrackingUrl to submitDisputeResponse", async () => {
    renderDrawer();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "All good on our end."
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Carrier tracking URL" }),
      "https://track.ups.com/12345"
    );
    await userEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() =>
      expect(mockSubmitDisputeResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantStatement: "All good on our end.",
          carrierTrackingUrl: "https://track.ups.com/12345",
          disputeId: "dsp_1",
        })
      )
    );
  });

  it("includes attached receipt files in the submission payload", async () => {
    renderDrawer();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "Here are the receipts."
    );
    await userEvent.upload(screen.getByTestId("receipt-file-input"), [
      makeFile("r1.jpg"),
      makeFile("r2.pdf", "application/pdf"),
    ]);
    await userEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      const call = mockSubmitDisputeResponse.mock.calls[0][0] as {
        receiptFiles: { name: string }[];
      };
      expect(call.receiptFiles).toHaveLength(2);
      expect(call.receiptFiles[0].name).toBe("r1.jpg");
      expect(call.receiptFiles[1].name).toBe("r2.pdf");
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows an error alert when submitDisputeResponse rejects", async () => {
    mockSubmitDisputeResponse.mockRejectedValueOnce(
      new Error("Statement too short.")
    );

    renderDrawer();

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "ok"
    );
    await userEvent.click(screen.getByTestId("submit-button"));

    await waitFor(() =>
      expect(screen.getByTestId("submit-error")).toHaveTextContent(
        "Statement too short."
      )
    );
  });

  // ── Demo-mode guard ────────────────────────────────────────────────────────

  it("blocks submission in demo mode", async () => {
    const onSubmitted = vi.fn();
    // Guard returns a no-op — simulates demo mode blocking execution.
    mockGuard.mockImplementation(() => () => undefined);

    renderDrawer({ onSubmitted });

    await userEvent.type(
      screen.getByRole("textbox", { name: "Your response" }),
      "Should be blocked"
    );
    await userEvent.click(screen.getByTestId("submit-button"));

    expect(onSubmitted).not.toHaveBeenCalled();
    expect(mockSubmitDisputeResponse).not.toHaveBeenCalled();
  });
});

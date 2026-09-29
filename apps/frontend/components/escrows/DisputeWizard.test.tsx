import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DisputeWizard } from "./DisputeWizard";

const mockScrub = vi.fn();
const mockBlobToDataUrl = vi.fn();

vi.mock("../../lib/exif", async () => ({
  ...(await vi.importActual<typeof import("../../lib/exif")>("../../lib/exif")),
  scrubExifMetadata: (...args: unknown[]) => mockScrub(...args),
  blobToDataUrl: (...args: unknown[]) => mockBlobToDataUrl(...args),
}));

vi.mock("@delegolabs/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    ariaLabel?: string;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  Stepper: ({ steps, currentIndex }: { steps: { id: string; label: string }[]; currentIndex: number }) => (
    <nav aria-label="Dispute steps">
      {steps.map((s, i) => (
        <span key={s.id} aria-current={i === currentIndex ? "step" : undefined}>
          {s.label}
        </span>
      ))}
    </nav>
  ),
}));

const DESCRIPTION = "The screen arrived cracked.";

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

function goToReview(withPhoto = true) {
  fireEvent.click(screen.getByLabelText("Item arrived damaged"));
  next();
  fireEvent.change(screen.getByLabelText(/Describe what happened/), { target: { value: DESCRIPTION } });
  if (withPhoto) {
    fireEvent.change(screen.getByTestId("dispute-dropzone-input"), {
      target: { files: [new File(["x"], "crack.png", { type: "image/png" })] },
    });
  }
  next();
  fireEvent.click(screen.getByLabelText("Replacement"));
  next();
}

describe("DisputeWizard (#783)", () => {
  beforeEach(() => {
    let counter = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
    URL.revokeObjectURL = vi.fn();
    mockScrub.mockReset().mockResolvedValue(new Blob(["x"]));
    mockBlobToDataUrl.mockReset().mockResolvedValue("data:image/png;base64,AAA");
  });

  it("renders nothing when closed", () => {
    const { container } = render(<DisputeWizard isOpen={false} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("blocks Next on the reason step until a reason is chosen", () => {
    render(<DisputeWizard isOpen onSubmit={vi.fn()} onClose={vi.fn()} />);
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/Choose a reason/);
    expect(screen.getByRole("heading", { name: "What went wrong?" })).toBeInTheDocument();
  });

  it("validates the description before leaving the details step", () => {
    render(<DisputeWizard isOpen onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Item not received"));
    next();
    fireEvent.change(screen.getByLabelText(/Describe what happened/), { target: { value: "short" } });
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 10 characters/);
    expect(screen.getByRole("heading", { name: "Tell us what happened" })).toBeInTheDocument();
  });

  it("keeps the selection when going back", () => {
    render(<DisputeWizard isOpen onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Item arrived damaged"));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Item arrived damaged")).toBeChecked();
  });

  it("requires an outcome on the outcome step", () => {
    render(<DisputeWizard isOpen onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Item arrived damaged"));
    next();
    fireEvent.change(screen.getByLabelText(/Describe what happened/), { target: { value: DESCRIPTION } });
    next();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(/Choose the outcome/);
  });

  it("completes the full flow and submits scrubbed photos", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "d1" });
    render(<DisputeWizard isOpen onSubmit={onSubmit} onClose={vi.fn()} />);
    goToReview();

    expect(screen.getByRole("heading", { name: "Review your dispute" })).toBeInTheDocument();
    expect(screen.getByText("Item arrived damaged")).toBeInTheDocument();
    expect(screen.getByText("Replacement")).toBeInTheDocument();
    expect(screen.getByText(DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByText("crack.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit dispute" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "damaged",
      description: DESCRIPTION,
      requestedOutcome: "replacement",
      evidenceUrls: ["data:image/png;base64,AAA"],
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "What went wrong?" })).toBeInTheDocument()
    );
  });

  it("submits without photos", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "d2" });
    render(<DisputeWizard isOpen onSubmit={onSubmit} onClose={vi.fn()} />);
    goToReview(false);
    fireEvent.click(screen.getByRole("button", { name: "Submit dispute" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].evidenceUrls).toEqual([]);
    expect(mockScrub).not.toHaveBeenCalled();
  });

  it("shows an error and does not submit when a photo can't be processed", async () => {
    mockScrub.mockRejectedValue(new Error("Could not process that photo."));
    const onSubmit = vi.fn();
    render(<DisputeWizard isOpen onSubmit={onSubmit} onClose={vi.fn()} />);
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: "Submit dispute" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Could not process that photo/));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server error passed in via props", () => {
    render(<DisputeWizard isOpen error="Server said no" onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server said no");
  });

  it("calls onClose from Cancel", () => {
    const onClose = vi.fn();
    render(<DisputeWizard isOpen onSubmit={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

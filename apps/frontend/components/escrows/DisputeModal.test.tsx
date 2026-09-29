import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MAX_EVIDENCE_URLS } from "../../lib/disputes";
import { DisputeModal } from "./DisputeModal";

const mockScrubExifMetadata = vi.fn();
const mockBlobToDataUrl = vi.fn();

vi.mock("../../lib/exif", () => ({
  scrubExifMetadata: (...args: unknown[]) => mockScrubExifMetadata(...args),
  blobToDataUrl: (...args: unknown[]) => mockBlobToDataUrl(...args),
}));

const DRAFT_KEY = "delego_dispute_draft:escrow-9";

function seedDraft(overrides: Record<string, unknown> = {}) {
  window.sessionStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      reason: "item_not_received",
      description: "Seeded draft",
      evidenceUrls: [""],
      ...overrides,
    })
  );
}

describe("DisputeModal draft persistence (#746)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("restores a draft saved before the refresh", async () => {
    seedDraft({
      reason: "not_as_described",
      description: "The screen arrived cracked",
      evidenceUrls: ["https://evidence.example/photo.jpg"],
    });

    render(
      <DisputeModal
        isOpen
        escrowId="escrow-9"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      await screen.findByDisplayValue("The screen arrived cracked")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toHaveValue("not_as_described");
    expect(screen.getByLabelText("Evidence URL 1")).toHaveValue(
      "https://evidence.example/photo.jpg"
    );
  });

  it("persists typed input to sessionStorage as the user edits", async () => {
    const user = userEvent.setup();
    render(
      <DisputeModal
        isOpen
        escrowId="escrow-9"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText(/reason/i), "other");
    await user.type(screen.getByLabelText(/description/i), "Never delivered");

    await waitFor(() => {
      expect(
        JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) as string)
      ).toMatchObject({ reason: "other", description: "Never delivered" });
    });
  });

  it("clears the stored draft after a successful submit", async () => {
    seedDraft({ description: "Submit me" });
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ id: "dispute-1" });

    render(
      <DisputeModal
        isOpen
        escrowId="escrow-9"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    await screen.findByDisplayValue("Submit me");

    await user.click(screen.getByRole("button", { name: /submit dispute/i }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    );
    expect(screen.getByLabelText(/description/i)).toHaveValue("");
  });

  it("keeps the draft when the submission reports failure", async () => {
    seedDraft({ description: "Keep me" });
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(null);

    render(
      <DisputeModal
        isOpen
        escrowId="escrow-9"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />
    );
    await screen.findByDisplayValue("Keep me");

    await user.click(screen.getByRole("button", { name: /submit dispute/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(screen.getByLabelText(/description/i)).toHaveValue("Keep me");
  });
});

function renderModal(onSubmit = vi.fn()) {
  render(<DisputeModal isOpen onSubmit={onSubmit} onClose={vi.fn()} />);
  return onSubmit;
}

function imageFile(name = "beach.jpg", type = "image/jpeg") {
  return new File(["original-with-exif"], name, { type });
}

describe("DisputeModal — photo evidence EXIF scrubbing (#789)", () => {
  beforeEach(() => {
    mockScrubExifMetadata.mockReset();
    mockBlobToDataUrl.mockReset();
    mockScrubExifMetadata.mockResolvedValue(new Blob(["scrubbed"], { type: "image/png" }));
    mockBlobToDataUrl.mockResolvedValue("data:image/png;base64,SCRUBBED");
  });

  it("still submits typed evidence URLs", async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal();

    await user.type(screen.getByPlaceholderText("Describe what happened"), "Item never arrived");
    await user.type(screen.getByLabelText("Evidence URL 1"), "https://example.com/receipt.png");
    await user.click(screen.getByRole("button", { name: "Submit dispute" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: "item_not_received",
      description: "Item never arrived",
      evidenceUrls: ["https://example.com/receipt.png"],
    });
  });

  it("scrubs selected photos in the browser before including them as evidence", async () => {
    const user = userEvent.setup();
    const onSubmit = renderModal();
    const file = imageFile();

    await user.upload(screen.getByTestId("dispute-photo-input"), file);

    // The scrubbed result is shown, and the original file went through the
    // scrubber rather than being attached verbatim.
    await screen.findByText("Metadata removed");
    expect(mockScrubExifMetadata).toHaveBeenCalledWith(file);
    expect(mockBlobToDataUrl).toHaveBeenCalledTimes(1);

    await user.type(screen.getByPlaceholderText("Describe what happened"), "Wrong item shipped");
    await user.click(screen.getByRole("button", { name: "Submit dispute" }));

    expect(onSubmit).toHaveBeenCalledWith({
      reason: "item_not_received",
      description: "Wrong item shipped",
      evidenceUrls: ["data:image/png;base64,SCRUBBED"],
    });
  });

  it("reports a scrubbing failure without attaching anything", async () => {
    mockScrubExifMetadata.mockRejectedValue(
      new Error("Could not decode the selected image. Try a JPEG, PNG, or WebP file.")
    );
    const user = userEvent.setup();
    renderModal();

    await user.upload(screen.getByTestId("dispute-photo-input"), imageFile("broken.jpg"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not decode");
    expect(screen.queryByText("Metadata removed")).toBeNull();
  });

  it("lets the buyer remove an attached photo", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.upload(screen.getByTestId("dispute-photo-input"), imageFile());
    await screen.findByText("Metadata removed");

    await user.click(screen.getByRole("button", { name: "Remove photo beach.jpg" }));

    expect(screen.queryByText("Metadata removed")).toBeNull();
  });

  it("caps photo evidence at the shared evidence limit", async () => {
    const user = userEvent.setup();
    renderModal();

    const files = Array.from({ length: MAX_EVIDENCE_URLS + 1 }, (_, i) =>
      imageFile(`photo-${i + 1}.jpg`)
    );
    await user.upload(screen.getByTestId("dispute-photo-input"), files);

    expect(await screen.findAllByText("Metadata removed")).toHaveLength(MAX_EVIDENCE_URLS);
    expect(screen.getByRole("alert")).toHaveTextContent(
      `up to ${MAX_EVIDENCE_URLS} pieces of evidence are allowed`
    );
  });
});

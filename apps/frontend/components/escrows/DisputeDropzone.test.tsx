import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DisputeDropzone } from "./DisputeDropzone";
import { MAX_PHOTO_FILES } from "../../lib/disputeWizard";

function image(name = "a.png", type = "image/png"): File {
  return new File(["x"], name, { type });
}

function Harness({ initial = [], spy }: { initial?: File[]; spy?: (files: File[]) => void }) {
  const [files, setFiles] = useState<File[]>(initial);
  return (
    <DisputeDropzone
      files={files}
      onChange={(next) => {
        spy?.(next);
        setFiles(next);
      }}
    />
  );
}

describe("DisputeDropzone (#783)", () => {
  beforeEach(() => {
    let counter = 0;
    URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the empty prompt", () => {
    render(<Harness />);
    expect(screen.getByText(/Drag photos here/)).toBeInTheDocument();
    expect(screen.queryByText(/photos$/)).not.toBeInTheDocument();
  });

  it("adds selected images and renders thumbnails", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByTestId("dispute-dropzone-input"), {
      target: { files: [image("one.png"), image("two.jpg", "image/jpeg")] },
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText("Preview of one.png")).toBeInTheDocument();
    expect(screen.getByAltText("Preview of two.jpg")).toBeInTheDocument();
    expect(screen.getByText(`2 of ${MAX_PHOTO_FILES} photos`)).toBeInTheDocument();
  });

  it("adds dropped images and toggles the dragging state", () => {
    render(<Harness />);
    const zone = screen.getByTestId("dispute-dropzone");
    fireEvent.dragOver(zone);
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-dragging", "false");
    fireEvent.drop(zone, { dataTransfer: { files: [image("dropped.png")] } });
    expect(screen.getByAltText("Preview of dropped.png")).toBeInTheDocument();
  });

  it("rejects non-images with an alert and does not call onChange", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByTestId("dispute-dropzone-input"), {
      target: { files: [image("doc.pdf", "application/pdf")] },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/doc\.pdf isn't a supported image/);
  });

  it("keeps valid files when others in the same drop are rejected", () => {
    render(<Harness />);
    fireEvent.drop(screen.getByTestId("dispute-dropzone"), {
      dataTransfer: { files: [image("ok.png"), image("bad.pdf", "application/pdf")] },
    });
    expect(screen.getByAltText("Preview of ok.png")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/bad\.pdf/);
  });

  it("blocks additions beyond the photo limit", () => {
    const spy = vi.fn();
    const full = Array.from({ length: MAX_PHOTO_FILES }, (_, i) => image(`p${i}.png`));
    render(<Harness initial={full} spy={spy} />);
    fireEvent.drop(screen.getByTestId("dispute-dropzone"), {
      dataTransfer: { files: [image("extra.png")] },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/extra\.png was not added/);
  });

  it("removes a photo", () => {
    render(<Harness initial={[image("keep.png"), image("drop.png")]} />);
    fireEvent.click(screen.getByLabelText("Remove drop.png"));
    expect(screen.queryByAltText("Preview of drop.png")).not.toBeInTheDocument();
    expect(screen.getByAltText("Preview of keep.png")).toBeInTheDocument();
  });

  it("shows a step-level error passed from the wizard", () => {
    render(<DisputeDropzone files={[]} onChange={() => {}} error="Attach at most 5 photos." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Attach at most 5 photos.");
  });
});

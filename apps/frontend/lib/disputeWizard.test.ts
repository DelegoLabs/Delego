import { describe, it, expect } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_FILES,
  buildCreateDisputeInput,
  createEmptyDisputeFormDraft,
  hasErrors,
  isDisputeFormComplete,
  validateDisputeStep,
  validateIncomingPhotos,
  validatePhotoFile,
  type DisputeFormDraft,
} from "./disputeWizard";

function image(name = "a.png", type = "image/png", size = 1024): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function validDraft(overrides: Partial<DisputeFormDraft> = {}): DisputeFormDraft {
  return {
    reason: "damaged",
    description: "The screen arrived cracked.",
    photoFiles: [image()],
    requestedOutcome: "replacement",
    ...overrides,
  };
}

describe("validateDisputeStep (#783)", () => {
  it("requires a reason on step 0", () => {
    const errors = validateDisputeStep(0, createEmptyDisputeFormDraft());
    expect(errors.reason).toBeTruthy();
    expect(validateDisputeStep(0, validDraft())).toEqual({});
  });

  it("requires a description of at least 10 characters on step 1", () => {
    expect(validateDisputeStep(1, validDraft({ description: "   short " })).description).toBeTruthy();
    expect(validateDisputeStep(1, validDraft()).description).toBeUndefined();
  });

  it("rejects a description over the maximum length", () => {
    const long = "a".repeat(MAX_DESCRIPTION_LENGTH + 1);
    expect(validateDisputeStep(1, validDraft({ description: long })).description).toBeTruthy();
  });

  it("treats photos as optional", () => {
    expect(validateDisputeStep(1, validDraft({ photoFiles: [] }))).toEqual({});
  });

  it("flags too many photos and invalid photo files", () => {
    const tooMany = Array.from({ length: MAX_PHOTO_FILES + 1 }, (_, i) => image(`p${i}.png`));
    expect(validateDisputeStep(1, validDraft({ photoFiles: tooMany })).photoFiles).toBeTruthy();
    const pdf = image("doc.pdf", "application/pdf");
    expect(validateDisputeStep(1, validDraft({ photoFiles: [pdf] })).photoFiles).toBeTruthy();
  });

  it("requires an outcome on step 2", () => {
    expect(validateDisputeStep(2, validDraft({ requestedOutcome: null })).requestedOutcome).toBeTruthy();
    expect(validateDisputeStep(2, validDraft())).toEqual({});
  });

  it("validates the whole form on the review step", () => {
    const errors = validateDisputeStep(3, createEmptyDisputeFormDraft());
    expect(Object.keys(errors).sort()).toEqual(["description", "reason", "requestedOutcome"]);
    expect(hasErrors(validateDisputeStep(3, validDraft()))).toBe(false);
  });
});

describe("photo validation (#783)", () => {
  it("accepts images and rejects SVG, non-images and oversized files", () => {
    expect(validatePhotoFile(image())).toBeNull();
    expect(validatePhotoFile(image("a.svg", "image/svg+xml"))).toMatch(/supported image/);
    expect(validatePhotoFile(image("a.pdf", "application/pdf"))).toMatch(/supported image/);
    expect(validatePhotoFile(image("big.png", "image/png", MAX_PHOTO_BYTES + 1))).toMatch(/larger than/);
  });

  it("caps accepted photos by remaining slots and reports the rest", () => {
    const incoming = [image("1.png"), image("2.png"), image("3.png")];
    const { accepted, errors } = validateIncomingPhotos(incoming, MAX_PHOTO_FILES - 2);
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/3\.png/);
  });

  it("reports invalid files without blocking valid ones", () => {
    const { accepted, errors } = validateIncomingPhotos([image("ok.png"), image("x.pdf", "application/pdf")], 0);
    expect(accepted.map((f) => f.name)).toEqual(["ok.png"]);
    expect(errors).toHaveLength(1);
  });
});

describe("isDisputeFormComplete and buildCreateDisputeInput (#783)", () => {
  it("narrows only when the draft is fully valid", () => {
    expect(isDisputeFormComplete(createEmptyDisputeFormDraft())).toBe(false);
    expect(isDisputeFormComplete(validDraft())).toBe(true);
  });

  it("builds the dispute payload with trimmed description and photo data URLs", () => {
    const draft = validDraft({ description: "  The screen arrived cracked.  " });
    if (!isDisputeFormComplete(draft)) throw new Error("expected a complete draft");
    expect(buildCreateDisputeInput(draft, ["data:image/png;base64,AAA"])).toEqual({
      reason: "damaged",
      description: "The screen arrived cracked.",
      requestedOutcome: "replacement",
      evidenceUrls: ["data:image/png;base64,AAA"],
    });
  });
});

import { MAX_EVIDENCE_URLS } from "./disputes";
import { isScrubbableImage } from "./exif";

/**
 * Pure model + validation for the guided dispute wizard (#783). No React,
 * no network: the wizard component drives it and `DisputeDropzone` reuses
 * `validateIncomingPhotos`.
 */

export const DISPUTE_WIZARD_REASONS = [
  "item_not_received",
  "damaged",
  "not_as_described",
] as const;
export type DisputeWizardReason = (typeof DISPUTE_WIZARD_REASONS)[number];

export const DISPUTE_WIZARD_OUTCOMES = ["full_refund", "replacement"] as const;
export type DisputeWizardOutcome = (typeof DISPUTE_WIZARD_OUTCOMES)[number];

export interface DisputeFormValues {
  reason: DisputeWizardReason;
  description: string;
  photoFiles: File[];
  requestedOutcome: DisputeWizardOutcome;
}

/** In-progress form: reason and outcome start unselected. */
export interface DisputeFormDraft {
  reason: DisputeWizardReason | null;
  description: string;
  photoFiles: File[];
  requestedOutcome: DisputeWizardOutcome | null;
}

export type DisputeFieldErrors = Partial<Record<keyof DisputeFormValues, string>>;

export const DISPUTE_WIZARD_STEPS = [
  { id: "reason", label: "Reason" },
  { id: "details", label: "Details" },
  { id: "outcome", label: "Outcome" },
  { id: "review", label: "Review" },
] as const;

export const DISPUTE_WIZARD_REASON_LABELS: Record<DisputeWizardReason, string> = {
  item_not_received: "Item not received",
  damaged: "Item arrived damaged",
  not_as_described: "Item not as described",
};

export const DISPUTE_WIZARD_OUTCOME_LABELS: Record<DisputeWizardOutcome, string> = {
  full_refund: "Full refund",
  replacement: "Replacement",
};

export const MIN_DESCRIPTION_LENGTH = 10;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_PHOTO_FILES = MAX_EVIDENCE_URLS;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function createEmptyDisputeFormDraft(): DisputeFormDraft {
  return { reason: null, description: "", photoFiles: [], requestedOutcome: null };
}

function isReason(value: unknown): value is DisputeWizardReason {
  return (DISPUTE_WIZARD_REASONS as readonly unknown[]).includes(value);
}

function isOutcome(value: unknown): value is DisputeWizardOutcome {
  return (DISPUTE_WIZARD_OUTCOMES as readonly unknown[]).includes(value);
}

/** Error message for one photo, or null when it is acceptable. */
export function validatePhotoFile(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!isScrubbableImage(file)) {
    return `${file.name} isn't a supported image. Use JPG, PNG or WebP.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name} is larger than ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

/**
 * Splits dropped/selected files into accepted and rejected, given how many
 * photos are already attached. Rejections carry a user-facing message.
 */
export function validateIncomingPhotos(
  incoming: File[],
  existingCount: number
): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];
  let slots = Math.max(0, MAX_PHOTO_FILES - existingCount);

  for (const file of incoming) {
    const problem = validatePhotoFile(file);
    if (problem) {
      errors.push(problem);
    } else if (slots <= 0) {
      errors.push(`${file.name} was not added: up to ${MAX_PHOTO_FILES} photos are allowed.`);
    } else {
      accepted.push(file);
      slots -= 1;
    }
  }
  return { accepted, errors };
}

/**
 * Validates the fields that belong to a wizard step (0-based).
 * Step 3 (review) validates the whole form.
 */
export function validateDisputeStep(step: number, draft: DisputeFormDraft): DisputeFieldErrors {
  const errors: DisputeFieldErrors = {};

  if (step === 0 || step === 3) {
    if (!isReason(draft.reason)) errors.reason = "Choose a reason for your dispute.";
  }

  if (step === 1 || step === 3) {
    const length = draft.description.trim().length;
    if (length < MIN_DESCRIPTION_LENGTH) {
      errors.description = `Describe what happened (at least ${MIN_DESCRIPTION_LENGTH} characters).`;
    } else if (length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`;
    }

    if (draft.photoFiles.length > MAX_PHOTO_FILES) {
      errors.photoFiles = `Attach at most ${MAX_PHOTO_FILES} photos.`;
    } else {
      const bad = draft.photoFiles.map(validatePhotoFile).find((message) => message !== null);
      if (bad) errors.photoFiles = bad;
    }
  }

  if (step === 2 || step === 3) {
    if (!isOutcome(draft.requestedOutcome)) {
      errors.requestedOutcome = "Choose the outcome you want.";
    }
  }

  return errors;
}

export function hasErrors(errors: DisputeFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Type guard: the draft is fully valid and can be submitted. */
export function isDisputeFormComplete(draft: DisputeFormDraft): draft is DisputeFormValues {
  return !hasErrors(validateDisputeStep(3, draft));
}

/**
 * Maps validated wizard values to the payload `useDispute().openDispute`
 * sends. `photoDataUrls` are the EXIF-scrubbed photos (see `lib/exif`), sent
 * in `evidenceUrls` exactly as `DisputeModal` does today.
 */
export function buildCreateDisputeInput(values: DisputeFormValues, photoDataUrls: string[]) {
  return {
    reason: values.reason,
    description: values.description.trim(),
    requestedOutcome: values.requestedOutcome,
    evidenceUrls: photoDataUrls,
  };
}

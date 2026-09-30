"use client";

import { useState } from "react";
import { Button, Stepper } from "@delegolabs/ui";
import { DisputeDropzone } from "./DisputeDropzone";
import { blobToDataUrl, scrubExifMetadata } from "../../lib/exif";
import { useDemoModeGuard } from "../../hooks/useDemoModeGuard";
import {
  DISPUTE_WIZARD_OUTCOMES,
  DISPUTE_WIZARD_OUTCOME_LABELS,
  DISPUTE_WIZARD_REASONS,
  DISPUTE_WIZARD_REASON_LABELS,
  DISPUTE_WIZARD_STEPS,
  MAX_DESCRIPTION_LENGTH,
  buildCreateDisputeInput,
  createEmptyDisputeFormDraft,
  hasErrors,
  isDisputeFormComplete,
  validateDisputeStep,
  type DisputeFieldErrors,
  type DisputeFormDraft,
} from "../../lib/disputeWizard";

export interface DisputeWizardProps {
  isOpen: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: ReturnType<typeof buildCreateDisputeInput>) => void | Promise<unknown>;
  onClose: () => void;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  name: string;
  values: readonly T[];
  labels: Record<T, string>;
  selected: T | null;
  onSelect: (value: T) => void;
  error?: string;
}

function OptionGroup<T extends string>({
  legend,
  name,
  values,
  labels,
  selected,
  onSelect,
  error,
}: OptionGroupProps<T>) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
      <legend className="dispute-modal-label">{legend}</legend>
      {values.map((value) => (
        <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0" }}>
          <input
            type="radio"
            name={name}
            value={value}
            checked={selected === value}
            onChange={() => onSelect(value)}
          />
          {labels[value]}
        </label>
      ))}
      {error && (
        <p className="settings-status error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Guided "Open dispute" wizard (#783): Reason, Details (description and
 * photo dropzone), Outcome, Review. Same props contract as `DisputeModal`.
 * Photos are EXIF-scrubbed at submit time and sent as data URLs in
 * `evidenceUrls`, exactly like the modal does.
 */
export function DisputeWizard({
  isOpen,
  submitting = false,
  error,
  onSubmit,
  onClose,
}: DisputeWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DisputeFormDraft>(createEmptyDisputeFormDraft);
  const [errors, setErrors] = useState<DisputeFieldErrors>({});
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { disabledProps, guard } = useDemoModeGuard();

  if (!isOpen) return null;

  const busy = submitting || processing;
  const lastStep = DISPUTE_WIZARD_STEPS.length - 1;

  const update = (patch: Partial<DisputeFormDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const goTo = (index: number) => {
    setErrors({});
    setStep(index);
  };

  const handleNext = () => {
    const stepErrors = validateDisputeStep(step, draft);
    setErrors(stepErrors);
    if (!hasErrors(stepErrors)) setStep(step + 1);
  };

  const handleSubmit = guard(async () => {
    if (!isDisputeFormComplete(draft)) {
      setErrors(validateDisputeStep(lastStep, draft));
      const firstBad = [0, 1, 2].find((i) => hasErrors(validateDisputeStep(i, draft)));
      if (firstBad !== undefined) setStep(firstBad);
      return;
    }
    setProcessing(true);
    setLocalError(null);
    try {
      const photoDataUrls: string[] = [];
      for (const file of draft.photoFiles) {
        photoDataUrls.push(await blobToDataUrl(await scrubExifMetadata(file)));
      }
      const result = await onSubmit(buildCreateDisputeInput(draft, photoDataUrls));
      if (result) {
        setDraft(createEmptyDisputeFormDraft());
        setErrors({});
        setStep(0);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not process your photos. Try again.");
    } finally {
      setProcessing(false);
    }
  });

  const shownError = localError ?? error ?? null;

  return (
    <div className="dispute-modal-overlay" onClick={onClose} data-testid="dispute-wizard-backdrop">
      <div
        className="dispute-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispute-wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dispute-modal-header">
          <h2 id="dispute-wizard-title">Open dispute</h2>
        </div>

        <Stepper steps={[...DISPUTE_WIZARD_STEPS]} currentIndex={step} onStepSelect={goTo} />

        <div className="dispute-modal-field" style={{ marginTop: "1rem" }}>
          {step === 0 && (
            <>
              <h3>What went wrong?</h3>
              <OptionGroup
                legend="Reason for dispute"
                name="dispute-wizard-reason"
                values={DISPUTE_WIZARD_REASONS}
                labels={DISPUTE_WIZARD_REASON_LABELS}
                selected={draft.reason}
                onSelect={(reason) => update({ reason })}
                error={errors.reason}
              />
            </>
          )}

          {step === 1 && (
            <>
              <h3>Tell us what happened</h3>
              <label htmlFor="dispute-wizard-description">Describe what happened</label>
              <textarea
                id="dispute-wizard-description"
                rows={4}
                maxLength={MAX_DESCRIPTION_LENGTH}
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Include dates, what you expected and what you received"
              />
              {errors.description && (
                <p className="settings-status error" role="alert">
                  {errors.description}
                </p>
              )}
              <span className="dispute-modal-label">Photo evidence (optional)</span>
              <DisputeDropzone
                files={draft.photoFiles}
                onChange={(photoFiles) => update({ photoFiles })}
                error={errors.photoFiles}
                disabled={busy}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h3>What outcome do you want?</h3>
              <OptionGroup
                legend="Requested outcome"
                name="dispute-wizard-outcome"
                values={DISPUTE_WIZARD_OUTCOMES}
                labels={DISPUTE_WIZARD_OUTCOME_LABELS}
                selected={draft.requestedOutcome}
                onSelect={(requestedOutcome) => update({ requestedOutcome })}
                error={errors.requestedOutcome}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h3>Review your dispute</h3>
              <dl style={{ margin: 0 }}>
                <dt>Reason</dt>
                <dd>{draft.reason ? DISPUTE_WIZARD_REASON_LABELS[draft.reason] : ""}</dd>
                <dt>Description</dt>
                <dd>{draft.description.trim()}</dd>
                <dt>Photos</dt>
                <dd>
                  {draft.photoFiles.length === 0 ? (
                    "None attached"
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                      {draft.photoFiles.map((file, index) => (
                        <li key={`${file.name}-${index}`}>{file.name}</li>
                      ))}
                    </ul>
                  )}
                </dd>
                <dt>Requested outcome</dt>
                <dd>
                  {draft.requestedOutcome ? DISPUTE_WIZARD_OUTCOME_LABELS[draft.requestedOutcome] : ""}
                </dd>
              </dl>
            </>
          )}
        </div>

        {shownError && (
          <div className="settings-status error" role="alert">
            {shownError}
          </div>
        )}

        <div className="form-actions">
          {step > 0 && (
            <Button variant="ghost" onClick={() => goTo(step - 1)} disabled={busy}>
              Back
            </Button>
          )}
          {step < lastStep ? (
            <Button variant="primary" onClick={handleNext} disabled={busy}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} disabled={busy} {...disabledProps}>
              {busy ? "Submitting…" : "Submit dispute"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

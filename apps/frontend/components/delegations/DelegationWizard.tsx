"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Stepper } from "@delegolabs/ui";
import type {
  CreateDelegationInput,
  DelegationPermissionLevel,
} from "@delegolabs/types";
import { useDelegationWizardDraft } from "../../hooks/useDelegationWizardDraft";
import { useAnnounce } from "../../hooks/useAnnounce";
import { consumeSessionInterrupted } from "../../lib/session";
import {
  useDemoModeGuard,
  DEMO_MODE_BLOCKED_MESSAGE,
} from "../../hooks/useDemoModeGuard";
import {
  DELEGATION_WIZARD_STEPS,
  draftToCreateInput,
  isDraftDirty,
  validateStep,
  type DelegationWizardStepId,
} from "../../lib/delegationWizard";
import { WizardStepAgent } from "./wizard/WizardStepAgent";
import { WizardStepScope } from "./wizard/WizardStepScope";
import { WizardStepLimits } from "./wizard/WizardStepLimits";
import { WizardStepReview } from "./wizard/WizardStepReview";

export interface DelegationWizardProps {
  defaultWalletId?: string;
  onSubmit: (input: CreateDelegationInput) => void | Promise<unknown>;
  onCancel?: () => void;
}

const STEP_LABEL_KEYS: Record<DelegationWizardStepId, string> = {
  agent: "steps.agent.title",
  scope: "steps.scope.title",
  limits: "steps.limits.title",
  review: "steps.review.title",
};

/**
 * Guided multi-step delegation creation flow (#523): choose agent → scope →
 * limits → review & confirm. Wraps DelegationForm's single-step fields in a
 * reviewable, keyboard-operable stepper, with the in-progress draft persisted
 * to localStorage via useDelegationWizardDraft so a refresh doesn't lose
 * progress.
 */
export function DelegationWizard({
  defaultWalletId = "",
  onSubmit,
  onCancel,
}: DelegationWizardProps) {
  const t = useTranslations("delegations.wizard");
  const tSteps = useTranslations("delegations.wizard.steps");
  const tCommon = useTranslations("common");
  const { announce } = useAnnounce();
  const { isDemoMode, guard } = useDemoModeGuard();

  const {
    draft,
    updateDraft,
    stepIndex,
    stepId,
    goToStep,
    hasStoredDraft,
    resumeDraft,
    discardDraft,
    clearDraft,
    hydrated,
  } = useDelegationWizardDraft(defaultWalletId);

  // Coming back from an idle-session redirect (#514): restore the parked
  // draft without making the user click "Resume" — they didn't choose to
  // leave. The normal refresh/navigation case still shows the resume banner.
  const autoRestoredRef = useRef(false);
  useEffect(() => {
    if (autoRestoredRef.current || !hydrated) return;
    autoRestoredRef.current = true;
    if (hasStoredDraft && consumeSessionInterrupted()) {
      resumeDraft();
    }
  }, [hydrated, hasStoredDraft, resumeDraft]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touchedSteps, setTouchedSteps] = useState<Set<DelegationWizardStepId>>(
    new Set()
  );

  /**
   * Step heading ref — moves focus to the <h2> heading when advancing between
   * steps so screen readers announce the new step title and context in logical
   * reading order without the user having to re-navigate from the top.
   */
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const steps = DELEGATION_WIZARD_STEPS.map((id) => ({
    id,
    label: tSteps(STEP_LABEL_KEYS[id]),
  }));

  const errors = validateStep(stepId, draft);
  const isLastStep = stepIndex === DELEGATION_WIZARD_STEPS.length - 1;
  const isFirstStep = stepIndex === 0;

  // Move focus to the step heading whenever the active step changes. This gives
  // AT users a natural "you are now on step N" entry point for the new content.
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [stepId]);

  const handleNext = () => {
    setTouchedSteps((prev) => new Set(prev).add(stepId));
    if (Object.keys(errors).length > 0) {
      announce(t("errors.missingFields"), "assertive");
      return;
    }
    if (isLastStep) {
      handleSubmit();
      return;
    }
    const nextIndex = stepIndex + 1;
    goToStep(nextIndex);
    announce(
      `Step ${nextIndex + 1} of ${DELEGATION_WIZARD_STEPS.length}: ${tSteps(STEP_LABEL_KEYS[DELEGATION_WIZARD_STEPS[nextIndex]!])}`,
      "polite"
    );
  };

  const handleBack = () => {
    if (!isFirstStep) {
      const prevIndex = stepIndex - 1;
      goToStep(prevIndex);
      announce(
        `Step ${prevIndex + 1} of ${DELEGATION_WIZARD_STEPS.length}: ${tSteps(STEP_LABEL_KEYS[DELEGATION_WIZARD_STEPS[prevIndex]!])}`,
        "polite"
      );
    }
  };

  const handleCancel = () => {
    if (isDraftDirty(draft, defaultWalletId)) {
      if (!window.confirm(tSteps("cancelConfirm"))) return;
    }
    discardDraft();
    onCancel?.();
  };

  const handleSubmit = guard(async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(draftToCreateInput(draft));
      clearDraft();
      discardDraft();
      announce("Delegation created.", "polite");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errors.createFailed");
      setFormError(msg);
      announce(msg, "assertive");
    } finally {
      setSubmitting(false);
    }
  });

  const showError = (field: string) =>
    touchedSteps.has(stepId)
      ? Boolean((errors as Record<string, string | undefined>)[field])
      : false;

  const currentStepLabel = tSteps(STEP_LABEL_KEYS[stepId]);

  return (
    <Card title={t("title")} ariaLabel={t("ariaLabel")}>
      {hasStoredDraft && (
        <div
          className="settings-status"
          role="status"
          style={{ marginBottom: "1rem" }}
        >
          <span>{tSteps("resumeDraft")}</span>{" "}
          <Button variant="ghost" onClick={resumeDraft}>
            {tSteps("resumeDraftAction")}
          </Button>{" "}
          <Button variant="ghost" onClick={discardDraft}>
            {tSteps("discardDraft")}
          </Button>
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <Stepper
          steps={steps}
          currentIndex={stepIndex}
          onStepSelect={goToStep}
        />
        {/*
          Visually hidden progress text is surfaced to AT via the step heading
          below; this visible paragraph gives sighted users a compact counter.
        */}
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
            marginTop: "0.5rem",
          }}
          aria-hidden="true"
        >
          {tSteps("stepOf", {
            current: stepIndex + 1,
            total: DELEGATION_WIZARD_STEPS.length,
          })}
        </p>
      </div>

      {/*
        Step heading: receives focus on step transitions so AT reads out the
        new step in logical order. tabIndex={-1} allows programmatic focus
        without placing it in the Tab sequence.
      */}
      <h2
        ref={stepHeadingRef}
        tabIndex={-1}
        style={{
          fontSize: "1rem",
          fontWeight: 600,
          margin: "0 0 1rem",
          outline: "none",
        }}
      >
        <span className="sr-only">
          {tSteps("stepOf", {
            current: stepIndex + 1,
            total: DELEGATION_WIZARD_STEPS.length,
          })}
          :{" "}
        </span>
        {currentStepLabel}
      </h2>

      {stepId === "agent" && (
        <WizardStepAgent
          agentId={draft.agentId}
          onAgentIdChange={(agentId) => updateDraft({ ...draft, agentId })}
          error={showError("agentId") ? t("errors.missingFields") : undefined}
        />
      )}

      {stepId === "scope" && (
        <WizardStepScope
          walletId={draft.walletId}
          onWalletIdChange={(walletId) => updateDraft({ ...draft, walletId })}
          label={draft.label}
          onLabelChange={(label) => updateDraft({ ...draft, label })}
          permissionLevel={draft.permissionLevel}
          onPermissionLevelChange={(
            permissionLevel: DelegationPermissionLevel
          ) => updateDraft({ ...draft, permissionLevel })}
          allowedCategories={draft.allowedCategories}
          onAllowedCategoriesChange={(allowedCategories) =>
            updateDraft({ ...draft, allowedCategories })
          }
          allowedMerchants={draft.allowedMerchants}
          onAllowedMerchantsChange={(allowedMerchants) =>
            updateDraft({ ...draft, allowedMerchants })
          }
          unrestrictedMerchants={draft.unrestrictedMerchants}
          onUnrestrictedMerchantsChange={(unrestrictedMerchants) =>
            updateDraft({ ...draft, unrestrictedMerchants })
          }
          errors={touchedSteps.has("scope") ? errors : {}}
        />
      )}

      {stepId === "limits" && (
        <WizardStepLimits
          maxPerTransaction={draft.maxPerTransaction}
          onMaxPerTransactionChange={(maxPerTransaction) =>
            updateDraft({ ...draft, maxPerTransaction })
          }
          maxTotal={draft.maxTotal}
          onMaxTotalChange={(maxTotal) => updateDraft({ ...draft, maxTotal })}
          expiresAt={draft.expiresAt}
          onExpiresAtChange={(expiresAt) =>
            updateDraft({ ...draft, expiresAt })
          }
          maxTotalError={showError("maxTotal") ? errors.maxTotal : undefined}
        />
      )}

      {stepId === "review" && <WizardStepReview draft={draft} />}

      {formError && (
        <div className="settings-status error" role="alert">
          {formError}
        </div>
      )}

      <div className="form-actions">
        {!isFirstStep && (
          <Button
            variant="ghost"
            type="button"
            onClick={handleBack}
            disabled={submitting}
          >
            {tSteps("back")}
          </Button>
        )}
        <Button
          variant="primary"
          type="button"
          onClick={handleNext}
          disabled={submitting || (isLastStep && isDemoMode)}
          title={
            isLastStep && isDemoMode ? DEMO_MODE_BLOCKED_MESSAGE : undefined
          }
        >
          {isLastStep
            ? submitting
              ? t("submitting")
              : t("submit")
            : tSteps("next")}
        </Button>
        {onCancel && (
          <Button
            variant="ghost"
            type="button"
            onClick={handleCancel}
            disabled={submitting}
          >
            {tCommon("cancel")}
          </Button>
        )}
      </div>
    </Card>
  );
}

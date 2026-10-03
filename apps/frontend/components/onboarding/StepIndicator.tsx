"use client";

export interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div
      className="step-indicator"
      role="progressbar"
      // A progressbar has to name itself — axe's aria-progressbar-name rule
      // failed /onboarding because the dots carried the only labels and they
      // were on role-less divs, which cannot take one at all.
      aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
    >
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`step-indicator-dot ${
            i === currentStep
              ? "step-indicator-dot--active"
              : i < currentStep
                ? "step-indicator-dot--completed"
                : ""
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

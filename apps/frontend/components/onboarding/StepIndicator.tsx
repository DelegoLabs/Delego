"use client";

export interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="step-indicator" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={totalSteps}>
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
          aria-label={`Step ${i + 1}${i === currentStep ? " (current)" : i < currentStep ? " (completed)" : ""}`}
        />
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, Button } from "@delego/ui";

export interface OnboardingStepProps {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  children: React.ReactNode;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  isLast?: boolean;
}

export function OnboardingStep({
  stepIndex,
  totalSteps,
  title,
  description,
  children,
  onNext,
  onBack,
  onSkip,
  isLast = false,
}: OnboardingStepProps) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-step-header">
        <span className="onboarding-step-counter">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <h2 className="onboarding-step-title">{title}</h2>
        <p className="onboarding-step-description">{description}</p>
      </div>

      <Card title={title} ariaLabel={`Onboarding step: ${title}`}>
        <div className="onboarding-step-content">{children}</div>
      </Card>

      <div className="onboarding-step-actions">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
        )}
        {!isLast && onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
        )}
        <Button variant="primary" onClick={onNext}>
          {isLast ? "Get Started" : "Next"}
        </Button>
      </div>
    </div>
  );
}

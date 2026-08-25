"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@delego/ui";
import { OnboardingStep } from "../../components/onboarding/OnboardingStep";
import { StepIndicator } from "../../components/onboarding/StepIndicator";

const STEPS = [
  {
    title: "Welcome to Delego",
    description: "Delegate shopping to AI agents with full spending controls.",
  },
  {
    title: "Connect Your Wallet",
    description: "Link your Stellar wallet to start delegating purchases.",
  },
  {
    title: "Set Spending Limits",
    description: "Configure daily and per-transaction spending limits for your agents.",
  },
  {
    title: "You're All Set",
    description: "Start delegating orders to your AI agents.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      localStorage.setItem("delego_onboarding_complete", "true");
      router.push("/");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem("delego_onboarding_complete", "true");
    router.push("/");
  };

  return (
    <div className="onboarding-page">
      <StepIndicator currentStep={currentStep} totalSteps={STEPS.length} />

      <OnboardingStep
        stepIndex={currentStep}
        totalSteps={STEPS.length}
        title={STEPS[currentStep].title}
        description={STEPS[currentStep].description}
        onNext={handleNext}
        onBack={currentStep > 0 ? handleBack : undefined}
        onSkip={currentStep < STEPS.length - 1 ? handleSkip : undefined}
        isLast={currentStep === STEPS.length - 1}
      >
        {currentStep === 0 && (
          <div className="onboarding-welcome">
            <p>
              Delego lets you delegate shopping tasks to AI agents while keeping
              full control over spending. Set limits, approve transactions, and
              track orders — all from one dashboard.
            </p>
          </div>
        )}
        {currentStep === 1 && (
          <div className="onboarding-wallet">
            <p>
              Connect your Stellar wallet to authorize spending and receive
              delegated purchases. Your keys never leave your wallet.
            </p>
            <Button variant="primary" onClick={() => {}}>
              Connect Wallet
            </Button>
          </div>
        )}
        {currentStep === 2 && (
          <div className="onboarding-limits">
            <p>
              Set daily spending limits and per-transaction caps to ensure your
              agents stay within budget. You can adjust these anytime from
              Settings.
            </p>
          </div>
        )}
        {currentStep === 3 && (
          <div className="onboarding-complete">
            <p>
              You&apos;re ready to start delegating. Create your first delegation
              and let your AI agent handle the rest.
            </p>
          </div>
        )}
      </OnboardingStep>
    </div>
  );
}

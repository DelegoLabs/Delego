"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StroopsInput } from "@delegolabs/ui";
import { OnboardingStep } from "../../components/onboarding/OnboardingStep";
import { StepIndicator } from "../../components/onboarding/StepIndicator";
import { WalletConnectButton } from "../../components/wallet/public";
import {
  DEFAULT_ONBOARDING_LIMITS,
  readOnboardingLimits,
  writeOnboardingLimits,
  type OnboardingSpendingLimits,
} from "../../lib/onboardingLimits";

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
  const [limits, setLimits] = useState<OnboardingSpendingLimits>({
    ...DEFAULT_ONBOARDING_LIMITS,
  });

  useEffect(() => {
    setLimits(readOnboardingLimits());
  }, []);

  const perTransactionLimit = BigInt(limits.maxPerTransactionStroops);
  const dailyLimit = BigInt(limits.dailyLimitStroops);
  const limitsValid = perTransactionLimit > 0n && dailyLimit >= perTransactionLimit;

  const completeOnboarding = () => {
    writeOnboardingLimits(limits);
    localStorage.setItem("delego_onboarding_complete", "true");
    router.push("/");
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    completeOnboarding();
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
        nextDisabled={currentStep === 2 && !limitsValid}
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
            <WalletConnectButton />
          </div>
        )}
        {currentStep === 2 && (
          <div className="onboarding-limits">
            <p>
              Set daily spending limits and per-transaction caps to ensure your
              agents stay within budget. You can adjust these anytime from
              Settings.
            </p>
            <div className="onboarding-limit-field">
              <label htmlFor="onboarding-per-transaction-limit">
                Per-transaction limit
              </label>
              <p
                id="onboarding-per-transaction-limit-hint"
                className="onboarding-limit-hint"
              >
                Maximum an agent may spend on a single purchase.
              </p>
              <StroopsInput
                id="onboarding-per-transaction-limit"
                aria-label="Per-transaction limit"
                aria-describedby="onboarding-per-transaction-limit-hint"
                value={perTransactionLimit}
                onChange={(value) =>
                  setLimits((prev) => ({
                    ...prev,
                    maxPerTransactionStroops: value.toString(),
                  }))
                }
                style={{ width: "100%" }}
              />
            </div>
            <div className="onboarding-limit-field">
              <label htmlFor="onboarding-daily-limit">Daily spending limit</label>
              <p id="onboarding-daily-limit-hint" className="onboarding-limit-hint">
                Total your agents may spend in a 24-hour window.
              </p>
              <StroopsInput
                id="onboarding-daily-limit"
                aria-label="Daily spending limit"
                aria-describedby="onboarding-daily-limit-hint"
                value={dailyLimit}
                onChange={(value) =>
                  setLimits((prev) => ({
                    ...prev,
                    dailyLimitStroops: value.toString(),
                  }))
                }
                style={{ width: "100%" }}
              />
            </div>
            {!limitsValid && (
              <p className="onboarding-limit-error" role="alert">
                The daily limit must be at least as large as the per-transaction
                limit.
              </p>
            )}
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

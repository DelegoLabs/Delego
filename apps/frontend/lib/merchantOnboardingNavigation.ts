import { z } from "zod";
import type { MerchantOnboardingData } from "./merchantRegistration";

export interface WizardNavigationState {
  activeStep: number;
  completedSteps: number[];
  canProceed: boolean;
  stepData: Record<string, unknown>;
}

export const MERCHANT_ONBOARDING_STEP_COUNT = 5;

const STORAGE_KEY = "delego_merchant_onboarding_navigation";

const onboardingFormDataSchema = z.object({
  storeName: z.string(),
  storeSlug: z.string(),
  description: z.string(),
  contactEmail: z.string(),
  payoutAddress: z.string(),
  domainName: z.string(),
  isDomainVerified: z.boolean(),
  acceptedCurrencies: z.array(z.string()),
});

export const wizardNavigationStateSchema = z.object({
  activeStep: z.number().int().min(0).max(MERCHANT_ONBOARDING_STEP_COUNT - 1),
  completedSteps: z.array(z.number().int().min(0).max(MERCHANT_ONBOARDING_STEP_COUNT - 1)),
  canProceed: z.boolean(),
  stepData: z.record(z.unknown()),
});

export function createWizardNavigationState(): WizardNavigationState {
  return { activeStep: 0, completedSteps: [], canProceed: false, stepData: {} };
}

export function canNavigateToStep(targetStep: number, completedSteps: number[]): boolean {
  if (
    !Number.isInteger(targetStep) ||
    targetStep < 0 ||
    targetStep >= MERCHANT_ONBOARDING_STEP_COUNT
  ) {
    return false;
  }
  for (let step = 0; step < targetStep; step += 1) {
    if (!completedSteps.includes(step)) return false;
  }
  return true;
}

export function normalizeWizardNavigationState(
  state: WizardNavigationState
): WizardNavigationState {
  const completedSteps = [...new Set(state.completedSteps)]
    .filter((step) => step >= 0 && step < MERCHANT_ONBOARDING_STEP_COUNT)
    .sort((a, b) => a - b);
  const activeStep = canNavigateToStep(state.activeStep, completedSteps)
    ? state.activeStep
    : 0;
  return {
    ...state,
    activeStep,
    completedSteps,
    canProceed: completedSteps.includes(activeStep),
  };
}

export function loadWizardNavigationState(): WizardNavigationState | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = wizardNavigationStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? normalizeWizardNavigationState(parsed.data) : null;
  } catch {
    return null;
  }
}

export function saveWizardNavigationState(state: WizardNavigationState): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

export function clearWizardNavigationState(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function getNavigationFormData(
  state: WizardNavigationState
): MerchantOnboardingData | null {
  const parsed = onboardingFormDataSchema.safeParse(state.stepData.formData);
  return parsed.success ? parsed.data : null;
}

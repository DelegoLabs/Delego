import type { Escrow } from "@delegolabs/types";

/**
 * Pure helpers for the escrow deadline extension flow (#577): preset
 * durations, contract-bound validation, and deadline math. Kept
 * side-effect free so the bound checks can be unit tested without a
 * network round trip — see `components/escrows/ExtensionModal.tsx` for the
 * stateful wiring around these.
 */

export type ExtensionPreset = "+1d" | "+1w" | "+1m";

export const EXTENSION_PRESETS: readonly ExtensionPreset[] = ["+1d", "+1w", "+1m"];

const PRESET_SECONDS: Record<ExtensionPreset, number> = {
  "+1d": 24 * 3600,
  "+1w": 7 * 24 * 3600,
  "+1m": 30 * 24 * 3600, // calendar month approximated as 30 days for bound-checking
};

export function presetSeconds(preset: ExtensionPreset): number {
  return PRESET_SECONDS[preset];
}

export function presetLabel(preset: ExtensionPreset): string {
  switch (preset) {
    case "+1d":
      return "+1 day";
    case "+1w":
      return "+1 week";
    case "+1m":
      return "+1 month";
  }
}

export interface ExtensionEligibility {
  eligible: boolean;
  /** Inline reason to show next to an excluded preset, e.g. "Exceeds contract-allowed bound". */
  reason?: string;
}

/**
 * Whether requesting `preset` against `escrow` is allowed under the
 * contract's bounds:
 *  - `extensionsConsumed` must be below `maxExtensions` (when set).
 *  - the resulting deadline must not exceed
 *    `originalDeadline + maxExtensionSeconds` (when both are set).
 *
 * When the escrow doesn't carry deadline/bound metadata at all, requests
 * are allowed — there's nothing to validate against, and the server is the
 * final authority regardless.
 */
export function isExtensionAllowed(
  escrow: Escrow,
  preset: ExtensionPreset
): ExtensionEligibility {
  const consumed = escrow.extensionsConsumed ?? 0;
  const max = escrow.maxExtensions;
  if (max !== undefined && consumed >= max) {
    return {
      eligible: false,
      reason: `Maximum of ${max} extension${max === 1 ? "" : "s"} already used`,
    };
  }

  const original = escrow.originalDeadline
    ? new Date(escrow.originalDeadline).getTime()
    : undefined;
  const currentDeadlineMs = escrow.deadline
    ? new Date(escrow.deadline).getTime()
    : original;

  if (original === undefined || currentDeadlineMs === undefined) {
    return { eligible: true };
  }

  if (escrow.maxExtensionSeconds !== undefined) {
    const proposedDeadlineMs = currentDeadlineMs + presetSeconds(preset) * 1000;
    const maxAllowedDeadlineMs = original + escrow.maxExtensionSeconds * 1000;
    if (proposedDeadlineMs > maxAllowedDeadlineMs) {
      return {
        eligible: false,
        reason: "Exceeds the contract-allowed extension bound",
      };
    }
  }

  return { eligible: true };
}

/** The deadline `escrow` would have if `preset` were granted. */
export function computeExtendedDeadline(escrow: Escrow, preset: ExtensionPreset): Date {
  const base = escrow.deadline ?? escrow.originalDeadline;
  const baseMs = base ? new Date(base).getTime() : Date.now();
  return new Date(baseMs + presetSeconds(preset) * 1000);
}

export interface PresetOption extends ExtensionEligibility {
  preset: ExtensionPreset;
  label: string;
}

/** Every preset, each tagged with whether it's currently allowed for `escrow` and why not when excluded. */
export function availablePresets(escrow: Escrow): PresetOption[] {
  return EXTENSION_PRESETS.map((preset) => ({
    preset,
    label: presetLabel(preset),
    ...isExtensionAllowed(escrow, preset),
  }));
}

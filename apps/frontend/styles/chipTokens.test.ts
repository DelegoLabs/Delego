import { describe, it, expect } from "vitest";
import { CHIP_TONE_PAIRS } from "./chipTokens";
import { contrastRatio } from "./contrast";

const WCAG_AA_SMALL_TEXT_MIN_RATIO = 4.5;

describe("chip tone pairs — accessibility contrast", () => {
  for (const [tone, { bg, fg }] of Object.entries(CHIP_TONE_PAIRS)) {
    it(`${tone} meets WCAG AA (>= 4.5:1) — dark mode uses the same pair reversed, so this covers both themes`, () => {
      expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(WCAG_AA_SMALL_TEXT_MIN_RATIO);
    });
  }
});

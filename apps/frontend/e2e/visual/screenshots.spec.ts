import { test, expect } from "../support/test";
import { dynamicRegionMasks, freezeMotion, setTheme } from "../support/visual";

/**
 * FE-046: visual regression screenshots for key pages/states.
 *
 * Runs under the `visual` (desktop) and `visual-mobile` (Pixel 7) Playwright
 * projects (see playwright.config.ts) — each spec here therefore covers both
 * viewports without duplicating test bodies. Dark/light is parameterized
 * in-file since Playwright projects fan out per-file, not per-theme.
 *
 * Update baselines with `pnpm visual:update` after an intentional UI change.
 */

const THEMES = ["light", "dark"] as const;

for (const theme of THEMES) {
  test.describe(`theme: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await freezeMotion(page);
      await setTheme(page, theme);
    });

    test.describe("populated", () => {
      test(`tracking dashboard (${theme})`, async ({ page }) => {
        await page.goto("/tracking");
        await expect(page).toHaveScreenshot(`tracking-populated-${theme}.png`, {
          mask: dynamicRegionMasks(page),
          fullPage: true,
        });
      });

      test(`delegations list (${theme})`, async ({ page }) => {
        await page.goto("/delegations");
        await expect(page).toHaveScreenshot(`delegations-populated-${theme}.png`, {
          mask: dynamicRegionMasks(page),
          fullPage: true,
        });
      });

      test(`orders list (${theme})`, async ({ page }) => {
        await page.goto("/orders");
        await expect(page).toHaveScreenshot(`orders-populated-${theme}.png`, {
          mask: dynamicRegionMasks(page),
          fullPage: true,
        });
      });

      test(`settings (${theme})`, async ({ page }) => {
        await page.goto("/settings");
        await expect(page).toHaveScreenshot(`settings-populated-${theme}.png`, {
          mask: dynamicRegionMasks(page),
          fullPage: true,
        });
      });
    });

    test.describe("empty state (FE-035)", () => {
      test.use({ mockApiOptions: { delegations: [], orders: [], escrows: [] } });

      test(`delegations list (${theme})`, async ({ page }) => {
        await page.goto("/delegations");
        await expect(page).toHaveScreenshot(`delegations-empty-${theme}.png`, {
          fullPage: true,
        });
      });

      test(`orders list (${theme})`, async ({ page }) => {
        await page.goto("/orders");
        await expect(page).toHaveScreenshot(`orders-empty-${theme}.png`, {
          fullPage: true,
        });
      });

      test(`escrows (${theme})`, async ({ page }) => {
        await page.goto("/escrows");
        await expect(page).toHaveScreenshot(`escrows-empty-${theme}.png`, {
          fullPage: true,
        });
      });
    });
  });
}

import { test, expect } from "../support/test";

/**
 * Chaos test for the flake-quarantine pipeline (#630).
 *
 * This test fails on its first attempt and passes on the retry, which is
 * exactly the "pass-on-retry" signal the nightly job treats as a flake. It
 * exists so the *whole* pipeline can be exercised end to end — detect →
 * quarantine → label → issue → 14-day expiry re-enable — on demand, rather
 * than waiting for a real flake to show up.
 *
 * It is skipped unless `E2E_CHAOS=1` (which the nightly E2E job sets), so
 * ordinary local runs and the PR gate are unaffected.
 */
test.describe("chaos: injected flake", () => {
  test("passes only on retry so the pipeline observes a flake", async ({ page }) => {
    test.skip(
      process.env.E2E_CHAOS !== "1",
      "Injected flake only runs when E2E_CHAOS=1 (nightly full-suite run)."
    );

    if (test.info().retry === 0) {
      throw new Error(
        "Injected flake (#630): intentional first-attempt failure. Retrying exercises the quarantine pipeline."
      );
    }

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});

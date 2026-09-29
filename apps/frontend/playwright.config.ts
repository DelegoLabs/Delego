import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Port the E2E gateway stand-in (e2e/support/mock-gateway.mjs) listens on. */
const MOCK_GATEWAY_PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 3456);

/**
 * `grepInvert` pattern naming every quarantined test (#630).
 *
 * Quarantined tests must not block the PR gate, but they do have to keep
 * running somewhere or nobody will ever fix them — the nightly full-suite run
 * sets `PLAYWRIGHT_INCLUDE_QUARANTINE=1` to re-include them. A missing or
 * unreadable registry degrades to `undefined` (nothing excluded) rather than
 * taking the whole suite down.
 */
function quarantineGrepInvert(): RegExp | undefined {
  if (process.env.PLAYWRIGHT_INCLUDE_QUARANTINE === "1") return undefined;

  try {
    const raw = readFileSync(path.resolve(__dirname, "quarantine.json"), "utf8");
    const titles: string[] = (JSON.parse(raw).quarantined ?? [])
      .map((entry: { title?: string }) => entry.title)
      .filter((title: unknown): title is string => typeof title === "string" && title.length > 0);

    if (titles.length === 0) return undefined;

    return new RegExp(
      titles.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    );
  } catch {
    return undefined;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Quarantined flakes stay out of the PR gate (#630).
  grepInvert: quarantineGrepInvert(),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
  },
  /**
   * FE-046: `toHaveScreenshot` pixel-diff tolerance and deterministic
   * rendering (fonts/animations frozen via e2e/support/visual.ts's
   * `freezeMotion`, applied per-test rather than globally so only the
   * `visual` project pays the extra init-script cost).
   */
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  projects: [
    { name: "chromium", testIgnore: /visual\//, use: { ...devices["Desktop Chrome"] } },
    {
      // Mobile viewport for the nightly desktop/mobile × theme matrix (#630).
      name: "mobile-chrome",
      testIgnore: /visual\//,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "visual",
      testDir: "./e2e/visual",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "visual-mobile",
      testDir: "./e2e/visual",
      use: { ...devices["Pixel 7"] },
    },
  ],
  /**
   * Two servers (#804). Playwright only intercepts browser traffic, so the
   * gateway calls made from Node during SSR (the merchant storefront in
   * app/store/[merchantId]/page.tsx) need a real origin to talk to — the
   * mock gateway. Everything the browser itself fetches is still stubbed by
   * e2e/support/mockApi.ts. Both servers are skipped when the suite runs
   * against an already-deployed PLAYWRIGHT_BASE_URL.
   */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: "node e2e/support/mock-gateway.mjs",
          port: MOCK_GATEWAY_PORT,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: "pnpm start",
          port: 3001,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});

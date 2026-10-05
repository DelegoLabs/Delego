import { test as base } from "@playwright/test";
import { mockApi, seedAuthCookie, seedTourSeen, type MockApiOptions } from "./mockApi";
import { stubFreighter } from "./freighter";
import { setTheme } from "./visual";

interface Fixtures {
  /** Override to control what the mocked gateway returns (e.g. `{ delegations: [] }` for an empty state). */
  mockApiOptions: MockApiOptions;
  /** Applies the API mocks/Freighter stub/auth cookie before navigation. Auto-runs; override `mockApiOptions` instead of this. */
  mockedPage: void;
}

/**
 * Shared Playwright test base for FE-044 (golden-path E-2E and FE-046
 * (visual regression) specs: mocks the gateway API, seeds the auth cookie for
 * protected routes, injects the synthetic `window.freighter` wallet, and marks
 * the first-run product tour as already seen.
 *
 * Usage: `test.use({ mockApiOptions: { delegations: [] } })` in a describe
 * block to exercise an empty state instead of the populated default.
 */
export const test = base.extend<Fixtures>({
  mockApiOptions: [{}, { option: true }],

  mockedPage: [
    async ({ page, baseURL, mockApiOptions }, use) => {
      await mockApi(page, mockApiOptions);
      await stubFreighter(page);
      await seedAuthCookie(page, baseURL || "http://localhost:3001");
      // The tour auto-starts for any profile that has never completed or
      // dismissed it, and its modal backdrop swallows every click underneath —
      // which is what blocked the wallet picker in the connect-wallet specs.
      await seedTourSeen(page);

      // The nightly run fans out per theme (#630); an unset E2E_THEME leaves
      // the app on its own default so local/PR runs are unchanged.
      const theme = process.env.E2E_THEME;
      if (theme === "light" || theme === "dark") {
        await setTheme(page, theme);
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
export { mockApi, seedAuthCookie, seedTourSeen, stubFreighter };
export type { MockApiOptions };

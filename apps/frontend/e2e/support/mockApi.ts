import type { Page } from "@playwright/test";
import { jsonDelegation, jsonEscrow, jsonOrder, okBody } from "./fixtures";

const API_BASE = process.env.PLAYWRIGHT_API_URL || "https://api.example.com";
const AUTH_COOKIE = "delego_auth_token";

export interface MockApiOptions {
  delegations?: unknown[];
  orders?: unknown[];
  escrows?: unknown[];
}

/**
 * Route-intercepts the gateway API for a Playwright test (FE-044/FE-046),
 * aligned with the MSW fixtures in mocks/fixtures/*.ts. Defaults to one
 * populated item per resource; pass `[]` for a resource to exercise the
 * FE-035 empty state.
 */
export async function mockApi(page: Page, options: MockApiOptions = {}) {
  const delegations = options.delegations ?? [jsonDelegation(1)];
  const orders = options.orders ?? [jsonOrder(1)];
  const escrows = options.escrows ?? [jsonEscrow(1)];

  await page.route(`${API_BASE}/delegations`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: okBody(delegations) });
    }
    if (route.request().method() === "POST") {
      return route.fulfill({ json: okBody(jsonDelegation(99)), status: 201 });
    }
    return route.continue();
  });

  await page.route(`${API_BASE}/orders`, (route) => route.fulfill({ json: okBody(orders) }));

  await page.route(`${API_BASE}/orders/*/approve`, (route) =>
    route.fulfill({ json: okBody({ ...jsonOrder(1), status: "approved" }) })
  );

  await page.route(`${API_BASE}/escrows`, (route) => route.fulfill({ json: okBody(escrows) }));
}

/** Seeds the auth cookie so middleware.ts lets a protected route render. */
export async function seedAuthCookie(page: Page, baseURL: string) {
  await page.context().addCookies([
    {
      name: AUTH_COOKIE,
      value: "e2e-mock-token",
      url: baseURL,
    },
  ]);
}

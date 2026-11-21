import { test, expect } from "./support/test";

/**
 * #1096: no favicon request may 404 on any route.
 */
const ROUTES = ["/", "/onboarding", "/tracking", "/orders", "/settings"];

test("GET /favicon.ico is served as an icon", async ({ request }) => {
  const res = await request.get("/favicon.ico");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/icon/);
});

for (const route of ROUTES) {
  test(`${route} requests no missing favicon`, async ({ page }) => {
    const missing: string[] = [];
    page.on("response", (res) => {
      if (/favicon|\/icon\.svg/.test(res.url()) && res.status() >= 400) missing.push(res.url());
    });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon/);
    expect(missing).toEqual([]);
  });
}

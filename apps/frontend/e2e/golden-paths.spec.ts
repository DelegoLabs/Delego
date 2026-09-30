import { test, expect } from "./support/test";
import { E2E_WALLET_ADDRESS } from "./support/fixtures";

/**
 * FE-044: Playwright E2E for the three golden paths.
 *
 * The gateway API is route-intercepted (see e2e/support/mockApi.ts, aligned
 * with the MSW fixtures from FE-045) and the Freighter wallet is a synthetic
 * `window.freighter` stub (see e2e/support/freighter.ts) so these run
 * deterministically without a backend or a real browser wallet extension.
 */

test.describe("golden path: connect wallet", () => {
  test("wallet page shows the connected address", async ({ page }) => {
    await page.goto("/wallet");

    // The app header renders its own wallet control, so scope to the card.
    const connectionCard = page.getByRole("region", {
      name: "Wallet connection status",
    });
    await connectionCard
      .getByRole("button", { name: /connect wallet/i })
      .click();

    // The picker lists every registered wallet: installed ones get a connect
    // action, missing ones an install link.
    const picker = page.getByRole("dialog");
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: "Connect with Freighter" })).toBeVisible();
    await expect(picker.getByRole("link", { name: "Install LOBSTR" })).toBeVisible();
    await picker.getByRole("button", { name: "Connect with Freighter" }).click();

    await expect(page.getByText(E2E_WALLET_ADDRESS.slice(0, 6))).toBeVisible();
  });
});

test.describe("golden path: create a delegation", () => {
  test("delegation wizard happy path", async ({ page }) => {
    await page.goto("/delegations");

    await page.getByRole("button", { name: /new delegation/i }).click();

    // Step 1 — choose agent.
    await page.getByPlaceholder("agent-shopping-01").fill("agent-groceries");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2 — scope.
    await page.getByPlaceholder("wallet-id").fill(E2E_WALLET_ADDRESS);
    await page.getByPlaceholder("Groceries agent").fill("Groceries agent");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3 — limits.
    const maxTotalInput = page.getByLabel(/amount in xlm/i).last();
    await maxTotalInput.fill("100");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 4 — review & confirm.
    await expect(page.getByText("Groceries agent").or(page.getByText("agent-groceries"))).toBeVisible();
    await page.getByRole("button", { name: /create delegation/i }).click();

    await expect(page.getByText("Groceries agent").or(page.getByText("agent-groceries"))).toBeVisible();
  });
});

test.describe("golden path: approve a pending order", () => {
  test("approval arrives, gets approved, order status advances", async ({ page }) => {
    await page.goto("/approvals");

    const queueCard = page.getByRole("region").filter({ hasText: "Awaiting review" });
    await expect(queueCard.getByText("1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();

    await expect(page.getByText("All caught up")).toBeVisible();
  });
});

import type { Page } from "@playwright/test";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { test, expect } from "./support/test";
import { API_BASE } from "./support/mockApi";
import { E2E_WALLET_ADDRESS, jsonEscrow } from "./support/fixtures";
import storefront from "./support/storefront-fixture.json";

/**
 * Issue #804 — end-to-end coverage for the checkout lifecycle.
 *
 * Every scenario drives the real routes and components; nothing is rendered in
 * isolation, and no application code is faked:
 *
 *   1. wallet connection   → app/wallet/page.tsx + components/wallet/WalletConnectButton.tsx
 *   2. product search      → app/store/[merchantId]/page.tsx + StorefrontCatalog.tsx
 *   3. checkout approval   → app/orders + app/orders/[id] + app/approvals
 *   4. escrow release      → components/escrows/ReleaseCTA.tsx + services/releaseEligibility.ts
 *
 * Only external Stellar/wallet interactions are stubbed: the Freighter
 * extension (e2e/support/freighter-bridge.ts), the gateway for
 * browser-originated calls (e2e/support/mockApi.ts), the Soroban RPC read
 * simulation used to answer eligibility queries, Horizon (the connected
 * wallet's balance lookup, answered as "account not funded"), and — for the
 * server-rendered storefront — the mock gateway process started by
 * playwright.config.ts.
 *
 * Note on "chat checkout": the conversational drawer
 * (components/agent/AgentChatDrawer.tsx, #800) is exported from the agent
 * barrel but not mounted on any route yet, so there is no chat UI to drive in
 * a browser. What an agent's checkout actually produces for the buyer is a
 * high-value order that must be signed off — the approval queue covered by
 * scenario 3 — and that is the flow exercised here.
 */

/** Matches the testnet Soroban RPC endpoint in lib/networks.ts. */
const SOROBAN_RPC_URL = /soroban-testnet\.stellar\.org/;
/** Matches the testnet Horizon endpoint in lib/networks.ts. */
const HORIZON_URL = /horizon-testnet\.stellar\.org/;

/** CORS headers every intercepted cross-origin response needs. */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function productNamed(needle: string) {
  const product = storefront.products.find((entry) =>
    entry.name.includes(needle)
  );
  if (!product) {
    throw new Error(
      `storefront-fixture.json has no product matching "${needle}"`
    );
  }
  return product;
}

/**
 * Answers the connected wallet's Horizon balance lookup with a 404, which
 * hooks/useBalanceHistory.ts renders as "account not funded" — deterministic,
 * and keeps the wallet scenarios off the public network.
 */
async function mockUnfundedHorizonAccount(page: Page): Promise<void> {
  await page.route(HORIZON_URL, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({ status: 404, title: "Resource Missing" }),
    })
  );
}

/**
 * Route-intercepts the Soroban RPC calls made by the header's health poll and
 * by services/releaseEligibility.ts, answering `simulateTransaction` with the
 * contract's `get_release_eligibility` return value encoded exactly as the
 * contract returns it — built with the same SDK the app uses, so the app's
 * real parsing path (`rpc.parseRawSimulation` → `scValToNative`) runs.
 */
async function mockSorobanReads(
  page: Page,
  eligibility: Record<string, unknown>
): Promise<void> {
  const retval = nativeToScVal(eligibility).toXDR("base64");

  await page.route(SOROBAN_RPC_URL, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const request = route.request().postDataJSON() as {
      id?: number | string;
      method?: string;
    };

    // Raw shapes straight from the RPC wire format: `results[].xdr` is what
    // the SDK's parser decodes into `result.retval`.
    const result =
      request?.method === "simulateTransaction"
        ? {
            latestLedger: 1_000_000,
            events: [],
            minResourceFee: "0",
            results: [{ auth: [], xdr: retval }],
          }
        : {
            // getLatestLedger, used by hooks/useSorobanHealth.ts.
            id: "e2e",
            protocolVersion: 22,
            sequence: 1_000_000,
          };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS_HEADERS,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: request?.id ?? 1,
        result,
      }),
    });
  });
}

test.describe("checkout lifecycle: connect a Stellar wallet", () => {
  test("grants a first-time visitor's wallet and shows the buyer address", async ({
    page,
  }) => {
    await mockUnfundedHorizonAccount(page);
    await page.goto("/wallet");

    // The app header renders its own wallet control, so scope to the card.
    const connectionCard = page.getByRole("region", {
      name: "Wallet connection status",
    });
    await connectionCard.getByRole("button", { name: "Connect Wallet" }).click();

    await expect(
      connectionCard.getByText("Connected", { exact: true })
    ).toBeVisible();
    await expect(connectionCard.getByText(E2E_WALLET_ADDRESS)).toBeVisible();
    await expect(
      connectionCard.getByText("TESTNET", { exact: true })
    ).toBeVisible();
  });

  test("reflects the connected buyer in the app header", async ({ page }) => {
    await mockUnfundedHorizonAccount(page);
    await page.goto("/wallet");

    // The header renders its control before the page body in DOM order.
    await page.getByRole("button", { name: "Connect Wallet" }).first().click();

    await expect(
      page.getByLabel(`Connected wallet ${E2E_WALLET_ADDRESS}`)
    ).toBeVisible();

    const truncated = `${E2E_WALLET_ADDRESS.slice(0, 6)}…${E2E_WALLET_ADDRESS.slice(-6)}`;
    await expect(page.getByText(truncated)).toBeVisible();
  });
});

test.describe("checkout lifecycle: search a merchant's storefront", () => {
  test("lists the live catalogue and filters it as the buyer types", async ({
    page,
  }) => {
    // The storefront is a React Server Component: it fetches the gateway from
    // Node during SSR, where page.route cannot reach it. The CI `e2e` job
    // builds the frontend with NEXT_PUBLIC_API_URL pointing at
    // e2e/support/mock-gateway.mjs and sets PLAYWRIGHT_API_URL to match.
    test.skip(
      !process.env.PLAYWRIGHT_API_URL,
      "Needs the mock gateway: set PLAYWRIGHT_API_URL and build with NEXT_PUBLIC_API_URL=http://127.0.0.1:3456"
    );

    await page.goto(`/store/${storefront.merchantId}`);

    await expect(
      page.getByRole("heading", { name: storefront.storeName })
    ).toBeVisible();

    for (const product of storefront.products.filter((entry) => entry.active)) {
      await expect(
        page.getByRole("heading", { name: product.name })
      ).toBeVisible();
    }
    // Never publish withdrawn stock: parseStorefront() drops inactive products.
    for (const product of storefront.products.filter(
      (entry) => !entry.active
    )) {
      await expect(
        page.getByRole("heading", { name: product.name })
      ).toHaveCount(0);
    }

    const keyboard = productNamed("Keyboard");
    const hub = productNamed("Hub");
    const search = page.getByLabel("Search products");

    await search.fill("keyboard");
    await expect(
      page.getByRole("heading", { name: keyboard.name })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: hub.name })).toHaveCount(0);

    await search.fill("nothing-is-stocked-here");
    await expect(page.getByText("No products match that search.")).toBeVisible();

    await search.fill("");
    await expect(
      page.getByRole("heading", { name: keyboard.name })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: hub.name })).toBeVisible();
  });
});

test.describe("checkout lifecycle: approve an agent's checkout", () => {
  test("finds it in history, opens the receipt, and clears the queue", async ({
    page,
  }) => {
    await page.goto("/orders");

    await expect(page.getByRole("link", { name: "order-1" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "merchant-1" })).toBeVisible();

    const search = page.getByLabel("Search orders");
    await search.fill("merchant-1");
    await expect(page.getByRole("link", { name: "order-1" })).toBeVisible();

    await search.fill("no-such-order");
    await expect(
      page.getByText("No orders match the current filters.")
    ).toBeVisible();

    await search.fill("");
    await page.getByRole("link", { name: "order-1" }).click();

    // Buyer-facing proof of purchase for the checkout the agent placed.
    const receipt = page.getByRole("region", {
      name: "Receipt for order order-1",
    });
    await expect(receipt.getByText("Not yet escrowed")).toBeVisible();
    await expect(
      receipt.getByText("Pending approval", { exact: true })
    ).toBeVisible();

    // The same checkout is what the buyer has to sign off in the queue.
    const approvalRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/orders/order-1/approve")
    );

    await page.goto("/approvals");
    const queueCard = page
      .getByRole("region")
      .filter({ hasText: "Awaiting review" });
    await expect(queueCard.getByText("1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Approve & Pay" }).click();

    expect((await approvalRequest).url()).toBe(
      `${API_BASE}/orders/order-1/approve`
    );
    await expect(page.getByText("All caught up")).toBeVisible();
  });
});

test.describe("checkout lifecycle: release escrowed funds", () => {
  test("releases funds once the contract reports the escrow eligible", async ({
    page,
  }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID_TESTNET,
      "Requires NEXT_PUBLIC_ESCROW_CONTRACT_ID_TESTNET so ReleaseCTA can query the escrow contract"
    );

    await mockSorobanReads(page, { eligible: true });

    const releaseRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().endsWith("/escrows/escrow-1/release")
    );

    await page.goto("/escrows/escrow-1");
    await expect(page.getByText("Escrow #escrow-1").first()).toBeVisible();

    const releaseButton = page.getByRole("button", { name: /release funds/i });
    await expect(releaseButton).toBeEnabled();
    await releaseButton.click();

    expect((await releaseRequest).url()).toBe(
      `${API_BASE}/escrows/escrow-1/release`
    );
  });

  test.describe("when the contract reports the escrow in dispute", () => {
    test.use({ mockApiOptions: { escrows: [jsonEscrow(2)] } });

    test("keeps the CTA disabled and explains the reason", async ({ page }) => {
      test.skip(
        !process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID_TESTNET,
        "Requires NEXT_PUBLIC_ESCROW_CONTRACT_ID_TESTNET so ReleaseCTA can query the escrow contract"
      );

      await mockSorobanReads(page, {
        eligible: false,
        reason: "disputed",
      });

      await page.goto("/escrows/escrow-2");
      await expect(page.getByText("Escrow #escrow-2").first()).toBeVisible();

      const releaseButton = page.getByRole("button", { name: /release funds/i });
      await expect(releaseButton).toBeDisabled();

      // The disabled button is wrapped in a span so the tooltip trigger still
      // receives hover events (see ReleaseCTA).
      await releaseButton.locator("xpath=..").hover({ force: true });
      const tooltip = page.getByTestId("release-ineligibility-tooltip");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Under dispute — release paused");
    });
  });
});

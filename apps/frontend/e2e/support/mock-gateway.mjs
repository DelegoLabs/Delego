/**
 * Minimal stand-in for the Delego gateway, for E2E only (#804).
 *
 * `app/store/[merchantId]/page.tsx` is a React Server Component: it calls the
 * gateway from *Node* during SSR, where Playwright's `page.route` interception
 * cannot reach it. The CI `e2e` job therefore builds the frontend with
 * `NEXT_PUBLIC_API_URL` pointing at this server, and playwright.config.ts
 * starts it alongside `next start`.
 *
 * Everything the browser itself calls is still intercepted by
 * ./mockApi.ts — this server only needs the endpoints that are fetched
 * server-side. Unknown paths answer with a JSON `{ data, error }` envelope
 * (never an HTML or plain-text body) so `apiFetch`'s `res.json()` keeps working
 * for any call a test forgets to intercept.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.MOCK_GATEWAY_PORT ?? 3456);
const HOST = "127.0.0.1";

/** Shared with checkout-flows.spec.ts, which asserts on the same values. */
const storefront = JSON.parse(
  readFileSync(new URL("./storefront-fixture.json", import.meta.url), "utf8")
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function notFound(method, pathname) {
  return {
    data: null,
    error: {
      code: "not_found",
      message: `${method} ${pathname} is not served by the E2E mock gateway`,
    },
  };
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const storefrontMatch = /^\/merchants\/([^/]+)\/storefront$/.exec(
    url.pathname
  );

  if (req.method === "GET" && storefrontMatch) {
    const merchantId = decodeURIComponent(storefrontMatch[1]);
    if (merchantId !== storefront.merchantId) {
      sendJson(res, 404, notFound(req.method, url.pathname));
      return;
    }
    sendJson(res, 200, { data: storefront, error: null });
    return;
  }

  sendJson(res, 404, notFound(req.method, url.pathname));
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-gateway] listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

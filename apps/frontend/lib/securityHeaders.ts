/**
 * Security response headers, shared by `next.config.ts` and `middleware.ts`.
 *
 * `headers()` in next.config is applied by the routing layer *after*
 * middleware, so a response middleware returns early — every auth redirect —
 * never picks them up. That leaves the login redirect frameable, which is
 * exactly the page a clickjacking overlay wants. Middleware sets them too,
 * from this one list, so the two cannot drift.
 *
 * - `script-src` allows 'unsafe-inline' (Next.js bootstrap/inline scripts) and,
 *   in development only, 'unsafe-eval' which React Fast Refresh requires.
 * - `style-src` allows 'unsafe-inline' because the UI relies on inline style props.
 * - `connect-src` permits the API plus Stellar Horizon / Soroban RPC endpoints
 *   (testnet + mainnet) used by the multi-network wallet features.
 * - `img-src` allows Stellar-hosted images (see images.remotePatterns).
 * - `worker-src` allows the /sw.js service worker (PWA offline support).
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Set `CSP_REPORT_ONLY=true` to collect violations without blocking, so a new
 * directive can be audited in staging before it breaks anyone's checkout.
 */
const reportOnly = process.env.CSP_REPORT_ONLY === "true";

const connectSrc = [
  "'self'",
  process.env.NEXT_PUBLIC_API_URL || "",
  process.env.NEXT_PUBLIC_XLM_RATE_URL || "",
  "https://*.stellar.org",
  "https://*.sorobanrpc.com",
  process.env.NEXT_PUBLIC_SENTRY_DSN
    ? "https://*.ingest.sentry.io https://*.ingest.us.sentry.io"
    : "",
  isDev ? "ws:" : "",
]
  .filter(Boolean)
  .join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stellar.org",
  "font-src 'self' data:",
  "frame-src 'self' https://challenges.cloudflare.com",
  "worker-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

export const CSP_HEADER = cspDirectives.join("; ");

export const securityHeaders = [
  {
    key: reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: CSP_HEADER,
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Only enforced by browsers over HTTPS; harmless on http during local dev.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

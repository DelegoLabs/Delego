import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * - `script-src` allows 'unsafe-inline' (Next.js bootstrap/inline scripts) and,
 *   in development only, 'unsafe-eval' which React Fast Refresh requires.
 * - `style-src` allows 'unsafe-inline' because the UI relies on inline style props.
 * - `connect-src` permits the API plus Stellar Horizon / Soroban RPC endpoints
 *   (testnet + mainnet) used by the multi-network wallet features.
 * - `img-src` allows Stellar-hosted images (see images.remotePatterns).
 * - `worker-src` allows the /sw.js service worker (PWA offline support).
 */
const connectSrc = [
  "'self'",
  process.env.NEXT_PUBLIC_API_URL || "",
  process.env.NEXT_PUBLIC_XLM_RATE_URL || "",
  "https://*.stellar.org",
  "https://*.sorobanrpc.com",
  process.env.NEXT_PUBLIC_SENTRY_DSN ? "https://*.ingest.sentry.io https://*.ingest.us.sentry.io" : "",
  isDev ? "ws:" : "",
]
  .filter(Boolean)
  .join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stellar.org",
  "font-src 'self' data:",
  "worker-src 'self'",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; "),
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  // Only enforced by browsers over HTTPS; harmless on http during local dev.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@delegolabs/ui", "@delegolabs/sdk", "@delegolabs/types"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.stellar.org" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Source maps are uploaded during `next build` when `SENTRY_AUTH_TOKEN` is
 * set (CI only — see .github/workflows/ci.yml); local dev builds skip the
 * upload silently. Events are tagged with the release set via
 * NEXT_PUBLIC_SENTRY_RELEASE (the git SHA, injected by CI).
 */
export default withSentryConfig(withNextIntl(withAnalyzer(nextConfig)), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});

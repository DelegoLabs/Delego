import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

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
 */
const connectSrc = [
  "'self'",
  process.env.NEXT_PUBLIC_API_URL || "",
  "https://*.stellar.org",
  "https://*.sorobanrpc.com",
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
  transpilePackages: ["@delego/ui", "@delego/sdk", "@delego/types", "@delego/utils"],
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.stellar.org" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
      ".jsx": [".jsx", ".tsx"],
    };

    return config;
  },
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withAnalyzer(nextConfig);

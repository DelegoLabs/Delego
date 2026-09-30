#!/usr/bin/env node
/**
 * Client source-map leakage guard (#751).
 *
 * The Sentry Next.js plugin needs client source maps to symbolicate stack
 * traces, so `next build` emits them as `hidden-source-map` (a `source-map`
 * without the `sourceMappingURL` comment) and uploads them to Sentry. Unless
 * `sourcemaps.deleteSourcemapsAfterUpload` is enabled, those `.map` files stay
 * in `.next/static` and remain publicly servable at their hashed URLs.
 *
 * This script fails if any `.map` file survives under `.next/static`. Server
 * source maps under `.next/server` are intentionally kept — deleting them
 * breaks Vercel builds (getsentry/sentry-javascript#13099) and they are not
 * served as static assets.
 *
 * Run via `pnpm --filter @delegolabs/web check:no-sourcemaps` after a build.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "..");
const staticDir = path.join(frontendDir, ".next", "static");

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".map")) {
      yield full;
    }
  }
}

let leaked;
try {
  leaked = [...walk(staticDir)];
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.warn(
      "[sourcemaps] No client build output at apps/frontend/.next/static — run 'pnpm build' first. Skipping check."
    );
    process.exit(0);
  }
  throw error;
}

if (leaked.length > 0) {
  console.error(
    "Client source maps are publicly servable under .next/static — they must be uploaded to Sentry and deleted:\n"
  );
  for (const file of leaked) {
    console.error(`  ${path.relative(frontendDir, file)}`);
  }
  console.error(
    `
Fix it by enabling 'sourcemaps: { deleteSourcemapsAfterUpload: true }' in withSentryConfig() in
apps/frontend/next.config.ts and re-running 'pnpm build'.`
  );
  process.exit(1);
}

console.log("[sourcemaps] No client source maps under .next/static.");
process.exit(0);

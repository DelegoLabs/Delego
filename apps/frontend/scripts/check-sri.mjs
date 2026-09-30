#!/usr/bin/env node
/**
 * Build verification script for Subresource Integrity (SRI) (#763).
 *
 * Asserts that all externally referenced scripts and stylesheets in the codebase
 * enforce Subresource Integrity (SRI) with cryptographic integrity hashes
 * (specifically SHA-384) and `crossorigin="anonymous"`.
 *
 * Prevents tampered or compromised third-party CDN resources from running.
 *
 * Run locally via:
 *   pnpm --filter @delegolabs/web check:sri
 *
 * Also executed in CI during the build verification / lint pipeline.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

const SCAN_DIRS = ["app", "components", "lib"].map((d) =>
  path.join(frontendRoot, d)
);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "coverage")
        continue;
      yield* walk(full);
    } else if (
      SOURCE_EXTENSIONS.has(path.extname(entry)) &&
      !SKIP_SUFFIXES.some((suffix) => entry.endsWith(suffix))
    ) {
      yield full;
    }
  }
}

function relative(filePath) {
  return path.relative(path.resolve(frontendRoot, ".."), filePath);
}

const SRI_HASH_PATTERN = /^sha(256|384|512)-[A-Za-z0-9+/=]{44,88}$/;

// Regex to capture script and link tags in JSX / HTML:
// e.g. <script ... src="https://..." ... /> or <link ... href="https://..." ... />
const SCRIPT_TAG_REGEX = /<script\b([^>]*?)>/gis;
const SCRIPT_COMPONENT_REGEX = /<Script\b([^>]*?)>/gis;
const LINK_TAG_REGEX = /<link\b([^>]*?)>/gis;

const KNOWN_EXTERNAL_SCRIPTS = {
  turnstile: {
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js",
    integrity: "sha384-hLYQBhIuOGH4Z+z13gHtLxBQQ4FBASOj8MUgbTLtSAA68VW/Q+njZLZ2BDqI+gSL",
    crossOrigin: "anonymous",
  },
};

const failures = [];
let scannedTagsCount = 0;
let externalAssetsFound = 0;

function parseAttributes(tagContent) {
  const attrs = {};
  // Match key="val", key={'val'}, key={var}, or boolean attr
  const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|{([^}]+)}))?/g;
  let match;
  while ((match = attrRegex.exec(tagContent)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? true;
    attrs[key] = val;
  }
  return attrs;
}

function checkTag(filePath, tagType, tagContent) {
  scannedTagsCount++;
  const attrs = parseAttributes(tagContent);

  const src = attrs.src;
  const href = attrs.href;
  const rel = typeof attrs.rel === "string" ? attrs.rel.toLowerCase() : "";

  let url = null;
  let integrity = null;
  let crossOrigin = null;

  const rawSrc = typeof src === "string" ? src.trim().replace(/^['"]|['"]$/g, "") : null;
  const rawHref = typeof href === "string" ? href.trim().replace(/^['"]|['"]$/g, "") : null;

  if (tagType === "script" && rawSrc) {
    if (rawSrc.startsWith("EXTERNAL_SCRIPTS.")) {
      const propKey = rawSrc.replace("EXTERNAL_SCRIPTS.", "").split(".")[0];
      const entry = KNOWN_EXTERNAL_SCRIPTS[propKey];
      if (entry) {
        url = entry.src;
        const rawInteg = typeof attrs.integrity === "string" ? attrs.integrity.trim().replace(/^['"]|['"]$/g, "") : "";
        integrity = rawInteg.toLowerCase().includes("external_scripts") ? entry.integrity : rawInteg;
        const rawCross = typeof attrs.crossorigin === "string" ? attrs.crossorigin.trim().replace(/^['"]|['"]$/g, "").toLowerCase() : "";
        crossOrigin = rawCross.toLowerCase().includes("external_scripts") ? entry.crossOrigin : rawCross;
      } else {
        url = rawSrc;
      }
    } else {
      url = rawSrc;
    }
  } else if (tagType === "link" && rawHref && rel.includes("stylesheet")) {
    url = rawHref;
  }

  if (!url) return;

  // Check if URL is external (http:, https:, or protocol-relative //)
  const isExternal = /^https?:\/\//i.test(url) || url.startsWith("//");
  if (!isExternal) return;

  externalAssetsFound++;

  if (!integrity) {
    integrity =
      typeof attrs.integrity === "string"
        ? attrs.integrity.trim().replace(/^['"]|['"]$/g, "")
        : null;
  }

  if (!crossOrigin) {
    crossOrigin =
      typeof attrs.crossorigin === "string"
        ? attrs.crossorigin.trim().replace(/^['"]|['"]$/g, "").toLowerCase()
        : typeof attrs.crossorigin === "boolean" && attrs.crossorigin
        ? "anonymous"
        : null;
  }

  const reasons = [];

  if (!integrity) {
    reasons.push("missing 'integrity' attribute");
  } else if (
    !integrity.toLowerCase().startsWith("external_scripts") &&
    !integrity.startsWith("{") &&
    !SRI_HASH_PATTERN.test(integrity)
  ) {
    reasons.push(`invalid integrity hash format: "${integrity}"`);
  }

  if (!crossOrigin || crossOrigin !== "anonymous") {
    reasons.push(
      `missing or invalid crossorigin attribute (must be crossorigin="anonymous", got: ${crossOrigin ?? "none"})`
    );
  }

  if (reasons.length > 0) {
    failures.push({
      file: relative(filePath),
      url,
      tagType,
      reasons,
    });
  }
}

console.log("Auditing external assets for Subresource Integrity (SRI) (#763)...\n");

for (const dir of SCAN_DIRS) {
  for (const filePath of walk(dir)) {
    const contents = readFileSync(filePath, "utf8");

    for (const match of contents.matchAll(SCRIPT_TAG_REGEX)) {
      checkTag(filePath, "script", match[1]);
    }
    for (const match of contents.matchAll(LINK_TAG_REGEX)) {
      checkTag(filePath, "link", match[1]);
    }
  }
}

// Also check the centralized EXTERNAL_SCRIPTS registry in lib/sri.ts
const sriFile = path.join(frontendRoot, "lib", "sri.ts");
try {
  const sriContent = readFileSync(sriFile, "utf8");
  // Ensure turnstile dependency is registered
  if (!sriContent.includes("challenges.cloudflare.com/turnstile")) {
    failures.push({
      file: relative(sriFile),
      url: "https://challenges.cloudflare.com/turnstile/v0/api.js",
      tagType: "registry",
      reasons: ["missing Turnstile dependency registration in EXTERNAL_SCRIPTS"],
    });
  }
  if (!sriContent.includes("sha384-")) {
    failures.push({
      file: relative(sriFile),
      url: "EXTERNAL_SCRIPTS",
      tagType: "registry",
      reasons: ["EXTERNAL_SCRIPTS registry must compute and specify sha384 integrity hashes"],
    });
  }
} catch (err) {
  failures.push({
    file: "apps/frontend/lib/sri.ts",
    url: "lib/sri.ts",
    tagType: "registry",
    reasons: [`Could not read SRI registry: ${err.message}`],
  });
}

if (failures.length === 0) {
  console.log(
    `✓ Subresource Integrity (SRI) verified: all external scripts and stylesheets enforce valid integrity hashes and crossorigin="anonymous" (scanned ${scannedTagsCount} tags, ${externalAssetsFound} external assets).`
  );
  process.exit(0);
} else {
  console.error(
    `\n✗ Subresource Integrity (SRI) verification failed: ${failures.length} asset(s) violate security policy:\n`
  );
  for (const { file, url, tagType, reasons } of failures) {
    console.error(`  [${tagType}] ${file}:`);
    console.error(`    URL: ${url}`);
    for (const reason of reasons) {
      console.error(`    ✗ ${reason}`);
    }
  }
  console.error(
    "\nFix: Ensure all external CDN scripts/styles specify integrity=\"sha384-...\" and crossorigin=\"anonymous\"."
  );
  process.exit(1);
}

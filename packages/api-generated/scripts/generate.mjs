#!/usr/bin/env node
/**
 * Regeneration entrypoint for @delegolabs/api-generated (#633).
 *
 * This script is the single command to update generated types after the
 * OpenAPI spec changes. It:
 *
 *   1. Reads packages/api-generated/openapi.yaml
 *   2. Computes the spec SHA-256 hash
 *   3. Writes the hash into src/index.ts (replacing placeholders)
 *
 * When the upstream gateway exposes a versioned artifact, swap step 1 with a
 * fetch of that artifact. The generated output must remain deterministic so
 * PR diffs are reviewable (same spec → same output, always) and Turborepo
 * remote cache hits are reliable across machines.
 *
 * Usage:
 *   pnpm --filter @delegolabs/api-generated generate
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// 1. Read spec
const specPath = join(ROOT, "openapi.yaml");
const specContent = readFileSync(specPath, "utf8");

// 2. Compute hash
const specHash = createHash("sha256").update(specContent).digest("hex").slice(0, 16);

// 3. Stamp the generated file — deterministic output (no timestamp) so that
//    Turborepo artifact hashes are stable across machines and CI runs.
const generatedPath = join(ROOT, "src", "index.ts");
let generated = readFileSync(generatedPath, "utf8");
generated = generated
  .replace(/\{\{SPEC_HASH\}\}/g, specHash)
  // Remove the GENERATED_AT placeholder line entirely for deterministic output.
  // The spec hash alone is sufficient to identify the generated artifact.
  .replace(/\s*Generated at:.*\n/g, "\n");

writeFileSync(generatedPath, generated, "utf8");

// 4. Write spec hash file (used by check-drift.mjs)
const hashFilePath = join(ROOT, "src", ".spec-hash");
writeFileSync(hashFilePath, specHash, "utf8");

console.log(`✓ Generated types stamped with spec hash ${specHash}`);
console.log(`  Source: ${specPath}`);
console.log(`  Output: ${generatedPath}`);
